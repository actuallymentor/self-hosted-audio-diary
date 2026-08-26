import { log } from "mentie"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

import { api } from "../api/client.js"
import { recording_is_active, recording_lock_prefix } from "../recorder/recorder.js"
import { diary_database } from "../storage/database.js"
import { retry_delay } from "./backoff.js"

let sync_running = false
let retry_timer = null

/**
 * Map an API failure to a durable outbox state without discarding local bytes.
 *
 * @param {{code?: string, status?: number}} error
 * @returns {'needs_auth' | 'retry' | 'unrecoverable'}
 */
export function sync_failure_status( error ) {
    if( error.status === 401 ) return `needs_auth`
    if( [ `csrf_rejected`, `upload_finalizing`, `upload_incomplete` ].includes( error.code ) ) return `retry`
    if( error.status >= 400 && error.status < 500 && ![ 408, 425, 429 ].includes( error.status ) ) {
        return `unrecoverable`
    }

    return `retry`
}

async function inspect_interrupted_recording( recording ) {
    const chunks = await diary_database.chunks
        .where( `recording_id` )
        .equals( recording.id )
        .sortBy( `sequence` )

    if( !chunks.length || chunks[0].sequence !== 0 ) {
        throw new Error( `Recording header was not saved before interruption.` )
    }

    const hasher = sha256.create()
    let byte_size = 0

    for( const [ sequence, chunk ] of chunks.entries() ) {
        const bytes = new Uint8Array( await chunk.blob.arrayBuffer() )
        const chunk_hash = bytesToHex( sha256( bytes ) )

        if(
            chunk.sequence !== sequence
            || chunk.byte_size !== bytes.byteLength
            || chunk.sha256 !== chunk_hash
        ) {
            throw new Error( `Recording chunks are incomplete or damaged.` )
        }

        hasher.update( bytes )
        byte_size += bytes.byteLength
    }

    if( recording.item_type && byte_size !== recording.byte_size ) {
        throw new Error( `Attachment import was interrupted before every byte was saved.` )
    }

    await diary_database.recordings.update( recording.id, {
        byte_size,
        last_error: null,
        status: `saved_local`,
        whole_sha256: bytesToHex( hasher.digest() ),
    } )
}

async function recover_one_recording( recording ) {
    if( recording_is_active( recording.id ) ) return

    const recover = async () => {
        try {
            await inspect_interrupted_recording( recording )
        } catch ( error ) {
            await diary_database.recordings.update( recording.id, {
                last_error: error.message,
                status: `unrecoverable`,
            } )
        }
    }
    const locks = globalThis.navigator?.locks

    if( !locks?.request ) return recover()

    return locks.request(
        `${ recording_lock_prefix }${ recording.id }`,
        { ifAvailable: true },
        lock => lock ? recover() : undefined,
    )
}

/**
 * Finalize durable chunks left behind by a killed tab before outbox replay.
 *
 * @param {string} account_id
 */
export async function recover_interrupted_recordings( account_id ) {
    const interrupted = await diary_database.recordings
        .where( `[account_id+status]` )
        .equals( [ account_id, `recording` ] )
        .toArray()

    await Promise.all( interrupted.map( recover_one_recording ) )
}

function schedule_retry( account_id, attempts ) {
    if( retry_timer ) return

    retry_timer = setTimeout( () => {
        retry_timer = null
        void sync_outbox( account_id )
    }, retry_delay( attempts ) )
}

async function coalesce_parts( chunks, target_size = 2 * 1024 * 1024 ) {
    const groups = []
    let current = []
    let byte_size = 0

    for( const chunk of chunks ) {
        if( current.length && byte_size + chunk.byte_size > target_size ) {
            groups.push( current )
            current = []
            byte_size = 0
        }

        current.push( chunk )
        byte_size += chunk.byte_size
    }

    if( current.length ) groups.push( current )

    return Promise.all( groups.map( async ( group, sequence ) => {
        const blob = new Blob( group.map( chunk => chunk.blob ), { type: `application/octet-stream` } )
        const bytes = new Uint8Array( await blob.arrayBuffer() )

        return {
            blob,
            byte_size: bytes.byteLength,
            sequence,
            sha256: bytesToHex( sha256( bytes ) ),
        }
    } ) )
}

async function sync_recording( recording ) {
    await diary_database.recordings.update( recording.id, { status: `syncing` } )

    const manifest = await api( `/uploads`, {
        json: {
            capture: recording.capture,
            item_type: recording.item_type ?? `audio`,
            mime: recording.mime,
            upload_id: recording.id,
        },
        method: `POST`,
    } )

    const chunks = await diary_database.chunks
        .where( `recording_id` )
        .equals( recording.id )
        .sortBy( `sequence` )
    const parts = await coalesce_parts( chunks )
    const received = new Map( manifest.chunks.map( chunk => [ chunk.sequence, chunk ] ) )

    for( const part of parts ) {
        const receipt = received.get( part.sequence )

        if( receipt?.sha256 === part.sha256 && receipt.byte_size === part.byte_size ) continue

        await api( `/uploads/${ recording.id }/chunks/${ part.sequence }`, {
            body: part.blob,
            headers: {
                [`Content-Length`]: String( part.byte_size ),
                [`Content-Type`]: `application/octet-stream`,
                [`X-Content-SHA256`]: part.sha256,
            },
            method: `PUT`,
        } )
    }

    await api( `/uploads/${ recording.id }/complete`, {
        json: {
            chunk_hashes: parts.map( part => part.sha256 ),
            total_bytes: recording.byte_size,
            whole_sha256: recording.whole_sha256,
        },
        method: `POST`,
    } )

    // A status read is the final server-durability acknowledgment.
    const status = await api( `/uploads/${ recording.id }` )

    if( status.status !== `complete` ) throw new Error( `Upload was not finalized` )

    await diary_database.transaction(
        `rw`,
        diary_database.chunks,
        diary_database.recordings,
        async () => {
            await diary_database.chunks.where( `recording_id` ).equals( recording.id ).delete()
            await diary_database.recordings.update( recording.id, { status: `uploaded` } )
        },
    )
}

async function sync_operation( operation ) {
    if( operation.type !== `text` ) return

    await api( `/days/${ operation.payload.capture.local_date }/text`, {
        json: operation.payload,
        method: `POST`,
    } )
    await diary_database.operations.update( operation.id, { status: `uploaded` } )
}

/**
 * Queue a text note locally before attempting same-origin delivery.
 *
 * @param {string} account_id
 * @param {object} payload
 * @returns {Promise<string>}
 */
export async function queue_text( account_id, payload ) {
    const id = payload.operation_id ?? crypto.randomUUID()

    await diary_database.operations.put( {
        account_id,
        created_at: Date.now(),
        id,
        payload: { ...payload, operation_id: id },
        status: `saved_local`,
        type: `text`,
    } )
    void sync_outbox( account_id )

    return id
}

/**
 * Resume durable recordings and operations for the active account.
 *
 * @param {string} account_id
 */
export async function sync_outbox( account_id ) {
    if( sync_running ) return

    sync_running = true
    clearTimeout( retry_timer )
    retry_timer = null
    let synchronized = false

    try {
        await recover_interrupted_recordings( account_id )

        const recordings = await diary_database.recordings
            .where( `[account_id+status]` )
            .anyOf( [
                [ account_id, `saved_local` ],
                [ account_id, `retry` ],
                [ account_id, `syncing` ],
            ] )
            .toArray()

        for( const recording of recordings ) {
            try {
                await sync_recording( recording )
                synchronized = true
            } catch ( error ) {
                const status = sync_failure_status( error )
                const attempts = ( recording.attempts ?? 0 ) + 1

                await diary_database.recordings.update( recording.id, {
                    attempts,
                    last_error: error.message,
                    status,
                } )

                if( status === `retry` ) schedule_retry( account_id, attempts )

                log.warn( `Recording sync paused`, { id: recording.id, status } )
            }
        }

        const operations = await diary_database.operations
            .where( `[account_id+status]` )
            .anyOf( [ [ account_id, `saved_local` ], [ account_id, `retry` ] ] )
            .toArray()

        for( const operation of operations ) {
            try {
                await sync_operation( operation )
                synchronized = true
            } catch ( error ) {
                const status = sync_failure_status( error )
                const attempts = ( operation.attempts ?? 0 ) + 1

                await diary_database.operations.update( operation.id, {
                    attempts,
                    last_error: error.message,
                    status,
                } )

                if( status === `retry` ) schedule_retry( account_id, attempts )
            }
        }
    } finally {
        sync_running = false
        if( synchronized ) window.dispatchEvent( new CustomEvent( `shad:synchronized` ) )
    }
}
