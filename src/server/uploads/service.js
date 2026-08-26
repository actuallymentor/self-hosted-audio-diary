import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { Transform } from "node:stream"
import { promisify } from "node:util"
import { execFile } from "node:child_process"

import { confined_path } from "../archive/paths.js"
import { day_paths, update_day } from "../archive/day_store.js"
import { HttpError } from "../http/errors.js"
import { normalize_capture } from "../../shared/time.js"
import { project_item } from "../diary/service.js"

const execute_file = promisify( execFile )
const upload_locks = new Map()
const media_extensions = new Map( [
    [ `audio/mp4`, `.m4a` ],
    [ `audio/mpeg`, `.mp3` ],
    [ `audio/ogg`, `.ogg` ],
    [ `audio/wav`, `.wav` ],
    [ `audio/webm`, `.webm` ],
    [ `image/heic`, `.heic` ],
    [ `image/jpeg`, `.jpg` ],
    [ `image/png`, `.png` ],
    [ `image/webp`, `.webp` ],
    [ `video/mp4`, `.mp4` ],
    [ `video/quicktime`, `.mov` ],
    [ `video/webm`, `.webm` ],
] )

function incoming_root( runtime, user_id, upload_id ) {
    return confined_path( runtime.config.diary_data_path, `.incoming`, user_id, upload_id )
}

function assert_media( item_type, mime ) {
    if( ![ `audio`, `image`, `video` ].includes( item_type ) ) {
        throw new HttpError( 400, `invalid_media_type`, `Unsupported media type.` )
    }

    const extension = media_extensions.get( mime )

    if( !extension || !mime.startsWith( `${ item_type }/` ) ) {
        throw new HttpError( 415, `unsupported_media`, `Unsupported media format.` )
    }

    return extension
}

async function with_upload_lock( key, change ) {
    const previous = upload_locks.get( key ) ?? Promise.resolve()
    let release
    const current = new Promise( resolve => {
        release = resolve
    } )
    const queued = previous.then( () => current )

    upload_locks.set( key, queued )
    await previous

    try {
        return await change()
    } finally {
        release()

        if( upload_locks.get( key ) === queued ) upload_locks.delete( key )
    }
}

/**
 * Idempotently create a resumable upload manifest.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {object} input
 * @returns {object}
 */
export function create_upload( runtime, user, input ) {
    assert_media( input.item_type, input.mime )

    const capture = normalize_capture( input.capture )
    const now = Date.now()
    const existing = runtime.database.prepare( `
    SELECT * FROM uploads WHERE id = ? AND user_id = ?
  ` ).get( input.upload_id, user.id )

    if( existing ) {
        const same = existing.item_type === input.item_type
      && existing.mime === input.mime
      && existing.local_date === capture.local_date

        if( !same ) throw new HttpError( 409, `upload_conflict`, `Upload ID already has a different manifest.` )

        return upload_status( runtime, user, input.upload_id )
    }

    runtime.database.prepare( `
    INSERT INTO uploads (
      id, user_id, local_date, item_type, mime, capture_json,
      status, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'receiving', ?, ?)
  ` ).run(
        input.upload_id,
        user.id,
        capture.local_date,
        input.item_type,
        input.mime,
        JSON.stringify( capture ),
        now,
        now,
    )

    return upload_status( runtime, user, input.upload_id )
}

/**
 * Read durable server receipts used to resume an interrupted upload.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} upload_id
 * @returns {object}
 */
export function upload_status( runtime, user, upload_id ) {
    const upload = runtime.database.prepare( `
    SELECT id, item_id, status, whole_sha256, total_bytes
    FROM uploads WHERE id = ? AND user_id = ?
  ` ).get( upload_id, user.id )

    if( !upload ) throw new HttpError( 404, `upload_not_found`, `Upload was not found.` )

    const chunks = runtime.database.prepare( `
    SELECT sequence, sha256, byte_size
    FROM upload_chunks WHERE upload_id = ? ORDER BY sequence
  ` ).all( upload_id )

    return { ...upload, chunks }
}

/**
 * Stream one immutable upload part to the diary filesystem.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function save_chunk( runtime, user, input ) {
    return with_upload_lock( `${ user.id }:${ input.upload_id }`, () =>
        save_chunk_locked( runtime, user, input )
    )
}

async function save_chunk_locked( runtime, user, input ) {
    const upload = runtime.database.prepare( `
    SELECT * FROM uploads WHERE id = ? AND user_id = ?
  ` ).get( input.upload_id, user.id )

    if( !upload ) throw new HttpError( 404, `upload_not_found`, `Upload was not found.` )
    if( upload.status === `complete` ) return upload_status( runtime, user, input.upload_id )
    if( upload.finalizing_at && upload.finalizing_at >= Date.now() - 60 * 60 * 1000 ) {
        throw new HttpError( 409, `upload_finalizing`, `Upload finalization is already in progress.` )
    }

    const existing = runtime.database.prepare( `
    SELECT * FROM upload_chunks WHERE upload_id = ? AND sequence = ?
  ` ).get( input.upload_id, input.sequence )

    if( existing ) {
        if( existing.sha256 !== input.sha256 || existing.byte_size !== input.byte_size ) {
            throw new HttpError( 409, `chunk_conflict`, `That chunk sequence already contains different bytes.` )
        }

        return existing
    }

    const root = incoming_root( runtime, user.id, input.upload_id )

    await fs.mkdir( root, { recursive: true } )

    const target = confined_path( root, `${ input.sequence }.part` )
    const temporary = confined_path( root, `${ input.sequence }.${ randomUUID() }.tmp` )
    const digest = createHash( `sha256` )
    let byte_size = 0
    const inspector = new Transform( {
        transform( chunk, encoding, callback ) {
            byte_size += chunk.length
            digest.update( chunk )
            callback( null, chunk )
        },
    } )

    try {
        await pipeline( input.stream, inspector, await writable_file( temporary ) )
        const actual_hash = digest.digest( `hex` )

        if( byte_size !== input.byte_size || actual_hash !== input.sha256 ) {
            throw new HttpError( 422, `chunk_digest_mismatch`, `Chunk size or digest did not match.` )
        }

        const handle = await fs.open( temporary, `r` )
        await handle.sync()
        await handle.close()
        await fs.rename( temporary, target )
    } catch ( error ) {
        await fs.rm( temporary, { force: true } )
        throw error
    }

    const relative_path = path.relative( runtime.config.diary_data_path, target )

    runtime.database.prepare( `
    INSERT INTO upload_chunks (
      upload_id, sequence, sha256, byte_size, relative_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  ` ).run( input.upload_id, input.sequence, input.sha256, byte_size, relative_path, Date.now() )
    runtime.database.prepare( `UPDATE uploads SET updated_at = ? WHERE id = ?` ).run( Date.now(), input.upload_id )

    return { byte_size, sequence: input.sequence, sha256: input.sha256 }
}

async function writable_file( target ) {
    const { createWriteStream } = await import( `node:fs` )

    return createWriteStream( target, { flags: `wx`, mode: 0o600 } )
}

async function probe_media( target ) {
    try {
        const { stdout } = await execute_file( `ffprobe`, [
            `-v`, `error`,
            `-show_entries`, `format=duration,size:stream=codec_name,codec_type`,
            `-of`, `json`,
            target,
        ], { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 } )
        const probe = JSON.parse( stdout )

        return {
            codecs: probe.streams?.map( stream => stream.codec_name ).filter( Boolean ) ?? [],
            duration_seconds: Number.parseFloat( probe.format?.duration ?? `0` ) || null,
        }
    } catch {
        throw new HttpError( 422, `invalid_media`, `Media could not be decoded.` )
    }
}

/**
 * Assemble verified parts, preserve the original, and enqueue derived work.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function complete_upload( runtime, user, input ) {
    return with_upload_lock( `${ user.id }:${ input.upload_id }`, () =>
        complete_upload_locked( runtime, user, input )
    )
}

async function complete_upload_locked( runtime, user, input ) {
    const upload = runtime.database.prepare( `
    SELECT * FROM uploads WHERE id = ? AND user_id = ?
  ` ).get( input.upload_id, user.id )

    if( !upload ) throw new HttpError( 404, `upload_not_found`, `Upload was not found.` )
    if( upload.status === `complete` ) return upload_status( runtime, user, input.upload_id )

    const finalizing_at = Date.now()
    const stale_before = finalizing_at - 60 * 60 * 1000
    const claimed = runtime.database.prepare( `
        UPDATE uploads SET finalizing_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'receiving'
          AND (finalizing_at IS NULL OR finalizing_at < ?)
    ` ).run( finalizing_at, finalizing_at, input.upload_id, user.id, stale_before )

    if( claimed.changes !== 1 ) {
        throw new HttpError( 409, `upload_finalizing`, `Upload finalization is already in progress.` )
    }

    let assembled

    try {
        const chunks = runtime.database.prepare( `
            SELECT * FROM upload_chunks WHERE upload_id = ? ORDER BY sequence
        ` ).all( input.upload_id )
        const expected_hashes = input.chunk_hashes

        if(
            chunks.length !== expected_hashes.length
            || chunks.some( ( chunk, index ) => chunk.sequence !== index || chunk.sha256 !== expected_hashes[index] )
        ) {
            throw new HttpError( 409, `upload_incomplete`, `Upload chunks are missing or out of order.` )
        }

        const root = incoming_root( runtime, user.id, input.upload_id )
        assembled = confined_path( root, `${ input.upload_id }.${ randomUUID() }.partial` )
        const output = await fs.open( assembled, `wx`, 0o600 )
        const digest = createHash( `sha256` )
        let total_bytes = 0

        try {
            for( const chunk of chunks ) {
                const source = confined_path( runtime.config.diary_data_path, chunk.relative_path )

                for await ( const bytes of createReadStream( source ) ) {
                    digest.update( bytes )
                    total_bytes += bytes.length
                    await output.write( bytes )
                }
            }

            await output.sync()
        } finally {
            await output.close()
        }

        const whole_sha256 = digest.digest( `hex` )

        if( total_bytes !== input.total_bytes || whole_sha256 !== input.whole_sha256 ) {
            await fs.rm( assembled, { force: true } )
            throw new HttpError( 422, `upload_digest_mismatch`, `Final size or digest did not match.` )
        }

        const probe = await probe_media( assembled )
        const capture = JSON.parse( upload.capture_json )
        const extension = assert_media( upload.item_type, upload.mime )
        const paths = day_paths( {
            diary_root: runtime.config.diary_data_path,
            email: user.email,
            local_date: upload.local_date,
            user_id: user.id,
        } )
        const folder = upload.item_type === `image` ? `images` : upload.item_type
        const prefix = new Date( capture.utc ).toISOString().slice( 11, 23 ).replaceAll( `:`, `-` )
        const relative_path = path.join( folder, `${ prefix }--${ upload.id }${ extension }` )
        const target = confined_path( paths.absolute, relative_path )

        await fs.mkdir( path.dirname( target ), { recursive: true } )
        await fs.rename( assembled, target )

        const item = {
            byte_size: total_bytes,
            canonical: true,
            capture,
            codecs: probe.codecs,
            duration_seconds: probe.duration_seconds,
            id: upload.id,
            mime: upload.mime,
            path: relative_path,
            sha256: whole_sha256,
            type: upload.item_type,
        }

        await update_day( {
            diary_root: runtime.config.diary_data_path,
            email: user.email,
            local_date: upload.local_date,
            user_id: user.id,
        }, metadata => {
            if( !metadata.items.some( candidate => candidate.id === item.id ) ) metadata.items.push( item )
            metadata.items.sort( ( left, right ) => left.capture.utc.localeCompare( right.capture.utc ) )

            return metadata
        } )
        project_item( runtime, user, upload.local_date, item )

        runtime.database.prepare( `
            UPDATE uploads
            SET status = 'complete', item_id = ?, whole_sha256 = ?,
              total_bytes = ?, finalizing_at = NULL, updated_at = ?
            WHERE id = ?
        ` ).run( item.id, whole_sha256, total_bytes, Date.now(), upload.id )
        runtime.database.prepare( `DELETE FROM upload_chunks WHERE upload_id = ?` ).run( upload.id )

        if( item.type === `audio` ) {
            runtime.jobs.enqueue( runtime, {
                dedupe_key: `${ item.id }:${ item.sha256 }`,
                payload: { item_id: item.id },
                type: `transcription`,
                user_id: user.id,
            } )
        }

        await fs.rm( root, { force: true, recursive: true } )

        return upload_status( runtime, user, input.upload_id )
    } catch ( error ) {
        if( assembled ) await fs.rm( assembled, { force: true } )
        runtime.database.prepare( `
            UPDATE uploads SET finalizing_at = NULL, updated_at = ?
            WHERE id = ? AND user_id = ? AND status = 'receiving'
        ` ).run( Date.now(), input.upload_id, user.id )
        throw error
    }
}

/**
 * Remove only incomplete upload staging older than the configured safety window.
 *
 * @param {object} runtime
 * @returns {Promise<number>}
 */
export async function cleanup_expired_uploads( runtime ) {
    const cutoff = Date.now() - runtime.config.UPLOAD_TTL_DAYS * 24 * 60 * 60 * 1000
    const expired = runtime.database.prepare( `
        SELECT id, user_id FROM uploads
        WHERE status = 'receiving' AND updated_at < ?
    ` ).all( cutoff )

    for( const upload of expired ) {
        await fs.rm( incoming_root( runtime, upload.user_id, upload.id ), {
            force: true,
            recursive: true,
        } )
        runtime.database.prepare( `DELETE FROM uploads WHERE id = ? AND status = 'receiving'` )
            .run( upload.id )
    }

    return expired.length
}

/**
 * Clear finalization claims that cannot survive a single-replica process restart.
 *
 * @param {object} runtime
 * @returns {number}
 */
export function recover_interrupted_finalizations( runtime ) {
    return runtime.database.prepare( `
        UPDATE uploads SET finalizing_at = NULL
        WHERE status = 'receiving' AND finalizing_at IS NOT NULL
    ` ).run().changes
}
