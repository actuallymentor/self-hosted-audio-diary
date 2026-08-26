import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

/**
 * Open SQLite with settings suited to a single local application replica.
 *
 * @param {string} database_path
 * @returns {Database.Database}
 */
export function open_database( database_path ) {
    fs.mkdirSync( path.dirname( database_path ), { recursive: true } )

    const database = new Database( database_path )

    database.pragma( `journal_mode = WAL` )
    database.pragma( `foreign_keys = ON` )
    database.pragma( `busy_timeout = 5000` )
    database.pragma( `synchronous = FULL` )

    return database
}
