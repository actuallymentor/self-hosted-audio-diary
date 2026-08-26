import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { start_worker } from "../../src/server/jobs/worker.js"
import { bootstrap_client, start_test_server } from "../support/test_server.js"

const enabled = process.env.RUN_OPENROUTER_TESTS === `true`
    && process.env.RUN_TTS_TESTS === `true`
    && Boolean( process.env.OPENROUTER_API_KEY )
    && Boolean( process.env.TRANSCRIBER_BASE_URL )

function pcm_wav( pcm ) {
    const header = Buffer.alloc( 44 )

    header.write( `RIFF`, 0 )
    header.writeUInt32LE( 36 + pcm.length, 4 )
    header.write( `WAVE`, 8 )
    header.write( `fmt `, 12 )
    header.writeUInt32LE( 16, 16 )
    header.writeUInt16LE( 1, 20 )
    header.writeUInt16LE( 1, 22 )
    header.writeUInt32LE( 24_000, 24 )
    header.writeUInt32LE( 48_000, 28 )
    header.writeUInt16LE( 2, 32 )
    header.writeUInt16LE( 16, 34 )
    header.write( `data`, 36 )
    header.writeUInt32LE( pcm.length, 40 )

    return Buffer.concat( [ header, pcm ] )
}

async function synthesize( runtime, text ) {
    const pcm = await runtime.providers.openrouter_speech( runtime, text )

    return pcm_wav( pcm )
}

async function upload_audio( client, bytes, index ) {
    const digest = createHash( `sha256` ).update( bytes ).digest( `hex` )
    const upload_id = crypto.randomUUID()

    await client.request( `/api/v1/uploads`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:0${ index }:00.000Z`,
            },
            item_type: `audio`,
            mime: `audio/wav`,
            upload_id,
        },
        method: `POST`,
    } )
    const part = await client.request( `/api/v1/uploads/${ upload_id }/chunks/0`, {
        body: bytes,
        headers: {
            [`Content-Length`]: String( bytes.length ),
            [`Content-Type`]: `application/octet-stream`,
            [`X-Content-SHA256`]: digest,
        },
        method: `PUT`,
    } )
    const complete = await client.request( `/api/v1/uploads/${ upload_id }/complete`, {
        json: { chunk_hashes: [ digest ], total_bytes: bytes.length, whole_sha256: digest },
        method: `POST`,
    } )

    assert.equal( part.response.status, 200, JSON.stringify( part.result ) )
    assert.equal( complete.response.status, 200, JSON.stringify( complete.result ) )

    return upload_id
}

function normalized_words( text ) {
    return text.normalize( `NFKD` ).replaceAll( /\p{Diacritic}/gu, `` ).toLowerCase()
}

test( `real large-v3, reflection, and TTS complete through production adapters`, {
    skip: enabled ? false : `live provider switches, key, and TRANSCRIBER_BASE_URL are required`,
    timeout: 30 * 60 * 1000,
}, async t => {
    const server = await start_test_server( {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        OPENROUTER_REFLECTION_MODEL: process.env.OPENROUTER_MODEL,
        OPENROUTER_TTS_FORMAT: process.env.TTS_RESPONSE_FORMAT,
        OPENROUTER_TTS_MODEL: process.env.TTS_MODEL,
        OPENROUTER_TTS_VOICE: process.env.TTS_VOICE,
        OPENROUTER_ZDR: process.env.OPENROUTER_ZDR_ONLY,
        TRANSCRIPTION_URL: process.env.TRANSCRIBER_BASE_URL,
    } )
    const stop_worker = start_worker( server.runtime )

    t.after( async () => {
        await stop_worker()
        await server.close()
    } )

    const { client } = await bootstrap_client( server.base_url )
    const fixtures = [
        {
            expected: [ `cedar`, `lantern`, `river` ],
            text: `Cedar lantern remembers the quiet river.`,
        },
        {
            expected: [ `blauwe`, `fiets`, `molen` ],
            text: `De blauwe fiets staat naast de oude molen.`,
        },
        {
            expected: [ `today`, `gracht`, `friend` ],
            text: `Today I walked langs de rustige gracht with my friend.`,
        },
    ]
    const ids = []

    for( const [ index, fixture ] of fixtures.entries() ) {
        const audio = await synthesize( server.runtime, fixture.text )

        ids.push( await upload_audio( client, audio, index ) )
    }

    const deadline = Date.now() + 20 * 60 * 1000
    let jobs

    do {
        jobs = server.runtime.database.prepare( `SELECT status, last_error FROM jobs ORDER BY created_at` ).all()
        if( jobs.length === fixtures.length && jobs.every( job => job.status === `complete` ) ) break
        if( jobs.some( job => job.status === `failed` ) ) assert.fail( JSON.stringify( jobs ) )
        await new Promise( resolve => setTimeout( resolve, 2_000 ) )
    } while( Date.now() < deadline )

    assert.equal( jobs.every( job => job.status === `complete` ), true, JSON.stringify( jobs ) )

    const day = await client.request( `/api/v1/days/2026-08-25` )

    for( const [ index, id ] of ids.entries() ) {
        const transcript = normalized_words(
            day.result.items.find( item => item.id === id ).display_transcript,
        )
        const matches = fixtures[index].expected.filter( word => transcript.includes( word ) )

        assert.ok( matches.length >= 2, `${ fixtures[index].text } -> ${ transcript }` )
    }

    const note_id = crypto.randomUUID()

    await client.request( `/api/v1/days/2026-08-25/text`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T18:00:00.000Z`,
            },
            item_id: note_id,
            text: `The quiet river and the old windmill both made me feel grounded.`,
        },
        method: `POST`,
    } )
    const reflection = await client.request( `/api/v1/reflections`, {
        json: {
            question: `What helped me feel grounded?`,
            range_end: `2026-08-25`,
            range_start: `2026-08-25`,
        },
        method: `POST`,
    } )

    assert.equal( reflection.response.status, 200 )
    assert.ok( reflection.result.answer.length > 10 )
    assert.ok( reflection.result.citations.length > 0 )

    const speech = await client.request( `/api/v1/reflections/${ reflection.result.id }/speech`, {
        method: `POST`,
    } )
    const reflection_row = server.runtime.database.prepare( `SELECT relative_path FROM reflections WHERE id = ?` )
        .get( reflection.result.id )
    const [ profile ] = await fs.readdir( path.join( server.config.diary_data_path, `users` ) )
    const speech_path = path.join(
        server.config.diary_data_path,
        `users`,
        profile,
        reflection_row.relative_path.replace( /\.md$/, `.mp3` ),
    )
    const speech_stat = await fs.stat( speech_path )

    assert.equal( speech.response.status, 200 )
    assert.ok( speech_stat.size > 1_000 )
} )
