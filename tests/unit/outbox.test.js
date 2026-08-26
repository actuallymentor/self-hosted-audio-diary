import assert from "node:assert/strict"
import test from "node:test"

import { sync_failure_status } from "../../src/client/modules/sync/outbox.js"

test( `classifies permanent client failures without deleting local bytes`, () => {
    assert.equal( sync_failure_status( { status: 401 } ), `needs_auth` )
    assert.equal( sync_failure_status( { status: 409 } ), `unrecoverable` )
    assert.equal( sync_failure_status( { code: `upload_finalizing`, status: 409 } ), `retry` )
    assert.equal( sync_failure_status( { code: `upload_incomplete`, status: 409 } ), `retry` )
    assert.equal( sync_failure_status( { status: 422 } ), `unrecoverable` )
    assert.equal( sync_failure_status( { status: 429 } ), `retry` )
    assert.equal( sync_failure_status( { status: 503 } ), `retry` )
} )
