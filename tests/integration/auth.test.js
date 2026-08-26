import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { write_profile } from "../../src/server/archive/profile_store.js"
import { start_test_server, test_client } from "../support/test_server.js"

test( `only one concurrent first user becomes administrator`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )

    const attempts = await Promise.all( [ `one`, `two` ].map( async name => {
        const client = test_client( server.base_url )
        return client.request( `/api/v1/auth/bootstrap`, {
            json: {
                email: `${ name }@example.com`,
                password: `correct horse battery staple`,
            },
            method: `POST`,
        } )
    } ) )
    const statuses = attempts.map( attempt => attempt.response.status ).sort()

    assert.deepEqual( statuses, [ 200, 409 ] )
    assert.equal( server.runtime.database.prepare( `SELECT COUNT(*) AS count FROM users` ).get().count, 1 )
} )

test( `sessions require CSRF and invitations are one-use`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const admin = test_client( server.base_url )
    const bootstrap = await admin.request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )

    assert.equal( bootstrap.response.status, 200 )

    const original_csrf = admin.csrf
    admin.csrf = `wrong`
    const rejected = await admin.request( `/api/v1/admin/invitations`, { method: `POST` } )

    assert.equal( rejected.response.status, 403 )
    admin.csrf = original_csrf

    const invitation = await admin.request( `/api/v1/admin/invitations`, { method: `POST` } )
    const member = test_client( server.base_url )
    const registration = await member.request(
        `/api/v1/auth/register/${ invitation.result.token }`,
        {
            json: { email: `member@example.com`, password: `another correct horse staple` },
            method: `POST`,
        },
    )
    const duplicate = await test_client( server.base_url ).request(
        `/api/v1/auth/register/${ invitation.result.token }`,
        {
            json: { email: `other@example.com`, password: `another correct horse staple` },
            method: `POST`,
        },
    )

    assert.equal( registration.response.status, 200 )
    assert.equal( duplicate.response.status, 400 )
} )

test( `an archive identity prevents unsafe first-user reclaim`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )

    await write_profile( {
        diary_root: server.config.diary_data_path,
        email: `survivor@example.com`,
        role: `admin`,
        user_id: crypto.randomUUID(),
    } )

    const client = test_client( server.base_url )
    const session = await client.request( `/api/v1/auth/session` )
    const bootstrap = await client.request( `/api/v1/auth/bootstrap`, {
        json: { email: `attacker@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )

    assert.equal( session.result.bootstrap_available, false )
    assert.equal( bootstrap.response.status, 409 )
} )

test( `session ownership hides another user's entries and media IDs`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const admin = test_client( server.base_url )
    const owner = await admin.request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )
    const item_id = crypto.randomUUID()

    await admin.request( `/api/v1/days/2026-08-25/text`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            item_id,
            text: `Owner-only lighthouse memory`,
        },
        method: `POST`,
    } )

    const invitation = await admin.request( `/api/v1/admin/invitations`, { method: `POST` } )
    const member = test_client( server.base_url )

    await member.request( `/api/v1/auth/register/${ invitation.result.token }`, {
        json: { email: `member@example.com`, password: `another correct horse staple` },
        method: `POST`,
    } )

    const day = await member.request( `/api/v1/days/2026-08-25` )
    const search = await member.request( `/api/v1/search?query=lighthouse` )
    const edit = await member.request( `/api/v1/items/${ item_id }/text`, {
        json: { text: `stolen` },
        method: `PATCH`,
    } )
    const owner_row = server.runtime.database.prepare( `SELECT user_id FROM items WHERE id = ?` ).get( item_id )

    assert.equal( owner.response.status, 200 )
    assert.deepEqual( day.result.items, [] )
    assert.deepEqual( search.result.results, [] )
    assert.equal( edit.response.status, 404 )
    assert.equal( owner_row.user_id, owner.result.user.id )
} )

test( `failed profile writes roll back bootstrap and invitation claims`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const diary_root = server.config.diary_data_path

    await fs.chmod( diary_root, 0o500 )
    const failed_bootstrap = await test_client( server.base_url ).request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )
    await fs.chmod( diary_root, 0o700 )

    assert.equal( failed_bootstrap.response.status, 503 )
    assert.equal( server.runtime.database.prepare( `SELECT COUNT(*) AS count FROM users` ).get().count, 0 )
    assert.equal( server.runtime.database.prepare( `SELECT claimed_at FROM bootstrap_state` ).get().claimed_at, null )

    const admin = test_client( server.base_url )
    const bootstrap = await admin.request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )
    const invitation = await admin.request( `/api/v1/admin/invitations`, { method: `POST` } )
    const users_root = path.join( diary_root, `users` )

    await fs.chmod( users_root, 0o500 )
    const failed_registration = await test_client( server.base_url ).request(
        `/api/v1/auth/register/${ invitation.result.token }`,
        {
            json: { email: `member@example.com`, password: `another correct horse staple` },
            method: `POST`,
        },
    )
    await fs.chmod( users_root, 0o700 )

    assert.equal( bootstrap.response.status, 200 )
    assert.equal( failed_registration.response.status, 503 )
    assert.equal( server.runtime.database.prepare( `SELECT consumed_at FROM invitations` )
        .get().consumed_at, null )
    assert.equal( server.runtime.database.prepare( `SELECT COUNT(*) AS count FROM users` ).get().count, 1 )

    const retried = await test_client( server.base_url ).request(
        `/api/v1/auth/register/${ invitation.result.token }`,
        {
            json: { email: `member@example.com`, password: `another correct horse staple` },
            method: `POST`,
        },
    )

    assert.equal( retried.response.status, 200 )
} )

test( `repeated failures add delay without locking a valid login`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const admin = test_client( server.base_url )

    await admin.request( `/api/v1/auth/bootstrap`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )

    for( let attempt = 0; attempt < 11; attempt += 1 ) {
        const rejected = await test_client( server.base_url ).request( `/api/v1/auth/login`, {
            json: { email: `owner@example.com`, password: `wrong password long enough` },
            method: `POST`,
        } )

        assert.equal( rejected.response.status, 401 )
    }

    const accepted = await test_client( server.base_url ).request( `/api/v1/auth/login`, {
        json: { email: `owner@example.com`, password: `correct horse battery staple` },
        method: `POST`,
    } )

    assert.equal( accepted.response.status, 200 )
} )

test( `Fastify parser errors preserve their client status`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const response = await fetch( `${ server.base_url }/api/v1/auth/login`, {
        body: `{`,
        headers: { [`Content-Type`]: `application/json` },
        method: `POST`,
    } )

    assert.equal( response.status, 400 )
} )
