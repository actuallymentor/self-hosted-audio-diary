import { randomUUID } from "node:crypto"

function safe_error_code( job, error ) {
    const transcriber_status = String( error.message ?? `` ).match( /^Transcriber returned (\d{3})$/ )
    const cause_code = String( error.cause?.code ?? `` ).toUpperCase()

    if( transcriber_status ) return `transcriber_http_${ transcriber_status[1] }`
    if( cause_code === `UND_ERR_HEADERS_TIMEOUT` ) return `transcriber_timeout`
    if( job.type === `transcription` && cause_code ) return `transcriber_unavailable`
    if( typeof error.code === `string` && /^[a-z0-9_]{1,80}$/i.test( error.code ) ) {
        return error.code.toLowerCase()
    }

    return `${ job.type }_failed`
}

function retry_without_limit( job, error ) {
    if( job.type !== `transcription` ) return false

    const transcriber_status = String( error.message ?? `` ).match( /^Transcriber returned (\d{3})$/ )
    const cause_code = String( error.cause?.code ?? `` ).toUpperCase()
    const status = Number( transcriber_status?.[1] )

    if( [ 408, 425, 429 ].includes( status ) || status >= 500 ) return true
    if( cause_code === `UND_ERR_HEADERS_TIMEOUT` ) return false

    return error.message === `fetch failed` || Boolean( cause_code )
}

/**
 * Enqueue one idempotent at-least-once job.
 *
 * @param {object} runtime
 * @param {object} job
 * @returns {string}
 */
export function enqueue( runtime, job ) {
    const id = randomUUID()
    const now = Date.now()

    runtime.database.prepare( `
    INSERT INTO jobs (
      id, user_id, type, dedupe_key, payload_json, status,
      attempts, run_after, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
    ON CONFLICT(type, dedupe_key) DO UPDATE SET
      status = CASE WHEN jobs.status = 'complete' THEN jobs.status ELSE 'queued' END,
      run_after = CASE WHEN jobs.status = 'complete' THEN jobs.run_after ELSE excluded.run_after END,
      updated_at = excluded.updated_at
  ` ).run(
        id,
        job.user_id,
        job.type,
        job.dedupe_key,
        JSON.stringify( job.payload ),
        now,
        now,
        now,
    )

    return runtime.database
        .prepare( `SELECT id FROM jobs WHERE type = ? AND dedupe_key = ?` )
        .get( job.type, job.dedupe_key ).id
}

/**
 * Explicitly retry one failed or missing idempotent job.
 *
 * @param {object} runtime
 * @param {object} job
 * @returns {string}
 */
export function retry( runtime, job ) {
    const existing = runtime.database.prepare( `
        SELECT id, status FROM jobs WHERE type = ? AND dedupe_key = ?
    ` ).get( job.type, job.dedupe_key )

    if( !existing ) return enqueue( runtime, job )
    if( existing.status === `complete` ) return existing.id

    runtime.database.prepare( `
        UPDATE jobs SET status = 'queued', attempts = 0, run_after = ?,
          lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
        WHERE id = ?
    ` ).run( Date.now(), Date.now(), existing.id )

    return existing.id
}

/**
 * Lease the oldest available job for one worker.
 *
 * @param {object} runtime
 * @param {string} worker_id
 * @returns {object | null}
 */
export function lease( runtime, worker_id ) {
    const now = Date.now()
    const candidate = runtime.database.prepare( `
    SELECT * FROM jobs
    WHERE (
      status = 'queued'
      OR (status = 'running' AND lease_expires_at < ?)
    )
      AND run_after <= ?
    ORDER BY created_at
    LIMIT 1
  ` ).get( now, now )

    if( !candidate ) return null

    const changed = runtime.database.prepare( `
    UPDATE jobs
    SET status = 'running', lease_owner = ?, lease_expires_at = ?,
        attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND (
      status = 'queued'
      OR (status = 'running' AND lease_expires_at < ?)
    )
  ` ).run( worker_id, now + 60_000, now, candidate.id, now )

    if( changed.changes !== 1 ) return null

    return {
        ...candidate,
        payload: JSON.parse( candidate.payload_json ),
    }
}

/**
 * Finish or retry a leased job without losing its source material.
 *
 * @param {object} runtime
 * @param {object} job
 * @param {Error | null} error
 */
export function finish( runtime, job, error = null ) {
    if( !error ) {
        runtime.database.prepare( `
      UPDATE jobs SET status = 'complete', lease_owner = NULL,
        lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE id = ?
    ` ).run( Date.now(), job.id )
        return
    }

    const attempts = job.attempts + 1
    const terminal = attempts >= 8 && !retry_without_limit( job, error )
    const backoff = Math.min( 60 * 60 * 1000, 2 ** Math.min( attempts, 12 ) * 1000 )

    runtime.database.prepare( `
    UPDATE jobs SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
      run_after = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  ` ).run(
        terminal ? `failed` : `queued`,
        Date.now() + backoff,
        safe_error_code( job, error ),
        Date.now(),
        job.id,
    )
}

/**
 * Restore transcription jobs lost between durable media creation and enqueue.
 *
 * @param {object} runtime
 * @returns {number}
 */
export function repair_missing_transcriptions( runtime ) {
    const missing = runtime.database.prepare( `
        SELECT items.id, items.sha256, items.user_id
        FROM items
        LEFT JOIN jobs ON jobs.type = 'transcription'
          AND json_extract(jobs.payload_json, '$.item_id') = items.id
        WHERE items.type = 'audio' AND items.deleted_at IS NULL AND jobs.id IS NULL
    ` ).all()

    missing.forEach( item => enqueue( runtime, {
        dedupe_key: `${ item.id }:${ item.sha256 }`,
        payload: { item_id: item.id },
        type: `transcription`,
        user_id: item.user_id,
    } ) )

    return missing.length
}
