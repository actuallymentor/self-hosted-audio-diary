let csrf_token = null
let csrf_refresh = null

async function refresh_csrf() {
    if( csrf_refresh ) return csrf_refresh

    csrf_refresh = fetch( `/api/v1/auth/session`, { credentials: `same-origin` } )
        .then( async response => {
            if( !response.ok ) throw new Error( `Session refresh failed` )

            const session = await response.json()

            set_csrf( session.csrf )
            return session.csrf
        } )

    try {
        return await csrf_refresh
    } finally {
        csrf_refresh = null
    }
}

async function failure_detail( response ) {
    return response.json().catch( () => ( {} ) )
}

/**
 * Keep the current session-bound CSRF token in volatile memory.
 *
 * @param {string | null} token
 */
export function set_csrf( token ) {
    csrf_token = token
}

/**
 * Send a same-origin API request with safe defaults and typed failures.
 *
 * @param {string} path
 * @param {RequestInit & { json?: unknown }} options
 * @returns {Promise<any>}
 */
export async function api( path, options = {} ) {
    const headers = new Headers( options.headers )
    const method = options.method ?? `GET`
    let { body } = options

    if( `json` in options ) {
        headers.set( `Content-Type`, `application/json` )
        body = JSON.stringify( options.json )
    }

    const unsafe = ![ `GET`, `HEAD` ].includes( method )
    const send = () => {
        const request_headers = new Headers( headers )

        if( csrf_token && unsafe ) request_headers.set( `X-CSRF-Token`, csrf_token )

        return fetch( `/api/v1${ path }`, {
            ...options,
            body,
            credentials: `same-origin`,
            headers: request_headers,
            method,
        } )
    }

    if( unsafe && !csrf_token && !path.startsWith( `/auth/` ) ) await refresh_csrf()

    let response = await send()
    let detail = response.ok ? null : await failure_detail( response )

    // An offline reload has no CSRF token in memory. Recover the cookie-bound
    // token once connectivity returns, then replay the same idempotent request.
    if( unsafe && detail?.error === `csrf_rejected` && await refresh_csrf() ) {
        response = await send()
        detail = response.ok ? null : await failure_detail( response )
    }

    if( !response.ok ) {
        const error = new Error( detail.message ?? `Request failed` )

        error.code = detail.error
        error.status = response.status
        throw error
    }

    if( response.status === 204 ) return null

    return response.json()
}
