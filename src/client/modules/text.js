/**
 * Close a free-form message as a sentence, so it reads well before follow-up copy.
 *
 * @param {string} message
 * @returns {string}
 */
export const as_sentence = message => /[.!?…]$/.test( message.trim() ) ? message.trim() : `${ message.trim() }.`

/**
 * Format a diary date. These are calendar labels, never instants, so the zone is pinned.
 *
 * @param {string} date - YYYY-MM-DD
 * @param {object} [options] - Intl overrides
 * @returns {string}
 */
export const format_day = ( date, options = {} ) => new Date( `${ date }T12:00:00Z` )
    .toLocaleDateString( [], { day: `numeric`, month: `long`, timeZone: `UTC`, year: `numeric`, ...options } )
