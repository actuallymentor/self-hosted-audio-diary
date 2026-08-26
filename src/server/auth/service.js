import { randomUUID } from "node:crypto"

import argon2 from "argon2"

import {
    archive_has_profiles,
    remove_provisioning_profile,
    write_profile,
} from "../archive/profile_store.js"
import { HttpError } from "../http/errors.js"
import { digest_token, normalize_email, random_token } from "./crypto.js"
import { clear_rate_limit, with_rate_limit } from "./rate_limit.js"

const password_options = {
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id,
}

function rollback_bootstrap( runtime, user_id, claimed_at ) {
    runtime.database.transaction( () => {
        const removed = runtime.database.prepare( `
            DELETE FROM users WHERE id = ? AND status = 'provisioning'
        ` ).run( user_id )

        if( removed.changes ) {
            runtime.database.prepare( `
                UPDATE bootstrap_state SET claimed_at = NULL
                WHERE singleton = 1 AND claimed_at = ?
            ` ).run( claimed_at )
        }
    } )()
}

function rollback_registration( runtime, user_id, invitation_id, consumed_at ) {
    runtime.database.transaction( () => {
        const removed = runtime.database.prepare( `
            DELETE FROM users WHERE id = ? AND status = 'provisioning'
        ` ).run( user_id )

        if( removed.changes ) {
            runtime.database.prepare( `
                UPDATE invitations SET consumed_at = NULL
                WHERE id = ? AND consumed_at = ?
            ` ).run( invitation_id, consumed_at )
        }
    } )()
}

/**
 * Return whether this truly empty installation may claim its first administrator.
 *
 * @param {object} runtime
 * @returns {Promise<boolean>}
 */
export async function bootstrap_available( runtime ) {
    const users = runtime.database.prepare( `SELECT COUNT(*) AS count FROM users` ).get().count

    if( users > 0 ) return false

    return !await archive_has_profiles( runtime.config.diary_data_path )
}

/**
 * Claim the first administrator exactly once.
 *
 * @param {object} runtime
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function bootstrap( runtime, { email, password } ) {
    if( !await bootstrap_available( runtime ) ) {
        throw new HttpError( 409, `bootstrap_unavailable`, `First-user setup is unavailable.` )
    }

    const user_id = randomUUID()
    const now = Date.now()
    const email_normalized = normalize_email( email )
    const password_hash = await argon2.hash( password, password_options )

    try {
        runtime.database.transaction( () => {
            const state = runtime.database
                .prepare( `SELECT claimed_at FROM bootstrap_state WHERE singleton = 1` )
                .get()

            if( state.claimed_at ) throw new HttpError( 409, `bootstrap_unavailable`, `First-user setup is unavailable.` )

            runtime.database.prepare( `
        UPDATE bootstrap_state SET claimed_at = ? WHERE singleton = 1 AND claimed_at IS NULL
      ` ).run( now )
            runtime.database.prepare( `
        INSERT INTO users (id, email, email_normalized, password_hash, role, status, created_at)
        VALUES (?, ?, ?, ?, 'admin', 'provisioning', ?)
      ` ).run( user_id, email.trim(), email_normalized, password_hash, now )
        } )()
    } catch ( error ) {
        if( error instanceof HttpError ) throw error
        throw new HttpError( 409, `bootstrap_unavailable`, `First-user setup is unavailable.` )
    }

    try {
        await write_profile( {
            diary_root: runtime.config.diary_data_path,
            email: email.trim(),
            role: `admin`,
            user_id,
        } )
        runtime.database.prepare( `UPDATE users SET status = 'active' WHERE id = ?` ).run( user_id )
    } catch {
        await remove_provisioning_profile( {
            diary_root: runtime.config.diary_data_path,
            email: email.trim(),
            user_id,
        } ).catch( () => {} )
        rollback_bootstrap( runtime, user_id, now )
        throw new HttpError( 503, `provisioning_unavailable`, `Account storage is temporarily unavailable.` )
    }

    return runtime.database.prepare( `SELECT id, email, role FROM users WHERE id = ?` ).get( user_id )
}

/**
 * Verify credentials using a generic failure response and bounded rate policy.
 *
 * @param {object} runtime
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function login( runtime, { email, password } ) {
    const email_normalized = normalize_email( email )

    return with_rate_limit( runtime.database, `login`, email_normalized, async () => {
        const user = runtime.database
            .prepare( `SELECT * FROM users WHERE email_normalized = ? AND status = 'active'` )
            .get( email_normalized )
        const valid = user ? await argon2.verify( user.password_hash, password ) : false

        if( !valid ) {
            throw new HttpError( 401, `invalid_credentials`, `Email or password is incorrect.` )
        }

        clear_rate_limit( runtime.database, `login`, email_normalized )

        return { email: user.email, id: user.id, role: user.role }
    } )
}

/**
 * Create a session and return raw browser-only credentials once.
 *
 * @param {object} runtime
 * @param {string} user_id
 * @returns {object}
 */
export function create_session( runtime, user_id ) {
    const token = random_token()
    const csrf = random_token()
    const now = Date.now()
    const expires_at = now + runtime.config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

    runtime.database.prepare( `
    INSERT INTO sessions (id, user_id, token_hash, csrf_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  ` ).run( randomUUID(), user_id, digest_token( token ), digest_token( csrf ), expires_at, now )

    return { csrf, expires_at, token }
}

/**
 * Resolve an active session from an opaque cookie token.
 *
 * @param {object} runtime
 * @param {string | undefined} token
 * @returns {object | null}
 */
export function resolve_session( runtime, token ) {
    if( !token ) return null

    return runtime.database.prepare( `
    SELECT
      sessions.id AS session_id,
      sessions.csrf_hash,
      users.id,
      users.email,
      users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
      AND users.status = 'active'
  ` ).get( digest_token( token ), Date.now() ) ?? null
}

/**
 * Revoke the current opaque session.
 *
 * @param {object} runtime
 * @param {string | undefined} token
 */
export function revoke_session( runtime, token ) {
    if( !token ) return

    runtime.database
        .prepare( `UPDATE sessions SET revoked_at = ? WHERE token_hash = ?` )
        .run( Date.now(), digest_token( token ) )
}

/**
 * Create an expiring one-use registration invitation.
 *
 * @param {object} runtime
 * @param {string} admin_id
 * @returns {object}
 */
export function create_invitation( runtime, admin_id ) {
    const token = random_token()
    const now = Date.now()
    const expires_at = now + 7 * 24 * 60 * 60 * 1000

    runtime.database.prepare( `
    INSERT INTO invitations (id, token_hash, created_by, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  ` ).run( randomUUID(), digest_token( token ), admin_id, expires_at, now )

    return { expires_at, token }
}

/**
 * Consume an invitation and provision a recoverable archive identity.
 *
 * @param {object} runtime
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function register( runtime, { email, password, token } ) {
    return with_rate_limit( runtime.database, `invitation`, token, () =>
        register_under_limit( runtime, { email, password, token } )
    )
}

async function register_under_limit( runtime, { email, password, token } ) {
    const now = Date.now()
    const invitation = runtime.database.prepare( `
    SELECT * FROM invitations
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
  ` ).get( digest_token( token ), now )

    if( !invitation ) throw new HttpError( 400, `invalid_invitation`, `Invitation is invalid or expired.` )

    const user_id = randomUUID()
    const password_hash = await argon2.hash( password, password_options )

    try {
        runtime.database.transaction( () => {
            const consumed = runtime.database.prepare( `
        UPDATE invitations SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL
      ` ).run( now, invitation.id )

            if( consumed.changes !== 1 ) throw new Error( `Invitation already consumed` )

            runtime.database.prepare( `
        INSERT INTO users (id, email, email_normalized, password_hash, role, status, created_at)
        VALUES (?, ?, ?, ?, 'member', 'provisioning', ?)
      ` ).run( user_id, email.trim(), normalize_email( email ), password_hash, now )
        } )()
    } catch {
        throw new HttpError( 409, `registration_failed`, `That account cannot be registered.` )
    }

    try {
        await write_profile( {
            diary_root: runtime.config.diary_data_path,
            email: email.trim(),
            role: `member`,
            user_id,
        } )
        runtime.database.prepare( `UPDATE users SET status = 'active' WHERE id = ?` ).run( user_id )
    } catch {
        await remove_provisioning_profile( {
            diary_root: runtime.config.diary_data_path,
            email: email.trim(),
            user_id,
        } ).catch( () => {} )
        rollback_registration( runtime, user_id, invitation.id, now )
        throw new HttpError( 503, `provisioning_unavailable`, `Account storage is temporarily unavailable.` )
    }
    clear_rate_limit( runtime.database, `invitation`, token )

    return { email: email.trim(), id: user_id, role: `member` }
}

/**
 * Create an operator-requested recovery token for an archive identity.
 *
 * @param {object} runtime
 * @param {string} email
 * @returns {object}
 */
export function create_recovery( runtime, email ) {
    const user = runtime.database.prepare( `
        SELECT id FROM users WHERE email_normalized = ?
    ` ).get( normalize_email( email ) )

    if( !user ) throw new HttpError( 404, `account_not_found`, `Archive account was not found.` )

    const token = random_token()
    const now = Date.now()
    const expires_at = now + 60 * 60 * 1000

    runtime.database.prepare( `
        INSERT INTO account_recovery (
            id, user_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?)
    ` ).run( randomUUID(), user.id, digest_token( token ), expires_at, now )

    return { expires_at, token }
}

/**
 * Consume a one-use operator recovery token and replace unrecoverable auth state.
 *
 * @param {object} runtime
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function recover_account( runtime, { password, token } ) {
    const now = Date.now()
    const recovery = runtime.database.prepare( `
        SELECT * FROM account_recovery
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
    ` ).get( digest_token( token ), now )

    if( !recovery ) throw new HttpError( 400, `invalid_recovery`, `Recovery link is invalid or expired.` )

    const password_hash = await argon2.hash( password, password_options )

    runtime.database.transaction( () => {
        const consumed = runtime.database.prepare( `
            UPDATE account_recovery SET consumed_at = ?
            WHERE id = ? AND consumed_at IS NULL
        ` ).run( now, recovery.id )

        if( consumed.changes !== 1 ) throw new Error( `Recovery already consumed` )

        runtime.database.prepare( `
            UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?
        ` ).run( password_hash, recovery.user_id )
        runtime.database.prepare( `
            UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
        ` ).run( now, recovery.user_id )
    } )()

    return runtime.database.prepare( `
        SELECT id, email, role FROM users WHERE id = ?
    ` ).get( recovery.user_id )
}
