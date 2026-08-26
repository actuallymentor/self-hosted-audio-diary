/**
 * Represent a safe HTTP failure without exposing internal details.
 */
export class HttpError extends Error {
    /**
   * @param {number} status_code
   * @param {string} code
   * @param {string} message
   */
    constructor( status_code, code, message ) {
        super( message )
        this.code = code
        this.status_code = status_code
    }
}
