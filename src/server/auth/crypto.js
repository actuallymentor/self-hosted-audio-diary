import { createHash, randomBytes } from "node:crypto"

/**
 * Create an opaque 256-bit token suitable for sessions and invitations.
 *
 * @returns {string}
 */
export function random_token() {
    return randomBytes( 32 ).toString( `base64url` )
}

/**
 * Hash an opaque secret before database storage.
 *
 * @param {string} value
 * @returns {string}
 */
export function digest_token( value ) {
    return createHash( `sha256` ).update( value ).digest( `hex` )
}

/**
 * Normalize identity comparisons while preserving the display email elsewhere.
 *
 * @param {string} email
 * @returns {string}
 */
export function normalize_email( email ) {
    return email.normalize( `NFKC` ).trim().toLowerCase()
}
