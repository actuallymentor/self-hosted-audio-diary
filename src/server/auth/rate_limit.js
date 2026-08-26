import { createHash } from "node:crypto"

const window_ms = 15 * 60 * 1000
const maximum_parallel_attempts = 4
const database_states = new WeakMap()

function state_for( database ) {
    if( !database_states.has( database ) ) {
        database_states.set( database, { active: 0, locks: new Map(), waiters: [] } )
    }

    return database_states.get( database )
}

async function acquire_capacity( state ) {
    if( state.active < maximum_parallel_attempts ) {
        state.active += 1
        return
    }

    await new Promise( resolve => state.waiters.push( resolve ) )
}

function release_capacity( state ) {
    const next = state.waiters.shift()

    if( next ) next()
    else state.active -= 1
}

function bucket_key( scope, value ) {
    return createHash( `sha256` ).update( `${ scope }\0${ value }` ).digest( `hex` )
}

/**
 * Record global and submitted-identifier pressure and return a bounded delay.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {string} scope
 * @param {string} submitted_value
 * @returns {number}
 */
export function check_rate_limit( database, scope, submitted_value ) {
    const now = Date.now()
    const buckets = [ bucket_key( scope, `global` ), bucket_key( scope, submitted_value ) ]
    const delay_after = [ 100, 5 ]
    const delay_steps = [ 25, 250 ]
    let delay_ms = 0

    for( const [ index, bucket ] of buckets.entries() ) {
        const row = database.prepare( `SELECT * FROM login_attempts WHERE bucket = ?` ).get( bucket )
        const attempts = !row || now - row.window_started_at > window_ms ? 1 : row.attempts + 1
        const window_started_at = !row || now - row.window_started_at > window_ms
            ? now
            : row.window_started_at
        const bounded_delay = Math.min( 30_000, Math.max( 0, attempts - delay_after[index] ) * delay_steps[index] )

        delay_ms = Math.max( delay_ms, bounded_delay )

        database.prepare( `
      INSERT INTO login_attempts (bucket, attempts, window_started_at, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(bucket) DO UPDATE SET
        attempts = excluded.attempts,
        window_started_at = excluded.window_started_at,
        blocked_until = excluded.blocked_until
    ` ).run( bucket, attempts, window_started_at, 0 )
    }

    return delay_ms
}

/**
 * Serialize one submitted identifier and bound global in-flight authentication.
 *
 * @template Result
 * @param {import('better-sqlite3').Database} database
 * @param {string} scope
 * @param {string} submitted_value
 * @param {() => Promise<Result>} authenticate
 * @returns {Promise<Result>}
 */
export async function with_rate_limit( database, scope, submitted_value, authenticate ) {
    const state = state_for( database )
    const key = bucket_key( scope, submitted_value )
    const previous = state.locks.get( key ) ?? Promise.resolve()
    let release
    const current = new Promise( resolve => {
        release = resolve
    } )
    const queued = previous.then( () => current )

    state.locks.set( key, queued )
    await previous
    await acquire_capacity( state )

    try {
        const delay_ms = check_rate_limit( database, scope, submitted_value )

        if( delay_ms ) await new Promise( resolve => setTimeout( resolve, delay_ms ) )

        return await authenticate()
    } finally {
        release_capacity( state )
        release()

        if( state.locks.get( key ) === queued ) state.locks.delete( key )
    }
}

/**
 * Clear one submitted-identifier bucket after successful authentication.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {string} scope
 * @param {string} submitted_value
 */
export function clear_rate_limit( database, scope, submitted_value ) {
    database
        .prepare( `DELETE FROM login_attempts WHERE bucket = ?` )
        .run( bucket_key( scope, submitted_value ) )
}
