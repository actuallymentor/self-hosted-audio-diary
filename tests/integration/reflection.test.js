import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { bootstrap_client, start_test_server } from "../support/test_server.js"

const execute_file = promisify( execFile )

test( `validates citations and saves a human-readable reflection`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const item_id = crypto.randomUUID()

    await client.request( `/api/v1/days/2026-08-25/text`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            item_id,
            text: `A long walk restored my energy.`,
        },
        method: `POST`,
    } )

    server.runtime.providers.openrouter_request = async () => ( {
        choices: [ { message: { content: JSON.stringify( {
            answer: `Walking restored your energy [2026-08-25:${ item_id }].`,
            citations: [ `2026-08-25:${ item_id }` ],
        } ) } } ],
        usage: { completion_tokens: 10, prompt_tokens: 20 },
    } )

    const reflection = await server.runtime.reflections.create_reflection( server.runtime, user, {
        question: `What restored my energy?`,
        range_end: `2026-08-25`,
        range_start: `2026-08-25`,
    } )
    const row = server.runtime.database.prepare( `
        SELECT relative_path FROM reflections WHERE id = ?
    ` ).get( reflection.id )
    const [ profile_root ] = await fs.readdir( `${ server.config.diary_data_path }/users` )
    const markdown = await fs.readFile(
        `${ server.config.diary_data_path }/users/${ profile_root }/${ row.relative_path }`,
        `utf8`,
    )

    assert.match( markdown, /What restored my energy/ )
    assert.match( markdown, new RegExp( item_id ) )
} )

test( `hierarchical reflection covers every oversized source`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const item_ids = []

    for( let index = 0; index < 3; index += 1 ) {
        const item_id = crypto.randomUUID()

        item_ids.push( item_id )
        await client.request( `/api/v1/days/2026-08-2${ 3 + index }/text`, {
            json: {
                capture: {
                    local_date: `2026-08-2${ 3 + index }`,
                    offset_minutes: 0,
                    timezone: `UTC`,
                    utc: `2026-08-2${ 3 + index }T12:00:00.000Z`,
                },
                item_id,
                text: `${ `Source ${ index } remembers a distinct bridge. ` }${ `detail `.repeat( 4_000 ) }`,
            },
            method: `POST`,
        } )
    }

    let calls = 0
    server.runtime.providers.openrouter_request = async ( runtime, body ) => {
        calls += 1
        const prompt = body.messages.at( -1 ).content
        const citations = [ ...new Set( prompt.match( /\[\d{4}-\d{2}-\d{2}:[a-f0-9-]+\]/g ) ?? [] ) ]

        return {
            choices: [ { message: { content: JSON.stringify( {
                answer: `Covered ${ citations.join( ` ` ) }`,
                citations,
            } ) } } ],
            usage: {},
        }
    }

    const reflection = await server.runtime.reflections.create_reflection( server.runtime, user, {
        question: `Which bridges mattered?`,
        range_end: `2026-08-25`,
        range_start: `2026-08-23`,
    } )

    assert.ok( calls > 1 )
    assert.deepEqual( reflection.citations.map( value => value.slice( 12, -1 ) ).sort(), item_ids.sort() )
} )

test( `wraps live-shaped PCM speech as a playable archived MP3`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const item_id = crypto.randomUUID()

    await client.request( `/api/v1/days/2026-08-25/text`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            item_id,
            text: `A calm morning by the sea.`,
        },
        method: `POST`,
    } )
    server.runtime.providers.openrouter_request = async () => ( {
        choices: [ { message: { content: JSON.stringify( {
            answer: `The sea brought calm.`,
            citations: [ `[2026-08-25:${ item_id }]` ],
        } ) } } ],
        usage: {},
    } )
    const reflection = await server.runtime.reflections.create_reflection( server.runtime, user, {
        question: `What felt calm?`,
        range_end: `2026-08-25`,
        range_start: `2026-08-25`,
    } )
    const samples = Buffer.alloc( 24_000 * 2 )

    for( let index = 0; index < 24_000; index += 1 ) {
        samples.writeInt16LE( Math.round( Math.sin( index / 24_000 * 440 * Math.PI * 2 ) * 8_000 ), index * 2 )
    }

    server.runtime.providers.openrouter_speech = async () => samples

    await server.runtime.tts.reflection_speech( server.runtime, user, reflection.id )

    const row = server.runtime.database.prepare( `SELECT relative_path FROM reflections WHERE id = ?` )
        .get( reflection.id )
    const [ profile ] = await fs.readdir( path.join( server.config.diary_data_path, `users` ) )
    const target = path.join(
        server.config.diary_data_path,
        `users`,
        profile,
        row.relative_path.replace( /\.md$/, `.mp3` ),
    )
    const { stdout } = await execute_file( `ffprobe`, [
        `-v`, `error`,
        `-show_entries`, `format=format_name,duration`,
        `-of`, `json`,
        target,
    ] )
    const probe = JSON.parse( stdout )

    assert.match( probe.format.format_name, /mp3/ )
    assert.ok( Number( probe.format.duration ) > 0.9 )
} )
