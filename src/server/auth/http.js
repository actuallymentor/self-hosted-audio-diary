import { digest_token } from "./crypto.js"
import { resolve_session } from "./service.js"

export const session_cookie_name = `shad_session`

/**
 * Set the narrow opaque session cookie.
 *
 * @param {object} reply
 * @param {object} config
 * @param {object} session
 */
export function set_session_cookie( reply, config, session ) {
    reply.setCookie( session_cookie_name, session.token, {
        expires: new Date( session.expires_at ),
        httpOnly: true,
        path: `/`,
        sameSite: `lax`,
        secure: config.SESSION_COOKIE_SECURE,
    } )
}

/**
 * Clear the session cookie without relying on proxy headers.
 *
 * @param {object} reply
 * @param {object} config
 */
export function clear_session_cookie( reply, config ) {
    reply.clearCookie( session_cookie_name, {
        httpOnly: true,
        path: `/`,
        sameSite: `lax`,
        secure: config.SESSION_COOKIE_SECURE,
    } )
}

/**
 * Require a session and attach the owner identity to the request.
 *
 * @param {object} runtime
 * @returns {Function}
 */
export function authenticate( runtime ) {
    return async request => {
        const session = resolve_session(
            runtime,
            request.cookies[session_cookie_name],
        )

        if( !session ) {
            const error = new Error( `Authentication required` )
            error.status_code = 401
            error.code = `authentication_required`
            throw error
        }

        request.user = session
    }
}

/**
 * Require session-bound CSRF and reject explicitly cross-site unsafe requests.
 *
 * @param {object} request
 */
export async function verify_csrf( request ) {
    if( request.headers[`sec-fetch-site`] === `cross-site` ) {
        const error = new Error( `Cross-site request rejected` )
        error.status_code = 403
        error.code = `cross_site_rejected`
        throw error
    }

    const supplied = request.headers[`x-csrf-token`]

    if( !supplied || digest_token( supplied ) !== request.user.csrf_hash ) {
        const error = new Error( `CSRF token rejected` )
        error.status_code = 403
        error.code = `csrf_rejected`
        throw error
    }
}
