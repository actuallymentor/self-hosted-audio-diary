import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { create_app } from "../../src/server/create_app.js"
import { read_config } from "../../src/server/config/read_config.js"
import { create_runtime } from "../../src/server/runtime/create_runtime.js"

/**
 * Start the production Fastify factory on a random real HTTP port with isolated storage.
 *
 * @returns {Promise<object>}
 */
export async function start_test_server( environment = {} ) {
    const root = await fs.mkdtemp( path.join( os.tmpdir(), `shad-test-` ) )
    const config = read_config( {
        APP_DATA_PATH: path.join( root, `app` ),
        APP_PORT: `3000`,
        DIARY_DATA_PATH: path.join( root, `diary` ),
        NODE_ENV: `test`,
        SESSION_COOKIE_SECURE: `false`,
        TRANSCRIPTION_URL: `http://127.0.0.1:1`,
        ...environment,
    } )
    const runtime = create_runtime( config )
    const app = await create_app( runtime )

    await app.listen( { host: `127.0.0.1`, port: 0 } )

    const address = app.server.address()

    return {
        app,
        base_url: `http://127.0.0.1:${ address.port }`,
        config,
        root,
        runtime,
        async close() {
            await app.close()
            runtime.database.close()
            await fs.rm( root, { force: true, recursive: true } )
        },
    }
}

/**
 * Create a minimal cookie and CSRF-aware native-fetch API client.
 *
 * @param {string} base_url
 * @returns {object}
 */
export function test_client( base_url ) {
    let cookie = ``
    let csrf = ``

    return {
        set csrf( value ) {
            csrf = value
        },
        get csrf() {
            return csrf
        },
        async request( route, options = {} ) {
            const headers = new Headers( options.headers )

            if( cookie ) headers.set( `Cookie`, cookie )
            if( csrf && ![ `GET`, `HEAD` ].includes( options.method ?? `GET` ) ) {
                headers.set( `X-CSRF-Token`, csrf )
            }

            let { body } = options

            if( `json` in options ) {
                headers.set( `Content-Type`, `application/json` )
                body = JSON.stringify( options.json )
            }

            const response = await fetch( `${ base_url }${ route }`, {
                ...options,
                body,
                headers,
            } )
            const set_cookie = response.headers.get( `set-cookie` )

            if( set_cookie ) [ cookie ] = set_cookie.split( `;`, 1 )

            const result = await response.json().catch( () => null )

            if( result?.csrf ) ( { csrf } = result )

            return { response, result }
        },
    }
}

/**
 * Bootstrap one administrator and retain its session.
 *
 * @param {string} base_url
 * @returns {Promise<object>}
 */
export async function bootstrap_client( base_url ) {
    const client = test_client( base_url )
    const { response, result } = await client.request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )

    if( !response.ok ) throw new Error( `Bootstrap failed: ${ JSON.stringify( result ) }` )

    return { client, user: result.user }
}
