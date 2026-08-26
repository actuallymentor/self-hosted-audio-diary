/**
 * Resolve an instant into its canonical local diary date.
 *
 * @param {object} input
 * @returns {string}
 */
export function assign_local_day( { timezone, utc } ) {
    const instant = new Date( utc )

    if( Number.isNaN( instant.getTime() ) ) throw new Error( `Invalid capture instant` )

    const parts = new Intl.DateTimeFormat( `en-CA`, {
        day: `2-digit`,
        month: `2-digit`,
        timeZone: timezone,
        year: `numeric`,
    } ).formatToParts( instant )
    const values = Object.fromEntries( parts.map( part => [ part.type, part.value ] ) )

    return `${ values.year }-${ values.month }-${ values.day }`
}

/**
 * Capture browser time semantics without inferring from server location.
 *
 * @param {object} input
 * @returns {object}
 */
export function normalize_capture( input ) {
    let local_date
    let timezone
    let utc

    try {
        utc = new Date( input.utc ?? Date.now() ).toISOString()
        timezone = input.timezone ?? `UTC`
        local_date = assign_local_day( { timezone, utc } )
    } catch {
        const error = new Error( `Capture instant or timezone is invalid` )

        error.code = `invalid_capture`
        error.status_code = 400
        throw error
    }

    if( input.local_date && input.local_date !== local_date ) {
        const error = new Error( `Local date does not match capture instant and timezone` )

        error.code = `invalid_capture`
        error.status_code = 400
        throw error
    }

    return {
        local_date,
        offset_minutes: Number( input.offset_minutes ?? 0 ),
        timezone,
        utc,
    }
}
