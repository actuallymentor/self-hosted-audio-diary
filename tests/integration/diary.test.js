import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { reconcile_archive } from "../../src/server/archive/reconcile.js"
import { create_runtime } from "../../src/server/runtime/create_runtime.js"
import { bootstrap_client, start_test_server } from "../support/test_server.js"

test( `persists, searches, edits, tags, trashes, and restores canonical text`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client, user } = await bootstrap_client( server.base_url )
    const item_id = crypto.randomUUID()
    const capture = {
        local_date: `2026-08-25`,
        offset_minutes: 120,
        timezone: `Europe/Amsterdam`,
        utc: `2026-08-25T12:00:00.000Z`,
    }
    const created = await client.request( `/api/v1/days/2026-08-25/text`, {
        json: { capture, item_id, text: `Walked beside the quiet canal.` },
        method: `POST`,
    } )

    assert.equal( created.response.status, 200 )

    const search = await client.request( `/api/v1/search?query=canal` )
    assert.equal( search.result.results[0].item_id, item_id )

    const edited = await client.request( `/api/v1/items/${ item_id }/text`, {
        json: { text: `Walked beside the bright canal.` },
        method: `PATCH`,
    } )
    assert.equal( edited.response.status, 200 )

    const day = await client.request( `/api/v1/days/2026-08-25` )
    assert.equal( day.result.items[0].text, `Walked beside the bright canal.` )

    const tagged = await client.request( `/api/v1/days/2026-08-25/tags`, {
        json: { tags: [ `Travel`, `canal`, `travel` ] },
        method: `PUT`,
    } )

    assert.deepEqual( tagged.result.tags, [ `canal`, `travel` ] )

    await client.request( `/api/v1/items/${ item_id }/text`, {
        json: { text: `Walked beside the bright canal.` },
        method: `PATCH`,
    } )
    const tag_after_edit = await client.request( `/api/v1/search?query=travel` )

    assert.equal( tag_after_edit.result.results[0].item_id, item_id )

    const removed = await client.request( `/api/v1/items/${ item_id }`, { method: `DELETE` } )
    assert.equal( removed.response.status, 200 )

    const empty = await client.request( `/api/v1/days/2026-08-25` )
    assert.equal( empty.result.items.length, 0 )
    assert.equal( empty.result.tombstones[0].item_id, item_id )

    const restored = await client.request(
        `/api/v1/trash/${ removed.result.tombstone_id }/restore`,
        { method: `POST` },
    )
    const recovered_day = await client.request( `/api/v1/days/2026-08-25` )

    assert.equal( restored.response.status, 200 )
    assert.equal( recovered_day.result.items[0].text, `Walked beside the bright canal.` )
    assert.deepEqual( recovered_day.result.tombstones, [] )

    const later_item_id = crypto.randomUUID()

    await client.request( `/api/v1/days/2026-08-26/text`, {
        json: {
            capture: {
                local_date: `2026-08-26`,
                offset_minutes: 0,
                timezone: `UTC`,
                utc: `2026-08-26T12:00:00.000Z`,
            },
            item_id: later_item_id,
            text: `A later day must survive malformed tags.`,
        },
        method: `POST`,
    } )
    const [ profile ] = await fs.readdir( path.join( server.config.diary_data_path, `users` ) )
    const malformed_metadata_path = path.join(
        server.config.diary_data_path,
        `users`,
        profile,
        `days`,
        `2026-08-26`,
        `metadata.json`,
    )
    const malformed_metadata = JSON.parse( await fs.readFile( malformed_metadata_path, `utf8` ) )

    malformed_metadata.tags = { unexpected: true }
    await fs.writeFile( malformed_metadata_path, `${ JSON.stringify( malformed_metadata, null, 2 ) }\n` )

    const days_root = path.dirname( path.dirname( malformed_metadata_path ) )
    const invalid_items_root = path.join( days_root, `2026-08-27` )
    const null_metadata_root = path.join( days_root, `2026-08-28` )
    const invalid_item_root = path.join( days_root, `2026-08-29` )

    await fs.mkdir( invalid_items_root )
    await fs.writeFile( path.join( invalid_items_root, `metadata.json` ), JSON.stringify( {
        items: { unexpected: true },
        schema_version: 1,
        tags: [],
    } ) )
    await fs.mkdir( null_metadata_root )
    await fs.writeFile( path.join( null_metadata_root, `metadata.json` ), `null` )
    await fs.mkdir( invalid_item_root )
    await fs.writeFile( path.join( invalid_item_root, `metadata.json` ), JSON.stringify( {
        items: [ null ],
        schema_version: 1,
        tags: [],
    } ) )

    const recovered_app = path.join( server.root, `recovered-app` )
    const recovered_runtime = create_runtime( {
        ...server.config,
        APP_DATA_PATH: recovered_app,
        app_data_path: recovered_app,
        database_path: path.join( recovered_app, `shad.sqlite` ),
    } )

    t.after( () => recovered_runtime.database.close() )
    const report = await reconcile_archive( recovered_runtime )

    const recovered_tags = recovered_runtime.search.search( recovered_runtime, user.id, { query: `travel` } )
    const recovered_later_item = recovered_runtime.database.prepare( `SELECT id FROM items WHERE id = ?` )
        .get( later_item_id )

    assert.equal( recovered_tags[0].item_id, item_id )
    assert.equal( recovered_later_item.id, later_item_id )
    assert.ok( report.conflicts.some( conflict => conflict.reason === `invalid_tags` ) )
    assert.ok( report.conflicts.some( conflict => conflict.reason === `invalid_items` ) )
    assert.ok( report.conflicts.some( conflict => conflict.reason === `invalid_item` ) )
    assert.equal( report.conflicts.filter( conflict => conflict.reason === `invalid_metadata` ).length, 1 )
} )

test( `invalid capture semantics return a client error`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client } = await bootstrap_client( server.base_url )
    const response = await client.request( `/api/v1/days/2026-08-25/text`, {
        json: {
            capture: {
                local_date: `2026-08-25`,
                offset_minutes: 0,
                timezone: `Atlantis/Nowhere`,
                utc: `2026-08-25T12:00:00.000Z`,
            },
            text: `Invalid zone`,
        },
        method: `POST`,
    } )

    assert.equal( response.response.status, 400 )
    assert.equal( response.result.error, `invalid_capture` )
} )

test( `serializes concurrent writes to one human-readable day`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client } = await bootstrap_client( server.base_url )

    const responses = await Promise.all( Array.from( { length: 12 }, ( _, index ) =>
        client.request( `/api/v1/days/2026-08-25/text`, {
            json: {
                capture: {
                    local_date: `2026-08-25`,
                    offset_minutes: 0,
                    timezone: `UTC`,
                    utc: `2026-08-25T12:00:${ String( index ).padStart( 2, `0` ) }.000Z`,
                },
                item_id: crypto.randomUUID(),
                text: `Concurrent note ${ index }`,
            },
            method: `POST`,
        } )
    ) )
    const day = await client.request( `/api/v1/days/2026-08-25` )

    assert.equal( responses.every( response => response.response.ok ), true )
    assert.equal( day.result.items.length, 12 )
} )
