import assert from "node:assert/strict"
import test from "node:test"

import { reflection_range, shift_day } from "../../src/shared/diary_dates.js"
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

test( `diary navigation crosses leap days, years, and DST as calendar dates`, () => {
    assert.equal( shift_day( `2024-03-01`, -1 ), `2024-02-29` )
    assert.equal( shift_day( `2026-01-01`, -1 ), `2025-12-31` )
    assert.equal( shift_day( `2026-12-31`, 1 ), `2027-01-01` )
    assert.equal( shift_day( `2026-03-29`, 1 ), `2026-03-30` )
    assert.equal( shift_day( `2026-10-25`, -1 ), `2026-10-24` )
} )

test( `reflection periods include today and clamp month and leap-year boundaries`, () => {
    assert.deepEqual( reflection_range( `week`, `2026-01-03` ), {
        range_start: `2025-12-28`, range_end: `2026-01-03`,
    } )
    assert.deepEqual( reflection_range( `month`, `2026-03-31` ), {
        range_start: `2026-03-01`, range_end: `2026-03-31`,
    } )
    assert.deepEqual( reflection_range( `quarter`, `2026-01-31` ), {
        range_start: `2025-11-01`, range_end: `2026-01-31`,
    } )
    assert.deepEqual( reflection_range( `year`, `2024-02-29` ), {
        range_start: `2023-03-01`, range_end: `2024-02-29`,
    } )
    assert.deepEqual( reflection_range( `month`, `2026-09-09` ), {
        range_start: `2026-08-10`, range_end: `2026-09-09`,
    } )
} )
