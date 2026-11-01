import { execFile } from "node:child_process"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execute_file = promisify( execFile )
const remuxes = new Map()

// Browser MediaRecorder streams WebM live: the file has no duration and no seek index
const needs_remux = mime => [ `audio/webm`, `video/webm` ].includes( mime )

const playback_path = ( runtime, item_id ) => path.join( runtime.config.app_data_path, `playback`, `${ item_id }.webm` )

async function remux( source, target ) {

    const partial = `${ target }.${ process.pid }.partial`

    await fs.mkdir( path.dirname( target ), { mode: 0o700, recursive: true } )

    try {

        // Stream copy: same audio bytes, new container with duration and front cues
        await execute_file( `ffmpeg`, [
            `-nostdin`, `-loglevel`, `error`, `-y`,
            `-i`, source,
            `-map`, `0`, `-c`, `copy`,
            `-cues_to_front`, `1`,
            `-f`, `webm`, partial,
        ], { timeout: 120_000 } )
        await fs.chmod( partial, 0o600 )
        await fs.rename( partial, target )

    } finally {
        await fs.rm( partial, { force: true } )
    }

}

/**
 * Resolve the file to stream. The archive original stays byte-identical, so a
 * seekable WebM copy is built once on first playback in disposable app data.
 *
 * @param {object} runtime
 * @param {object} request
 * @param {object} media - Item row and its confined archive path
 * @returns {Promise<string>} Playback copy, or the original if remuxing fails
 */
export async function playback_target( runtime, request, { item, target } ) {

    if( !needs_remux( item.mime ) ) return target

    const copy = playback_path( runtime, item.id )
    const cached = await fs.access( copy ).then( () => true, () => false )

    if( cached ) return copy

    // Concurrent range requests share one remux
    if( !remuxes.has( item.id ) ) {
        const pending = remux( target, copy ).finally( () => remuxes.delete( item.id ) )
        remuxes.set( item.id, pending )
    }

    try {
        await remuxes.get( item.id )
        return copy
    } catch ( error ) {
        request.log.warn( { err: error, item_id: item.id }, `Playback remux failed; serving the original` )
        return target
    }

}

/**
 * Remove a disposable playback copy so trashed media leaves no second file behind.
 *
 * @param {object} runtime
 * @param {string} item_id
 */
export async function remove_playback( runtime, item_id ) {
    await fs.rm( playback_path( runtime, item_id ), { force: true } )
}

/**
 * Send an authenticated file with byte-range playback support.
 *
 * @param {object} request
 * @param {object} reply
 * @param {string} target
 * @param {string} mime
 */
export async function send_media( request, reply, target, mime ) {
    const statistics = await fs.stat( target )
    const { range } = request.headers

    reply.header( `Accept-Ranges`, `bytes` )
    reply.type( mime )

    if( !range ) {
        reply.header( `Content-Length`, statistics.size )
        return reply.send( createReadStream( target ) )
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec( range )

    if( !match ) return reply.code( 416 ).header( `Content-Range`, `bytes */${ statistics.size }` ).send()

    let start
    let end

    if( match[1] ) {
        start = Number.parseInt( match[1], 10 )
        end = match[2]
            ? Math.min( Number.parseInt( match[2], 10 ), statistics.size - 1 )
            : statistics.size - 1
    } else {
        const suffix_size = Number.parseInt( match[2], 10 )

        if( !suffix_size ) {
            return reply.code( 416 ).header( `Content-Range`, `bytes */${ statistics.size }` ).send()
        }

        start = Math.max( statistics.size - suffix_size, 0 )
        end = statistics.size - 1
    }

    if( !Number.isSafeInteger( start ) || !Number.isSafeInteger( end ) || start > end || start >= statistics.size ) {
        return reply.code( 416 ).header( `Content-Range`, `bytes */${ statistics.size }` ).send()
    }

    reply.code( 206 )
    reply.header( `Content-Length`, end - start + 1 )
    reply.header( `Content-Range`, `bytes ${ start }-${ end }/${ statistics.size }` )

    return reply.send( createReadStream( target, { end, start } ) )
}
