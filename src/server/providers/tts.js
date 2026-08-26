import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

import { atomic_write } from "../archive/atomic_write.js"
import { confined_path, user_root } from "../archive/paths.js"
import { HttpError } from "../http/errors.js"

const execute_file = promisify( execFile )

function pcm_wav( pcm ) {
    const header = Buffer.alloc( 44 )

    header.write( `RIFF`, 0 )
    header.writeUInt32LE( 36 + pcm.length, 4 )
    header.write( `WAVE`, 8 )
    header.write( `fmt `, 12 )
    header.writeUInt32LE( 16, 16 )
    header.writeUInt16LE( 1, 20 )
    header.writeUInt16LE( 1, 22 )
    header.writeUInt32LE( 24_000, 24 )
    header.writeUInt32LE( 48_000, 28 )
    header.writeUInt16LE( 2, 32 )
    header.writeUInt16LE( 16, 34 )
    header.write( `data`, 36 )
    header.writeUInt32LE( pcm.length, 40 )

    return Buffer.concat( [ header, pcm ] )
}

/**
 * Generate broad-browser MP3 speech for one saved reflection.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} reflection_id
 * @returns {Promise<object>}
 */
export async function reflection_speech( runtime, user, reflection_id ) {
    const reflection = runtime.database.prepare( `
    SELECT * FROM reflections WHERE id = ? AND user_id = ?
  ` ).get( reflection_id, user.id )

    if( !reflection ) throw new HttpError( 404, `reflection_not_found`, `Reflection was not found.` )

    const target_relative = reflection.relative_path.replace( /\.md$/, `.mp3` )
    const target = confined_path(
        user_root( runtime.config.diary_data_path, user.id, user.email ),
        target_relative,
    )

    try {
        await fs.access( target )
        return { media_path: `/api/v1/reflections/${ reflection.id }/speech/media` }
    } catch ( error ) {
        if( error.code !== `ENOENT` ) throw error
    }

    const pcm = await runtime.providers.openrouter_speech( runtime, reflection.answer )
    const wav = pcm_wav( pcm )
    const temporary_wav = `${ target }.${ reflection_id }.wav`
    const temporary_mp3 = `${ target }.${ reflection_id }.tmp.mp3`

    await atomic_write( temporary_wav, wav )

    try {
        await fs.mkdir( path.dirname( target ), { recursive: true } )
        await execute_file( `ffmpeg`, [
            `-nostdin`, `-loglevel`, `error`, `-y`,
            `-i`, temporary_wav,
            `-codec:a`, `libmp3lame`, `-q:a`, `4`,
            temporary_mp3,
        ], { timeout: 120_000 } )
        await fs.rename( temporary_mp3, target )
    } finally {
        await fs.rm( temporary_wav, { force: true } )
        await fs.rm( temporary_mp3, { force: true } )
    }

    return { media_path: `/api/v1/reflections/${ reflection.id }/speech/media` }
}
