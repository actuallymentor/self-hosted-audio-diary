import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

import { diary_database } from "../storage/database.js"

export const recording_lock_prefix = `shad:recording:`
const active_recordings = new Set()

/**
 * Check this tab's live capture registry when Web Locks are unavailable.
 *
 * @param {string} recording_id
 * @returns {boolean}
 */
export function recording_is_active( recording_id ) {
    return active_recordings.has( recording_id )
}

function sensory_feedback( frequency ) {
    if( localStorage.getItem( `shad:haptics` ) === `true` ) navigator.vibrate?.( 20 )
    if( localStorage.getItem( `shad:sounds` ) !== `true` ) return

    const AudioContext = window.AudioContext ?? window.webkitAudioContext

    if( !AudioContext ) return

    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.frequency.value = frequency
    gain.gain.value = 0.04
    oscillator.connect( gain ).connect( context.destination )
    oscillator.start()
    oscillator.stop( context.currentTime + 0.08 )
    oscillator.addEventListener( `ended`, () => void context.close() )
}

/**
 * Pick the strongest browser-native recording container available.
 *
 * @returns {string}
 */
export function preferred_audio_mime() {
    return [
        `audio/webm;codecs=opus`,
        `audio/mp4;codecs=mp4a.40.2`,
        `audio/webm`,
        `audio/mp4`,
    ].find( value => MediaRecorder.isTypeSupported( value ) ) ?? ``
}

/**
 * Capture the browser's instant, IANA zone, offset, and canonical local date.
 *
 * @returns {object}
 */
export function current_capture() {
    const now = new Date()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const parts = new Intl.DateTimeFormat( `en-CA`, {
        day: `2-digit`,
        month: `2-digit`,
        timeZone: timezone,
        year: `numeric`,
    } ).formatToParts( now )
    const values = Object.fromEntries( parts.map( part => [ part.type, part.value ] ) )

    return {
        local_date: `${ values.year }-${ values.month }-${ values.day }`,
        offset_minutes: -now.getTimezoneOffset(),
        timezone,
        utc: now.toISOString(),
    }
}

/**
 * Record exact emitted browser bytes into IndexedDB before claiming local safety.
 */
export class DurableRecorder {
    /**
   * @param {string} account_id
   * @param {(state: object) => void} on_state
   */
    constructor( account_id, on_state ) {
        this.account_id = account_id
        this.on_state = on_state
        this.id = crypto.randomUUID()
        this.mime = preferred_audio_mime()
        this.capture = current_capture()
        this.sequence = 0
        this.persistence = Promise.resolve()
        this.hasher = sha256.create()
        this.byte_size = 0
        this.wake_lock = null
        this.release_recording_lock = null
        this.stop_promise = null
        this.resume_wake_lock = () => {
            if( document.visibilityState === `visible` && this.recorder?.state === `recording` ) {
                void this.acquire_wake_lock()
            }
        }
    }

    /** Start native microphone capture and an ordered persistence queue. */
    async start() {
        const stream = await navigator.mediaDevices.getUserMedia( { audio: true } )

        this.stream = stream
        this.recorder = new MediaRecorder( stream, {
            audioBitsPerSecond: 128_000,
            ... this.mime ? { mimeType: this.mime } : {} ,
        } )
        const [ recorder_mime ] = this.recorder.mimeType.split( `;` )
        this.mime = recorder_mime

        await this.hold_recording_lock()
        active_recordings.add( this.id )

        try {
            await diary_database.recordings.put( {
                account_id: this.account_id,
                attempts: 0,
                byte_size: 0,
                capture: this.capture,
                created_at: Date.now(),
                id: this.id,
                mime: this.mime,
                status: `recording`,
            } )
        } catch ( error ) {
            active_recordings.delete( this.id )
            this.release_recording_lock?.()
            stream.getTracks().forEach( track => track.stop() )
            throw error
        }

        this.recorder.addEventListener( `dataavailable`, event => {
            if( !event.data.size ) return

            const sequence = this.sequence++

            // Recorder callbacks may overlap. One promise chain preserves exact byte order.
            this.persistence = this.persistence.then( async () => {
                const bytes = new Uint8Array( await event.data.arrayBuffer() )
                const chunk_hash = bytesToHex( sha256( bytes ) )

                this.hasher.update( bytes )
                this.byte_size += bytes.byteLength

                await diary_database.transaction(
                    `rw`,
                    diary_database.chunks,
                    diary_database.recordings,
                    async () => {
                        await diary_database.chunks.put( {
                            account_id: this.account_id,
                            blob: event.data,
                            byte_size: bytes.byteLength,
                            recording_id: this.id,
                            sequence,
                            sha256: chunk_hash,
                        } )
                        await diary_database.recordings.update( this.id, { byte_size: this.byte_size } )
                    },
                )
            } )
        } )
        this.stream.getTracks().forEach( track => {
            track.addEventListener( `ended`, () => {
                void this.stop().catch( error => this.on_state( {
                    error: error.message,
                    id: this.id,
                    status: `unrecoverable`,
                } ) )
            }, { once: true } )
        } )

        this.recorder.start( 5_000 )
        await this.acquire_wake_lock()
        document.addEventListener( `visibilitychange`, this.resume_wake_lock )
        sensory_feedback( 620 )
        this.on_state( { id: this.id, status: `recording` } )
    }

    /** Stop only after the final recorder event and all IndexedDB writes complete. */
    stop() {
        this.stop_promise ??= this.finish_stop()

        return this.stop_promise
    }

    async finish_stop() {
        if( !this.recorder ) return undefined

        try {
            if( this.recorder.state !== `inactive` ) {
                const stopped = new Promise( resolve => this.recorder.addEventListener( `stop`, resolve, { once: true } ) )

                this.recorder.requestData()
                this.recorder.stop()
                await stopped
            }

            await this.persistence
            sensory_feedback( 420 )

            if( !this.byte_size ) {
                await diary_database.recordings.update( this.id, {
                    last_error: `No audio bytes were saved before capture ended.`,
                    status: `unrecoverable`,
                } )
                this.on_state( { id: this.id, status: `unrecoverable` } )

                return this.id
            }

            const whole_sha256 = bytesToHex( this.hasher.digest() )

            await diary_database.recordings.update( this.id, {
                byte_size: this.byte_size,
                status: `saved_local`,
                whole_sha256,
            } )
            this.on_state( { id: this.id, status: `saved_local` } )

            return this.id
        } finally {
            this.stream.getTracks().forEach( track => track.stop() )
            await this.wake_lock?.release?.()
            document.removeEventListener( `visibilitychange`, this.resume_wake_lock )
            active_recordings.delete( this.id )
            this.release_recording_lock?.()
        }
    }

    /** Acquire optional screen wake lock without making capture depend on it. */
    async acquire_wake_lock() {
        try {
            this.wake_lock = await navigator.wakeLock?.request( `screen` )
        } catch {
            this.wake_lock = null
        }
    }

    /** Hold a cross-tab lock so another PWA window cannot recover live capture. */
    async hold_recording_lock() {
        if( !navigator.locks?.request ) return

        const ready = Promise.withResolvers()
        const holding = Promise.withResolvers()

        this.release_recording_lock = holding.resolve
        this.recording_lock_task = navigator.locks.request(
            `${ recording_lock_prefix }${ this.id }`,
            async () => {
                ready.resolve()
                await holding.promise
            },
        ).catch( error => ready.reject( error ) )

        await ready.promise
    }
}

/**
 * Persist a selected image or video in bounded chunks for the shared outbox.
 *
 * @param {string} account_id
 * @param {File} file
 * @param {'image' | 'video'} item_type
 * @returns {Promise<string>}
 */
export async function queue_media_file( account_id, file, item_type ) {
    const id = crypto.randomUUID()
    const hasher = sha256.create()
    const part_size = 2 * 1024 * 1024
    let sequence = 0

    await diary_database.recordings.put( {
        account_id,
        attempts: 0,
        byte_size: file.size,
        capture: current_capture(),
        created_at: Date.now(),
        id,
        item_type,
        mime: file.type,
        name: file.name,
        status: `recording`,
    } )

    for( let start = 0; start < file.size; start += part_size ) {
        const blob = file.slice( start, Math.min( file.size, start + part_size ), file.type )
        const bytes = new Uint8Array( await blob.arrayBuffer() )

        hasher.update( bytes )
        await diary_database.chunks.put( {
            account_id,
            blob,
            byte_size: bytes.byteLength,
            recording_id: id,
            sequence,
            sha256: bytesToHex( sha256( bytes ) ),
        } )
        sequence += 1
    }

    await diary_database.recordings.update( id, {
        status: `saved_local`,
        whole_sha256: bytesToHex( hasher.digest() ),
    } )

    return id
}
