import fs from "node:fs/promises"
import path from "node:path"

import { atomic_write, pretty_json } from "./atomic_write.js"
import { confined_path, user_root } from "./paths.js"

/**
 * Persist the recoverable portion of a user identity.
 *
 * @param {object} options
 */
export async function write_profile( { diary_root, email, role, user_id } ) {
    const root = user_root( diary_root, user_id, email )

    await atomic_write( confined_path( root, `profile.json` ), pretty_json( {
        email,
        role,
        schema_version: 1,
        updated_at: new Date().toISOString(),
        user_id,
    } ) )
}

/**
 * Detect recoverable identities before public bootstrap is offered.
 *
 * @param {string} diary_root
 * @returns {Promise<boolean>}
 */
export async function archive_has_profiles( diary_root ) {
    const users_root = path.join( diary_root, `users` )

    try {
        const entries = await fs.readdir( users_root, { withFileTypes: true } )

        for( const entry of entries ) {
            if( !entry.isDirectory() ) continue

            try {
                await fs.access( confined_path( users_root, entry.name, `profile.json` ) )
                return true
            } catch ( error ) {
                if( error.code !== `ENOENT` ) throw error
            }
        }

        return false
    } catch ( error ) {
        if( error.code === `ENOENT` ) return false
        throw error
    }
}

/**
 * Read every recoverable profile without following archive symlinks.
 *
 * @param {string} diary_root
 * @returns {Promise<object[]>}
 */
export async function list_profiles( diary_root ) {
    const users_root = path.join( diary_root, `users` )

    try {
        const entries = await fs.readdir( users_root, { withFileTypes: true } )
        const profiles = []

        for( const entry of entries ) {
            if( !entry.isDirectory() || entry.isSymbolicLink() ) continue

            try {
                const profile = JSON.parse( await fs.readFile(
                    confined_path( users_root, entry.name, `profile.json` ),
                    `utf8`,
                ) )

                if( profile.user_id && profile.email ) profiles.push( profile )
            } catch ( error ) {
                if( error.code !== `ENOENT` ) throw error
            }
        }

        return profiles
    } catch ( error ) {
        if( error.code === `ENOENT` ) return []
        throw error
    }
}
