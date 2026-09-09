/**
 * Move an ISO diary date by calendar days, independent of timezone and DST.
 * @param {string} date - YYYY-MM-DD
 * @param {number} offset - Signed calendar-day offset
 * @returns {string}
 */
export function shift_day( date, offset ) {
    const value = new Date( `${ date }T12:00:00Z` )
    value.setUTCDate( value.getUTCDate() + offset )
    return value.toISOString().slice( 0, 10 )
}

/**
 * Resolve a trailing period including today. Month/year boundaries clamp to the
 * last available day; the preceding boundary day is excluded from the range.
 * @param {string} period - week, month, quarter, or year
 * @param {string} today - Local diary date, YYYY-MM-DD
 * @returns {{range_start: string, range_end: string}}
 */
export function reflection_range( period, today ) {
    if( period === `week` ) return { range_start: shift_day( today, -6 ), range_end: today }

    const months = { month: 1, quarter: 3, year: 12 }[period]
    if( !months ) throw new Error( `Unknown reflection period` )

    const boundary = new Date( `${ today }T12:00:00Z` )
    const day = boundary.getUTCDate()
    boundary.setUTCDate( 1 )
    boundary.setUTCMonth( boundary.getUTCMonth() - months )
    const month_end = new Date( boundary )
    month_end.setUTCMonth( month_end.getUTCMonth() + 1, 0 )
    boundary.setUTCDate( Math.min( day, month_end.getUTCDate() ) )

    return {
        range_start: shift_day( boundary.toISOString().slice( 0, 10 ), 1 ),
        range_end: today,
    }
}
