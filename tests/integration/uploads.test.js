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
    const { client } = await bootstrap_client( server.base_url )
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

    const part = await client.request( `/api/v1/uploads/${ upload_id }/chunks/0`, {
        body: bytes,
        headers: {
            [`Content-Length`]: String( bytes.length ),
            [`Content-Type`]: `application/octet-stream`,
            [`X-Content-SHA256`]: digest,
        },
        method: `PUT`,
    } )
    const duplicate = await client.request( `/api/v1/uploads/${ upload_id }/chunks/0`, {
        body: bytes,
        headers: {
            [`Content-Length`]: String( bytes.length ),
            [`Content-Type`]: `application/octet-stream`,
            [`X-Content-SHA256`]: digest,
        },
        method: `PUT`,
    } )

    assert.equal( part.response.status, 200 )
    assert.equal( duplicate.response.status, 200 )

    const complete = await client.request( `/api/v1/uploads/${ upload_id }/complete`, {
        json: { chunk_hashes: [ digest ], total_bytes: bytes.length, whole_sha256: digest },
        method: `POST`,
    } )

    assert.equal( complete.response.status, 200 )
    assert.equal( complete.result.item_id, upload_id )

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
