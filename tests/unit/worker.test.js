import assert from "node:assert/strict"
import test from "node:test"

import { start_worker } from "../../src/server/jobs/worker.js"

test( `worker shutdown waits for in-flight work`, async () => {
    const started = Promise.withResolvers()
    const release = Promise.withResolvers()
    const finished = []
    let leased = false
    const runtime = {
        job_handlers: {
            transcription: async () => {
                started.resolve()
                await release.promise
            },
        },
        jobs: {
            finish: ( _, job ) => finished.push( job.id ),
            lease: () => {
                if( leased ) return null

                leased = true
                return { id: `job-1`, type: `transcription` }
            },
        },
        log: { error: () => {} },
    }
    const stop_worker = start_worker( runtime )

    await started.promise
    let stopped = false
    const stopping = stop_worker().then( () => {
        stopped = true
    } )

    await new Promise( resolve => setImmediate( resolve ) )
    assert.equal( stopped, false )

    release.resolve()
    await stopping

    assert.equal( stopped, true )
    assert.deepEqual( finished, [ `job-1` ] )
} )
