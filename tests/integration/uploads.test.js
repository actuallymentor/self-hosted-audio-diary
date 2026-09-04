import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { reconcile_archive } from "../../src/server/archive/reconcile.js"
import { create_runtime } from "../../src/server/runtime/create_runtime.js"
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

    const original_jobs = server.runtime.jobs

    server.runtime.jobs = {
        ...original_jobs,
        enqueue() {
            throw new Error( `Injected enqueue interruption` )
        },
    }

    const interrupted = await client.request( `/api/v1/uploads/${ upload_id }/complete`, {
        json: { chunk_hashes: [ digest ], total_bytes: bytes.length, whole_sha256: digest },
        method: `POST`,
    } )
    const interrupted_upload = server.runtime.database.prepare( `
        SELECT status FROM uploads WHERE id = ?
    ` ).get( upload_id )
    const retained_chunks = server.runtime.database.prepare( `
        SELECT COUNT(*) AS count FROM upload_chunks WHERE upload_id = ?
    ` ).get( upload_id ).count

    assert.equal( interrupted.response.status, 500 )
    assert.equal( interrupted_upload.status, `receiving` )
    assert.equal( retained_chunks, 1 )
    assert.equal( server.runtime.database.prepare( `SELECT COUNT(*) AS count FROM jobs` ).get().count, 0 )

    server.runtime.jobs = original_jobs

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

    const queued_day = await client.request( `/api/v1/days/2026-08-25` )

    assert.deepEqual( queued_day.result.items[0].recording_status, {
        remote: `present`,
        transcription: `queued`,
    } )

    const transcription_job = server.runtime.jobs.lease( server.runtime, `test-worker` )
    const transcribing_day = await client.request( `/api/v1/days/2026-08-25` )

    assert.equal( transcribing_day.result.items[0].recording_status.transcription, `transcribing` )

    const original_fetch = server.runtime.transcription_fetch

    try {
        server.runtime.transcription_fetch = async () => Response.json( {
            language: null,
            model: `large-v3`,
            text: ``,
        } )
        await server.runtime.job_handlers.transcription( server.runtime, transcription_job )
        server.runtime.jobs.finish( server.runtime, transcription_job )
    } finally {
        server.runtime.transcription_fetch = original_fetch
    }

    const silent_item = server.runtime.database.prepare( `SELECT display_text FROM items WHERE id = ?` )
        .get( upload_id )

    assert.equal( silent_item.display_text, `` )

    const complete_day = await client.request( `/api/v1/days/2026-08-25` )

    assert.equal( complete_day.result.items[0].recording_status.transcription, `complete` )

    const recovered_app = path.join( server.root, `recovered-app` )
    const recovered_runtime = create_runtime( {
        ...server.config,
        APP_DATA_PATH: recovered_app,
        app_data_path: recovered_app,
        database_path: path.join( recovered_app, `shad.sqlite` ),
    } )

    t.after( () => recovered_runtime.database.close() )
    await reconcile_archive( recovered_runtime )

    assert.deepEqual(
        recovered_runtime.database.prepare( `SELECT status, attempts FROM jobs` ).get(),
        { attempts: 0, status: `complete` },
    )
    assert.equal( recovered_runtime.jobs.repair_missing_transcriptions( recovered_runtime ), 0 )
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
    server.runtime.database.prepare( `UPDATE uploads SET finalizing_at = ? WHERE id = ?` )
        .run( Date.now(), upload_id )

    const recovered = server.runtime.uploads.recover_interrupted_finalizations( server.runtime )
    const { finalizing_at } = server.runtime.database
        .prepare( `SELECT finalizing_at FROM uploads WHERE id = ?` )
        .get( upload_id )

    assert.equal( recovered, 1 )
    assert.equal( finalizing_at, null )

    server.runtime.database.prepare( `UPDATE uploads SET updated_at = 0 WHERE id = ?` ).run( upload_id )

    const removed = await server.runtime.uploads.cleanup_expired_uploads( server.runtime )
    const status = await client.request( `/api/v1/uploads/${ upload_id }` )

    assert.equal( removed, 1 )
    assert.equal( status.response.status, 404 )
} )
