import fs from "node:fs"
import path from "node:path"

/**
 * Normalize an email into a recognizable, filesystem-safe prefix.
 *
 * @param {string} email
 * @returns {string}
 */
export function safe_email( email ) {
    return email
        .normalize( `NFKD` )
        .replace( /\p{M}+/gu, `` )
        .toLowerCase()
        .replace( /[^a-z0-9@._-]+/g, `-` )
        .replace( /^-+|-+$/g, `` )
        .slice( 0, 96 ) || `user`
}

/**
 * Resolve a relative archive path and reject traversal or symlink ancestors.
 *
 * @param {string} root
 * @param {...string} parts
 * @returns {string}
 */
export function confined_path( root, ...parts ) {
    if( parts.some( part => part.includes( `\0` ) || path.isAbsolute( part ) ) ) {
        throw new Error( `Unsafe archive path` )
    }

    const resolved_root = path.resolve( root )
    const target = path.resolve( resolved_root, ...parts )
    const relative = path.relative( resolved_root, target )

    if( relative === `..` || relative.startsWith( `..${ path.sep }` ) || path.isAbsolute( relative ) ) {
        throw new Error( `Archive path escapes its owner root` )
    }

    let cursor = resolved_root

    for( const segment of relative.split( path.sep ).filter( Boolean ).slice( 0, -1 ) ) {
        cursor = path.join( cursor, segment )

        if( fs.existsSync( cursor ) && fs.lstatSync( cursor ).isSymbolicLink() ) {
            throw new Error( `Archive path contains a symbolic link` )
        }
    }

    return target
}

/**
 * Find a user's stable archive directory without trusting an email supplied later.
 *
 * @param {string} diary_root
 * @param {string} user_id
 * @param {string} email
 * @returns {string}
 */
export function user_root( diary_root, user_id, email ) {
    const users_root = confined_path( diary_root, `users` )

    fs.mkdirSync( users_root, { recursive: true } )

    const existing = fs
        .readdirSync( users_root, { withFileTypes: true } )
        .find( entry => entry.isDirectory() && entry.name.endsWith( `--${ user_id }` ) )

    return confined_path( users_root, existing?.name ?? `${ safe_email( email ) }--${ user_id }` )
}
