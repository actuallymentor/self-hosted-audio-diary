import assert from "node:assert/strict"
import test from "node:test"

import { assign_local_day, normalize_capture } from "../../src/shared/time.js"

test( `assigns dates through DST and travel zones`, () => {
    assert.equal( assign_local_day( {
        timezone: `Europe/Amsterdam`,
        utc: `2026-10-25T00:30:00.000Z`,
    } ), `2026-10-25` )
    assert.equal( assign_local_day( {
        timezone: `America/Los_Angeles`,
        utc: `2026-08-25T02:00:00.000Z`,
    } ), `2026-08-24` )
} )

test( `rejects a client date inconsistent with its instant and IANA zone`, () => {
    assert.throws( () => normalize_capture( {
        local_date: `2026-08-25`,
        offset_minutes: 0,
        timezone: `America/Los_Angeles`,
        utc: `2026-08-25T02:00:00.000Z`,
    } ), /does not match/ )
} )

test( `rejects malformed instants and zones`, () => {
    assert.throws( () => assign_local_day( { timezone: `UTC`, utc: `later` } ), /Invalid/ )
    assert.throws( () => assign_local_day( { timezone: `Atlantis/Nowhere`, utc: Date.now() } ), RangeError )
} )
