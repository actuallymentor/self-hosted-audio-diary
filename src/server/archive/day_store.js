import fs from "node:fs/promises"
import path from "node:path"

import { archive_schema_version } from "../../shared/constants.js"
import { atomic_write, pretty_json } from "./atomic_write.js"
import { confined_path, user_root } from "./paths.js"

const day_locks = new Map()

function valid_date( local_date ) {
    if( !/^\d{4}-\d{2}-\d{2}$/.test( local_date ) ) throw new Error( `Invalid local date` )

    return local_date
}

/**
 * Get the absolute and relative location for one day.
 *
 * @param {object} options
 * @returns {object}
 */
export function day_paths( { diary_root, email, local_date, user_id } ) {
    const root = user_root( diary_root, user_id, email )
    const safe_date = valid_date( local_date )
    const absolute = confined_path( root, `days`, safe_date )

    return {
        absolute,
        metadata: confined_path( absolute, `metadata.json` ),
        relative: path.relative( root, absolute ),
        root,
    }
}

/**
 * Read day metadata or return an empty schema-compatible day.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function read_day( options ) {
    const paths = day_paths( options )

    try {
        const parsed = JSON.parse( await fs.readFile( paths.metadata, `utf8` ) )

        if( parsed.schema_version > archive_schema_version ) {
            throw new Error( `Archive schema is newer than this application` )
        }

        return parsed
    } catch ( error ) {
        if( error.code !== `ENOENT` ) throw error

        return {
            date: options.local_date,
            items: [],
            schema_version: archive_schema_version,
            tags: [],
            updated_at: new Date().toISOString(),
        }
    }
}

/**
 * Update one day under a process-local lock and persist it atomically.
 *
 * @param {object} options
 * @param {(metadata: object) => object | Promise<object>} change
 * @returns {Promise<object>}
 */
export async function update_day( options, change ) {
    const paths = day_paths( options )
    const previous = day_locks.get( paths.metadata ) ?? Promise.resolve()
    let release
    const current = new Promise( resolve => {
        release = resolve
    } )
    const queued = previous.then( () => current )

    day_locks.set( paths.metadata, queued )
    await previous

    try {
        const metadata = await read_day( options )
        const updated = await change( structuredClone( metadata ) )

        updated.updated_at = new Date().toISOString()
        await atomic_write( paths.metadata, pretty_json( updated ) )

        return updated
    } finally {
        release()

        if( day_locks.get( paths.metadata ) === queued ) day_locks.delete( paths.metadata )
    }
}
