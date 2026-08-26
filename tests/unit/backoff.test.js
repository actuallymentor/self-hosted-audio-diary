import assert from "node:assert/strict"
import test from "node:test"

import { retry_delay } from "../../src/client/modules/sync/backoff.js"

test( `bounds exponential outbox retry with deterministic jitter`, () => {
    assert.equal( retry_delay( 0, 0 ), 750 )
    assert.equal( retry_delay( 1, 0.5 ), 2_000 )
    assert.equal( retry_delay( 100, 1 ), 75_000 )
} )
