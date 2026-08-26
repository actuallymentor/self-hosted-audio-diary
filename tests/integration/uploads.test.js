import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { bootstrap_client, start_test_server } from "../support/test_server.js"

const execute_file = promisify( execFile )

test( `resumes immutable chunks, finalizes media, and serves byte ranges`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const target = path.join( server.root, `fixture.wav` )

    await execute_file( `ffmpeg`, [
        `-nostdin`, `-loglevel`, `error`, `-y`,
        `-f`, `lavfi`, `-i`, `sine=frequency=440:duration=1`,
        `-c:a`, `pcm_s16le`, target,
    ] )

    const bytes = await fs.readFile( target )
    const digest = createHash( `sha256` ).update( bytes ).digest( `hex` )
    const upload_id = crypto.randomUUID()
    const created = await client.request( `/api/v1/uploads`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            item_type: `audio`,
            mime: `audio/wav`,
            upload_id,
        },
        method: `POST`,
    } )

    assert.equal( created.response.status, 200 )

    const [ part, duplicate ] = await Promise.all( [ 1, 2 ].map( () =>
        client.request( `/api/v1/uploads/${ upload_id }/chunks/0`, {
            body: bytes,
            headers: {
                [`Content-Length`]: String( bytes.length ),
                [`Content-Type`]: `application/octet-stream`,
                [`X-Content-SHA256`]: digest,
            },
            method: `PUT`,
        } )
    ) )

    assert.equal( part.response.status, 200 )
    assert.equal( duplicate.response.status, 200 )

    const completions = await Promise.all( [ 1, 2 ].map( () =>
        client.request( `/api/v1/uploads/${ upload_id }/complete`, {
            json: { chunk_hashes: [ digest ], total_bytes: bytes.length, whole_sha256: digest },
            method: `POST`,
        } )
    ) )
    const [ complete ] = completions

    assert.deepEqual( completions.map( value => value.response.status ), [ 200, 200 ] )
    assert.equal( complete.result.item_id, upload_id )

    const item = server.runtime.database.prepare( `
        SELECT items.relative_path, days.local_date
        FROM items JOIN days ON days.id = items.day_id
        WHERE items.id = ?
    ` ).get( upload_id )
    const [ profile ] = await fs.readdir( path.join( server.config.diary_data_path, `users` ) )
    const canonical = await fs.readFile( path.join(
        server.config.diary_data_path,
        `users`,
        profile,
        `days`,
        item.local_date,
        item.relative_path,
    ) )

    assert.equal( createHash( `sha256` ).update( canonical ).digest( `hex` ), digest )

    const media = await client.request( `/api/v1/media/${ upload_id }`, {
        headers: { Range: `bytes=0-15` },
    } )

    assert.equal( media.response.status, 206 )
    assert.equal( media.response.headers.get( `content-length` ), `16` )

    const suffix = await client.request( `/api/v1/media/${ upload_id }`, {
        headers: { Range: `bytes=-16` },
    } )
    const overlong = await client.request( `/api/v1/media/${ upload_id }`, {
        headers: { Range: `bytes=0-${ bytes.length * 2 }` },
    } )

    assert.equal( suffix.response.status, 206 )
    assert.equal( suffix.response.headers.get( `content-length` ), `16` )
    assert.equal( suffix.response.headers.get( `content-range` ), `bytes ${ bytes.length - 16 }-${ bytes.length - 1 }/${ bytes.length }` )
    assert.equal( overlong.response.status, 206 )
    assert.equal( overlong.response.headers.get( `content-length` ), String( bytes.length ) )

    const original_fetch = globalThis.fetch

    try {
        globalThis.fetch = async () => Response.json( {
            language: null,
            model: `large-v3`,
            text: ``,
        } )
        await server.runtime.job_handlers.transcription( server.runtime, {
            payload: { item_id: upload_id },
            user_id: user.id,
        } )
    } finally {
        globalThis.fetch = original_fetch
    }

    const silent_item = server.runtime.database.prepare( `SELECT display_text FROM items WHERE id = ?` )
        .get( upload_id )

    assert.equal( silent_item.display_text, `` )
} )

test( `expires only stale incomplete staging and retains client-retry semantics`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client } = await bootstrap_client( server.base_url )
    const bytes = Buffer.from( `unfinished upload part` )
    const digest = createHash( `sha256` ).update( bytes ).digest( `hex` )
    const upload_id = crypto.randomUUID()

    await client.request( `/api/v1/uploads`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            item_type: `audio`,
            mime: `audio/wav`,
            upload_id,
        },
        method: `POST`,
    } )
    await client.request( `/api/v1/uploads/${ upload_id }/chunks/0`, {
        body: bytes,
        headers: {
            [`Content-Length`]: String( bytes.length ),
            [`Content-Type`]: `application/octet-stream`,
            [`X-Content-SHA256`]: digest,
        },
        method: `PUT`,
    } )
    server.runtime.database.prepare( `UPDATE uploads SET updated_at = 0 WHERE id = ?` ).run( upload_id )

    const removed = await server.runtime.uploads.cleanup_expired_uploads( server.runtime )
    const status = await client.request( `/api/v1/uploads/${ upload_id }` )

    assert.equal( removed, 1 )
    assert.equal( status.response.status, 404 )
} )
