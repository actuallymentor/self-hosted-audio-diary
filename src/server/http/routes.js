import fs from "node:fs/promises"
import { Readable } from "node:stream"

import { z } from "zod"

import {
    bootstrap,
    bootstrap_available,
    create_invitation,
    create_session,
    login,
    recover_account,
    register,
    resolve_session,
    revoke_session,
} from "../auth/service.js"
import {
    authenticate,
    clear_session_cookie,
    session_cookie_name,
    set_session_cookie,
    verify_csrf,
} from "../auth/http.js"
import { digest_token, random_token } from "../auth/crypto.js"
import { day_paths } from "../archive/day_store.js"
import { confined_path, user_root } from "../archive/paths.js"
import { send_media } from "./media.js"
import { api_prefix } from "../../shared/constants.js"

const email_schema = z.email().max( 254 )
const password_schema = z.string().min( 12 ).max( 256 )
const uuid_schema = z.uuid()
const date_schema = z.iso.date()
const capture_schema = z.object( {
    local_date: date_schema.optional(),
    offset_minutes: z.number().int().min( -840 ).max( 840 ),
    timezone: z.string().min( 1 ).max( 100 ),
    utc: z.iso.datetime(),
} )

const credentials_schema = z.object( { email: email_schema, password: password_schema } )

function protected_hooks( runtime ) {
    return { preHandler: [ authenticate( runtime ), verify_csrf ] }
}

function read_user_media( runtime, user, item_id ) {
    const item = runtime.database.prepare( `
    SELECT items.*, days.local_date
    FROM items JOIN days ON days.id = items.day_id
    WHERE items.id = ? AND items.user_id = ? AND items.deleted_at IS NULL
  ` ).get( item_id, user.id )

    if( !item ) return null

    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    } )

    return { item, target: confined_path( paths.absolute, item.relative_path ) }
}

/**
 * Register the complete versioned API surface.
 *
 * @param {object} app
 * @param {object} runtime
 */
export async function register_routes( app, runtime ) {
    const authenticate_request = authenticate( runtime )
    const unsafe = protected_hooks( runtime )

    app.get( `/health/live`, async () => ( { status: `ok` } ) )
    app.get( `/health/ready`, async () => ( { status: `ok` } ) )
    app.get( `/version`, async () => runtime.version )

    app.get( `${ api_prefix }/auth/session`, async request => {
        const session = resolve_session( runtime, request.cookies[session_cookie_name] )

        if( session ) {
            const csrf = random_token()

            runtime.database
                .prepare( `UPDATE sessions SET csrf_hash = ? WHERE id = ?` )
                .run( digest_token( csrf ), session.session_id )

            return {
                bootstrap_available: false,
                csrf,
                user: { email: session.email, id: session.id, role: session.role },
            }
        }

        return {
            bootstrap_available: await bootstrap_available( runtime ),
            csrf: null,
            user: null,
        }
    } )

    app.post( `${ api_prefix }/auth/bootstrap`, async ( request, reply ) => {
        const input = credentials_schema.parse( request.body )
        const user = await bootstrap( runtime, input )
        const session = create_session( runtime, user.id )

        set_session_cookie( reply, runtime.config, session )

        return { csrf: session.csrf, user }
    } )

    app.post( `${ api_prefix }/auth/login`, async ( request, reply ) => {
        const input = credentials_schema.parse( request.body )
        const user = await login( runtime, input )
        const session = create_session( runtime, user.id )

        set_session_cookie( reply, runtime.config, session )

        return { csrf: session.csrf, user }
    } )

    app.post( `${ api_prefix }/auth/register/:token`, async ( request, reply ) => {
        const input = credentials_schema.extend( { token: z.string().min( 20 ) } ).parse( {
            ...request.body,
            token: request.params.token,
        } )
        const user = await register( runtime, input )
        const session = create_session( runtime, user.id )

        set_session_cookie( reply, runtime.config, session )

        return { csrf: session.csrf, user }
    } )

    app.post( `${ api_prefix }/auth/recover/:token`, async ( request, reply ) => {
        const input = z.object( {
            password: password_schema,
            token: z.string().min( 20 ),
        } ).parse( { ...request.body, token: request.params.token } )
        const user = await recover_account( runtime, input )
        const session = create_session( runtime, user.id )

        set_session_cookie( reply, runtime.config, session )

        return { csrf: session.csrf, user }
    } )

    app.post( `${ api_prefix }/auth/logout`, unsafe, async ( request, reply ) => {
        revoke_session( runtime, request.cookies[session_cookie_name] )
        clear_session_cookie( reply, runtime.config )

        return { ok: true }
    } )

    app.post( `${ api_prefix }/admin/invitations`, unsafe, async request => {
        if( request.user.role !== `admin` ) {
            const error = new Error( `Administrator access required` )
            error.status_code = 403
            error.code = `forbidden`
            throw error
        }

        return create_invitation( runtime, request.user.id )
    } )

    app.get( `${ api_prefix }/days/:date`, { preHandler: authenticate_request }, async request => {
        const local_date = date_schema.parse( request.params.date )

        return runtime.diary.get_day( runtime, request.user, local_date )
    } )

    app.post( `${ api_prefix }/days/:date/text`, unsafe, async request => {
        const local_date = date_schema.parse( request.params.date )
        const input = z.object( {
            capture: capture_schema,
            item_id: uuid_schema.optional(),
            operation_id: uuid_schema.optional(),
            text: z.string().trim().min( 1 ).max( 1_000_000 ),
        } ).parse( request.body )

        if( input.capture.local_date && input.capture.local_date !== local_date ) {
            const error = new Error( `Route date and capture date differ` )
            error.status_code = 400
            error.code = `date_mismatch`
            throw error
        }

        input.capture.local_date = local_date

        return runtime.diary.add_text( runtime, request.user, input )
    } )

    app.put( `${ api_prefix }/days/:date/tags`, unsafe, async request => {
        const local_date = date_schema.parse( request.params.date )
        const { tags } = z.object( {
            tags: z.array( z.string().max( 80 ) ).max( 100 ),
        } ).parse( request.body )

        return { tags: await runtime.diary.set_tags( runtime, request.user, local_date, tags ) }
    } )

    app.post( `${ api_prefix }/uploads`, unsafe, async request => {
        const input = z.object( {
            capture: capture_schema,
            item_type: z.enum( [ `audio`, `image`, `video` ] ),
            mime: z.string().min( 3 ).max( 100 ),
            upload_id: uuid_schema,
        } ).parse( request.body )

        return runtime.uploads.create_upload( runtime, request.user, input )
    } )

    app.get( `${ api_prefix }/uploads/:id`, { preHandler: authenticate_request }, async request => {
        return runtime.uploads.upload_status(
            runtime,
            request.user,
            uuid_schema.parse( request.params.id ),
        )
    } )

    app.put( `${ api_prefix }/uploads/:id/chunks/:sequence`, unsafe, async request => {
        const upload_id = uuid_schema.parse( request.params.id )
        const sequence = z.coerce.number().int().min( 0 ).max( 1_000_000 ).parse( request.params.sequence )
        const byte_size = z.coerce.number().int().min( 1 ).max( 8 * 1024 * 1024 ).parse(
            request.headers[`content-length`],
        )
        const sha256 = z.string().regex( /^[a-f0-9]{64}$/ ).parse( request.headers[`x-content-sha256`] )
        const stream = request.body instanceof Readable ? request.body : Readable.from( request.body )

        return runtime.uploads.save_chunk( runtime, request.user, {
            byte_size,
            sequence,
            sha256,
            stream,
            upload_id,
        } )
    } )

    app.post( `${ api_prefix }/uploads/:id/complete`, unsafe, async request => {
        const input = z.object( {
            chunk_hashes: z.array( z.string().regex( /^[a-f0-9]{64}$/ ) ).min( 1 ).max( 1_000_000 ),
            total_bytes: z.number().int().positive(),
            whole_sha256: z.string().regex( /^[a-f0-9]{64}$/ ),
        } ).parse( request.body )

        return runtime.uploads.complete_upload( runtime, request.user, {
            ...input,
            upload_id: uuid_schema.parse( request.params.id ),
        } )
    } )

    app.get( `${ api_prefix }/media/:item_id`, { preHandler: authenticate_request }, async ( request, reply ) => {
        const media = read_user_media( runtime, request.user, uuid_schema.parse( request.params.item_id ) )

        if( !media ) return reply.code( 404 ).send( { error: `media_not_found` } )

        return send_media( request, reply, media.target, media.item.mime )
    } )

    app.patch( `${ api_prefix }/items/:item_id/text`, unsafe, async request => {
        const item_id = uuid_schema.parse( request.params.item_id )
        const { text } = z.object( {
            text: z.string().trim().min( 1 ).max( 1_000_000 ),
        } ).parse( request.body )

        return runtime.diary.edit_item_text( runtime, request.user, item_id, text )
    } )

    app.post( `${ api_prefix }/items/:item_id/transcription`, unsafe, async request => {
        return runtime.diary.retry_transcription(
            runtime,
            request.user,
            uuid_schema.parse( request.params.item_id ),
        )
    } )

    app.delete( `${ api_prefix }/items/:item_id`, unsafe, async request => {
        return runtime.diary.trash_item(
            runtime,
            request.user,
            uuid_schema.parse( request.params.item_id ),
        )
    } )

    app.post( `${ api_prefix }/trash/:tombstone_id/restore`, unsafe, async request => {
        return runtime.diary.restore_item(
            runtime,
            request.user,
            uuid_schema.parse( request.params.tombstone_id ),
        )
    } )

    app.get( `${ api_prefix }/search`, { preHandler: authenticate_request }, async request => {
        const filters = z.object( {
            end: date_schema.optional(),
            query: z.string().max( 500 ).default( `` ),
            start: date_schema.optional(),
            type: z.enum( [ `audio`, `image`, `video`, `text` ] ).optional(),
        } ).parse( request.query )

        return { results: runtime.search.search( runtime, request.user.id, filters ) }
    } )

    app.get( `${ api_prefix }/reflections`, { preHandler: authenticate_request }, async request => ( {
        reflections: runtime.reflections.list_reflections( runtime, request.user.id ),
    } ) )

    app.post( `${ api_prefix }/reflections`, unsafe, async request => {
        const input = z.object( {
            question: z.string().trim().min( 1 ).max( 2_000 ),
            range_end: date_schema,
            range_start: date_schema,
        } ).parse( request.body )

        return runtime.reflections.create_reflection( runtime, request.user, input )
    } )

    app.post( `${ api_prefix }/reflections/:id/speech`, unsafe, async request => {
        return runtime.tts.reflection_speech( runtime, request.user, uuid_schema.parse( request.params.id ) )
    } )

    app.get(
        `${ api_prefix }/reflections/:id/speech/media`,
        { preHandler: authenticate_request },
        async ( request, reply ) => {
            const id = uuid_schema.parse( request.params.id )
            const reflection = runtime.database.prepare( `
        SELECT relative_path FROM reflections WHERE id = ? AND user_id = ?
      ` ).get( id, request.user.id )

            if( !reflection ) return reply.code( 404 ).send( { error: `reflection_not_found` } )

            const target = confined_path(
                user_root( runtime.config.diary_data_path, request.user.id, request.user.email ),
                reflection.relative_path.replace( /\.md$/, `.mp3` ),
            )

            try {
                await fs.access( target )
            } catch {
                return reply.code( 404 ).send( { error: `speech_not_found` } )
            }

            return send_media( request, reply, target, `audio/mpeg` )
        },
    )

    app.get( `${ api_prefix }/jobs`, { preHandler: authenticate_request }, async request => ( {
        jobs: runtime.database.prepare( `
      SELECT id, type, status, attempts, last_error, created_at, updated_at
      FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
    ` ).all( request.user.id ),
    } ) )
}
