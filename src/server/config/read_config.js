import path from "node:path"

import { z } from "zod"

const boolean_string = z
    .enum( [ `true`, `false` ] )
    .default( `false` )
    .transform( value => value === `true` )

const true_boolean_string = z
    .enum( [ `true`, `false` ] )
    .default( `true` )
    .transform( value => value === `true` )

const config_schema = z.object( {
    APP_DATA_PATH: z.string().min( 1 ).default( `/data/app` ),
    APP_GID: z.coerce.number().int().positive().default( 10001 ),
    APP_PORT: z.coerce.number().int().min( 1 ).max( 65535 ).default( 3000 ),
    APP_UID: z.coerce.number().int().positive().default( 10001 ),
    DIARY_DATA_PATH: z.string().min( 1 ).default( `/data/diary` ),
    NODE_ENV: z.enum( [ `development`, `test`, `production` ] ).default( `production` ),
    OPENROUTER_API_KEY: z.string().default( `` ),
    OPENROUTER_REFLECTION_MODEL: z.string().default( `anthropic/claude-sonnet-4.6` ),
    OPENROUTER_TTS_FORMAT: z.literal( `pcm` ).default( `pcm` ),
    OPENROUTER_TTS_MODEL: z.string().default( `google/gemini-3.1-flash-tts-preview` ),
    OPENROUTER_TTS_VOICE: z.string().default( `Sulafat` ),
    OPENROUTER_ZDR: true_boolean_string,
    SESSION_COOKIE_SECURE: boolean_string,
    SESSION_TTL_DAYS: z.coerce.number().int().min( 1 ).max( 365 ).default( 30 ),
    TRANSCRIPTION_MODEL: z.string().default( `large-v3` ),
    TRANSCRIPTION_URL: z.string().url().default( `http://transcriber:8000` ),
    UPLOAD_TTL_DAYS: z.coerce.number().int().min( 1 ).max( 365 ).default( 30 ),
} )

/**
 * Parse the narrow environment allowlist used by the application.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @returns {object}
 */
export function read_config( environment = process.env ) {
    const parsed = config_schema.parse( environment )

    return {
        ...parsed,
        app_data_path: path.resolve( parsed.APP_DATA_PATH ),
        database_path: path.resolve( parsed.APP_DATA_PATH, `shad.sqlite` ),
        diary_data_path: path.resolve( parsed.DIARY_DATA_PATH ),
    }
}
