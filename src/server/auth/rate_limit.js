import { createHash } from "node:crypto"

import { HttpError } from "../http/errors.js"

const window_ms = 15 * 60 * 1000

function bucket_key( scope, value ) {
    return createHash( `sha256` ).update( `${ scope }\0${ value }` ).digest( `hex` )
}

/**
 * Enforce global and submitted-identifier buckets without trusting client IPs.
 *
 * @param {import('better-sqlite3').Database} database
 * @param {string} scope
 * @param {string} submitted_value
 */
export function check_rate_limit( database, scope, submitted_value ) {
    const now = Date.now()
    const buckets = [ bucket_key( scope, `global` ), bucket_key( scope, submitted_value ) ]
    const limits = [ 100, 10 ]

    for( const [ index, bucket ] of buckets.entries() ) {
        const row = database.prepare( `SELECT * FROM login_attempts WHERE bucket = ?` ).get( bucket )

        if( row?.blocked_until > now ) {
            throw new HttpError( 429, `rate_limited`, `Too many attempts. Try again later.` )
        }

        const attempts = !row || now - row.window_started_at > window_ms ? 1 : row.attempts + 1
        const window_started_at = !row || now - row.window_started_at > window_ms
            ? now
            : row.window_started_at
        const blocked_until = attempts > limits[index] ? now + window_ms : 0

        database.prepare( `
      INSERT INTO login_attempts (bucket, attempts, window_started_at, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(bucket) DO UPDATE SET
        attempts = excluded.attempts,
        window_started_at = excluded.window_started_at,
        blocked_until = excluded.blocked_until
    ` ).run( bucket, attempts, window_started_at, blocked_until )

        if( blocked_until ) {
            throw new HttpError( 429, `rate_limited`, `Too many attempts. Try again later.` )
        }
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
