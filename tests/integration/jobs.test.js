import assert from "node:assert/strict"
import test from "node:test"

import { migrate_database } from "../../src/server/db/migrate.js"
import { bootstrap_client, start_test_server } from "../support/test_server.js"

test( `job status exposes a safe code instead of archive paths`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const id = server.runtime.jobs.enqueue( server.runtime, {
        dedupe_key: crypto.randomUUID(),
        payload: { item_id: crypto.randomUUID() },
        type: `transcription`,
        user_id: user.id,
    } )
    const job = server.runtime.jobs.lease( server.runtime, `test-worker` )

    server.runtime.jobs.finish(
        server.runtime,
        job,
        new Error( `Command failed: ffmpeg -i /data/diary/users/private/audio.webm` ),
    )

    const status = await client.request( `/api/v1/jobs` )
    const failed = status.result.jobs.find( candidate => candidate.id === id )

    assert.equal( failed.last_error, `transcription_failed` )
    assert.doesNotMatch( failed.last_error, /\/data\// )
} )

test( `keeps unavailable transcription queued without overflowing its backoff`, async t => {
    const server = await start_test_server()

    t.after( () => server.close() )

    const { user } = await bootstrap_client( server.base_url )
    const id = server.runtime.jobs.enqueue( server.runtime, {
        dedupe_key: crypto.randomUUID(),
        payload: { item_id: crypto.randomUUID() },
        type: `transcription`,
        user_id: user.id,
    } )

    for( let attempt = 0; attempt < 20; attempt += 1 ) {
        const job = server.runtime.jobs.lease( server.runtime, `test-worker` )
        const error = new TypeError( `fetch failed`, {
            cause: { code: `ECONNREFUSED` },
        } )

        server.runtime.jobs.finish( server.runtime, job, error )
        server.runtime.database.prepare( `UPDATE jobs SET run_after = 0 WHERE id = ?` ).run( id )
    }

    const job = server.runtime.database.prepare( `
        SELECT status, attempts, last_error, run_after FROM jobs WHERE id = ?
    ` ).get( id )

    assert.equal( job.status, `queued` )
    assert.equal( job.attempts, 20 )
    assert.equal( job.last_error, `transcriber_unavailable` )
    assert.equal( Number.isSafeInteger( job.run_after ), true )
} )

test( `makes repeated transcription timeouts terminal`, async t => {
    const server = await start_test_server()

    t.after( () => server.close() )

    const { user } = await bootstrap_client( server.base_url )
    const id = server.runtime.jobs.enqueue( server.runtime, {
        dedupe_key: crypto.randomUUID(),
        payload: { item_id: crypto.randomUUID() },
        type: `transcription`,
        user_id: user.id,
    } )

    for( let attempt = 0; attempt < 8; attempt += 1 ) {
        const job = server.runtime.jobs.lease( server.runtime, `test-worker` )
        const error = new TypeError( `fetch failed`, {
            cause: { code: `UND_ERR_HEADERS_TIMEOUT` },
        } )

        server.runtime.jobs.finish( server.runtime, job, error )
        server.runtime.database.prepare( `UPDATE jobs SET run_after = 0 WHERE id = ?` ).run( id )
    }

    assert.deepEqual(
        server.runtime.database.prepare( `SELECT status, last_error FROM jobs WHERE id = ?` ).get( id ),
        { last_error: `transcriber_timeout`, status: `failed` },
    )
} )

test( `makes permanent transcription errors terminal and explicitly retryable`, async t => {
    const server = await start_test_server()

    t.after( () => server.close() )

    const { user } = await bootstrap_client( server.base_url )
    const job_spec = {
        dedupe_key: crypto.randomUUID(),
        payload: { item_id: crypto.randomUUID() },
        type: `transcription`,
        user_id: user.id,
    }
    const id = server.runtime.jobs.enqueue( server.runtime, job_spec )

    for( let attempt = 0; attempt < 8; attempt += 1 ) {
        const job = server.runtime.jobs.lease( server.runtime, `test-worker` )

        server.runtime.jobs.finish( server.runtime, job, new Error( `Transcriber returned 422` ) )
        server.runtime.database.prepare( `UPDATE jobs SET run_after = 0 WHERE id = ?` ).run( id )
    }

    assert.equal(
        server.runtime.database.prepare( `SELECT status FROM jobs WHERE id = ?` ).get( id ).status,
        `failed`,
    )
    assert.equal( server.runtime.jobs.retry( server.runtime, job_spec ), id )
    assert.deepEqual(
        server.runtime.database.prepare( `SELECT status, attempts, last_error FROM jobs WHERE id = ?` ).get( id ),
        { attempts: 0, last_error: null, status: `queued` },
    )
} )

test( `repairs missing and previously failed transcription jobs`, async t => {
    const server = await start_test_server()

    t.after( () => server.close() )

    const { user } = await bootstrap_client( server.base_url )
    const item = {
        byte_size: 42,
        capture: {
            local_date: `2026-09-01`,
            offset_minutes: 0,
            timezone: `UTC`,
            utc: `2026-09-01T12:00:00.000Z`,
        },
        id: crypto.randomUUID(),
        mime: `audio/webm`,
        path: `audio/test.webm`,
        sha256: `a`.repeat( 64 ),
        type: `audio`,
    }

    server.runtime.diary.project_item( server.runtime, user, `2026-09-01`, item )

    assert.equal( server.runtime.jobs.repair_missing_transcriptions( server.runtime ), 1 )
    assert.equal( server.runtime.jobs.repair_missing_transcriptions( server.runtime ), 0 )

    const job = server.runtime.database.prepare( `SELECT id FROM jobs` ).get()

    server.runtime.database.prepare( `
        UPDATE jobs SET status = 'failed', attempts = 8, last_error = 'transcription_failed'
        WHERE id = ?
    ` ).run( job.id )
    server.runtime.database.prepare( `DELETE FROM schema_migrations WHERE version = 3` ).run()
    migrate_database( server.runtime.database )

    assert.deepEqual(
        server.runtime.database.prepare( `SELECT status, attempts, last_error FROM jobs WHERE id = ?` ).get( job.id ),
        { attempts: 0, last_error: null, status: `queued` },
    )
} )
