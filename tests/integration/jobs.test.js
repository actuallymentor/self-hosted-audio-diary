import assert from "node:assert/strict"
import test from "node:test"

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
