import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

/**
 * Durably replace a file with sibling-temp, fsync, rename, and directory fsync.
 *
 * @param {string} target
 * @param {string | Buffer} contents
 */
export async function atomic_write( target, contents ) {
    await fs.mkdir( path.dirname( target ), { recursive: true } )

    const temporary = `${ target }.${ randomUUID() }.tmp`
    const handle = await fs.open( temporary, `wx`, 0o600 )

    try {
        await handle.writeFile( contents )
        await handle.sync()
    } finally {
        await handle.close()
    }

    await fs.rename( temporary, target )

    const directory = await fs.open( path.dirname( target ), `r` )

    try {
        await directory.sync()
    } finally {
        await directory.close()
    }
}

/**
 * Serialize JSON deterministically enough for human diffs and recovery.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function pretty_json( value ) {
    return `${ JSON.stringify( value, null, 2 ) }\n`
}
