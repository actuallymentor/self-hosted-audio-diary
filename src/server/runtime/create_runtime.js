import fs from "node:fs"

import { log } from "mentie"

import package_metadata from "../../../package.json" with { type: "json" }

import * as auth from "../auth/service.js"
import * as diary from "../diary/service.js"
import * as jobs from "../jobs/queue.js"
import * as providers from "../providers/openrouter.js"
import * as reflections from "../reflections/service.js"
import * as search from "../search/service.js"
import * as tts from "../providers/tts.js"
import * as uploads from "../uploads/service.js"
import { open_database } from "../db/connection.js"
import { migrate_database } from "../db/migrate.js"
import { transcribe_item } from "../transcription/service.js"

/**
 * Create the explicit dependency graph used by routes, jobs, and tests.
 *
 * @param {object} config
 * @returns {object}
 */
export function create_runtime( config ) {
    fs.mkdirSync( config.app_data_path, { recursive: true } )
    fs.mkdirSync( config.diary_data_path, { recursive: true } )

    const database = open_database( config.database_path )

    migrate_database( database )

    return {
        auth,
        config,
        database,
        diary,
        job_handlers: { transcription: transcribe_item },
        jobs,
        log,
        providers: { ...providers },
        reflections,
        search,
        tts,
        uploads,
        version: { name: package_metadata.name, version: package_metadata.version },
    }
}
