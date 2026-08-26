import { randomUUID } from "node:crypto"

/**
 * Start one bounded durable job worker and return its shutdown callback.
 *
 * @param {object} runtime
 * @returns {() => Promise<void>}
 */
export function start_worker( runtime ) {
    const worker_id = randomUUID()
    let in_flight = null
    let stopped = false

    async function poll() {
        const job = runtime.jobs.lease( runtime, worker_id )

        if( !job ) return

        try {
            const handler = runtime.job_handlers[job.type]

            if( !handler ) throw new Error( `Unknown job type: ${ job.type }` )

            await handler( runtime, job )
            runtime.jobs.finish( runtime, job )
        } catch ( error ) {
            runtime.log.error( `Job failed`, { error: error.message, job_id: job.id, type: job.type } )
            runtime.jobs.finish( runtime, job, error )
        }
    }

    function run_poll() {
        if( in_flight || stopped ) return

        in_flight = poll().finally( () => {
            in_flight = null
        } )
    }

    const timer = setInterval( run_poll, 1_000 )
    timer.unref()
    run_poll()

    return async () => {
        stopped = true
        clearInterval( timer )
        await in_flight
    }
}
