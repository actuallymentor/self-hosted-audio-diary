import assert from "node:assert/strict"
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
