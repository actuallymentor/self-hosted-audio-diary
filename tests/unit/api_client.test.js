import assert from "node:assert/strict"
import test from "node:test"

import { api, set_csrf } from "../../src/client/modules/api/client.js"

test( `refreshes a rejected CSRF token and retries an unsafe request once`, async t => {
    const original_fetch = globalThis.fetch
    const calls = []

    t.after( () => {
        globalThis.fetch = original_fetch
        set_csrf( null )
    } )

    set_csrf( `stale-token` )
    globalThis.fetch = async ( path, options ) => {
        calls.push( { options, path } )

        if( path === `/api/v1/auth/session` ) {
            return Response.json( { csrf: `fresh-token`, user: { id: `person-1` } } )
        }

        if( calls.length === 1 ) {
            return Response.json( {
                error: `csrf_rejected`,
                message: `CSRF token rejected`,
            }, { status: 403 } )
        }

        return Response.json( { accepted: true } )
    }

    const result = await api( `/uploads`, { json: { id: `recording-1` }, method: `POST` } )

    assert.deepEqual( result, { accepted: true } )
    assert.deepEqual( calls.map( call => call.path ), [
        `/api/v1/uploads`,
        `/api/v1/auth/session`,
        `/api/v1/uploads`,
    ] )
    assert.equal( calls[2].options.headers.get( `X-CSRF-Token` ), `fresh-token` )
} )

test( `refreshes a missing CSRF token before an unsafe request`, async t => {
    const original_fetch = globalThis.fetch
    const calls = []

    t.after( () => {
        globalThis.fetch = original_fetch
        set_csrf( null )
    } )

    set_csrf( null )
    globalThis.fetch = async ( path, options ) => {
        calls.push( { options, path } )

        if( path === `/api/v1/auth/session` ) {
            return Response.json( { csrf: `fresh-token`, user: { id: `person-1` } } )
        }

        return Response.json( { accepted: true } )
    }

    const result = await api( `/uploads`, { json: { id: `recording-1` }, method: `POST` } )

    assert.deepEqual( result, { accepted: true } )
    assert.deepEqual( calls.map( call => call.path ), [
        `/api/v1/auth/session`,
        `/api/v1/uploads`,
    ] )
    assert.equal( calls[1].options.headers.get( `X-CSRF-Token` ), `fresh-token` )
} )
