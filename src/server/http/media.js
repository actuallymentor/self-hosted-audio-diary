import { createReadStream } from "node:fs"
import fs from "node:fs/promises"

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
