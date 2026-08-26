/**
 * Calculate bounded exponential retry delay with jitter.
 *
 * @param {number} attempts
 * @param {number} entropy
 * @returns {number}
 */
export function retry_delay( attempts, entropy = Math.random() ) {
    const base = Math.min( 60_000, 1_000 * 2 ** Math.min( attempts, 6 ) )

    return Math.round( base * ( 0.75 + entropy * 0.5 ) )
}
