import { execFile } from "node:child_process"
import fs, { openAsBlob } from "node:fs"
import fs_promises from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

import { Agent, fetch as undici_fetch, FormData } from "undici"

import { atomic_write } from "../archive/atomic_write.js"
import { day_paths, update_day } from "../archive/day_store.js"
import { confined_path } from "../archive/paths.js"

const execute_file = promisify( execFile )
const transcription_timeout_ms = 30 * 60 * 1000

// Node's fetch otherwise gives up after five minutes without response headers.
// CPU transcription often needs longer, especially on small production hosts.
const transcription_dispatcher = new Agent( {
    bodyTimeout: transcription_timeout_ms,
    headersTimeout: transcription_timeout_ms,
} )

/**
 * Transcribe one canonical audio item through the engine-neutral service.
 *
 * @param {object} runtime
 * @param {object} job
 */
export async function transcribe_item( runtime, job ) {
    const item = runtime.database.prepare( `
    SELECT items.*, days.local_date, users.email
    FROM items
    JOIN days ON days.id = items.day_id
    JOIN users ON users.id = items.user_id
    WHERE items.id = ? AND items.user_id = ? AND items.type = 'audio'
  ` ).get( job.payload.item_id, job.user_id )

    if( !item ) throw new Error( `Audio item no longer exists` )

    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: item.email,
        local_date: item.local_date,
        user_id: item.user_id,
    } )
    const source = confined_path( paths.absolute, item.relative_path )
    const work_root = path.join( runtime.config.app_data_path, `work` )

    await fs_promises.mkdir( work_root, { recursive: true } )

    const normalized = path.join( work_root, `${ item.id }.flac` )

    await execute_file( `ffmpeg`, [
        `-nostdin`, `-loglevel`, `error`, `-y`,
        `-i`, source,
        `-vn`, `-ac`, `1`, `-ar`, `16000`,
        `-c:a`, `flac`,
        normalized,
    ], { timeout: 30 * 60 * 1000 } )

    try {
        const form = new FormData()
        const blob = await openAsBlob( normalized, { type: `audio/flac` } )

        form.append( `file`, blob, `${ item.id }.flac` )
        form.append( `model`, runtime.config.TRANSCRIPTION_MODEL )
        form.append( `language`, `mixed` )
        form.append( `response_format`, `verbose_json` )

        const request = runtime.transcription_fetch ?? undici_fetch
        const response = await request( `${ runtime.config.TRANSCRIPTION_URL }/v1/audio/transcriptions`, {
            body: form,
            dispatcher: transcription_dispatcher,
            method: `POST`,
            signal: AbortSignal.timeout( transcription_timeout_ms ),
        } )

        if( !response.ok ) throw new Error( `Transcriber returned ${ response.status }` )

        const result = await response.json()
        const text = String( result.text ?? `` ).trim()

        const base = path.basename( item.relative_path, path.extname( item.relative_path ) )
        const machine_relative = path.join( `transcripts`, `${ base }.machine.txt` )
        const display_relative = path.join( `transcripts`, `${ base }.txt` )
        const machine_target = confined_path( paths.absolute, machine_relative )
        const display_target = confined_path( paths.absolute, display_relative )

        await atomic_write( machine_target, `${ text }\n` )

        if( !fs.existsSync( display_target ) ) await atomic_write( display_target, `${ text }\n` )

        await update_day( {
            diary_root: runtime.config.diary_data_path,
            email: item.email,
            local_date: item.local_date,
            user_id: item.user_id,
        }, metadata => {
            const candidate = metadata.items.find( value => value.id === item.id )

            if( !candidate ) throw new Error( `Archive metadata lost its audio item` )

            candidate.display_transcript = fs.readFileSync( display_target, `utf8` ).trim()
            candidate.transcript = {
                display_path: display_relative,
                engine: `faster-whisper`,
                language: result.language ?? null,
                machine_path: machine_relative,
                model: result.model ?? runtime.config.TRANSCRIPTION_MODEL,
                source_sha256: item.sha256,
            }

            return metadata
        } )

        const display_text = fs.readFileSync( display_target, `utf8` ).trim()

        runtime.database.prepare( `UPDATE items SET display_text = ? WHERE id = ?` ).run( display_text, item.id )
        runtime.search.index_document( runtime, {
            content: display_text,
            item_id: item.id,
            local_date: item.local_date,
            type: `audio`,
            user_id: item.user_id,
        } )
    } finally {
        await fs_promises.rm( normalized, { force: true } )
    }
}
