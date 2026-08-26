import assert from "node:assert/strict"
import test from "node:test"

import { bootstrap_client, start_test_server } from "../support/test_server.js"

test( `persists, searches, edits, tags, trashes, and restores canonical text`, async t => {
    const server = await start_test_server()
    t.after( () => server.close() )
    const { client } = await bootstrap_client( server.base_url )
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
