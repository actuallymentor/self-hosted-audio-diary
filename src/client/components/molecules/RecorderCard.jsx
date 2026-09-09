import React, { useEffect, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import toast from "react-hot-toast"
import styled from "styled-components"

import { DurableRecorder, queue_media_file } from "../../modules/recorder/recorder.js"
import { diary_database } from "../../modules/storage/database.js"
import { sync_outbox } from "../../modules/sync/outbox.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"

const Card = styled.section`
  padding: clamp(2rem, 8vh, 5rem) 0;
  text-align: center;
`

const Record = styled.button`
  align-items: center;
  background: ${ ( { $recording } ) => $recording ? `#a82c3c` : `var(--accent)` };
  border: 0;
  border-radius: 50%;
  color: white;
  display: inline-flex;
  font-family: "Montserrat Variable", sans-serif;
  font-size: 1.2rem;
  min-height: 9rem;
  justify-content: center;
  margin: 1rem;
  min-width: 9rem;
`

const Secondary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .65rem;
  justify-content: center;
  margin-top: 1rem;
`

const More = styled( Button )`
  background: transparent;
  border-color: transparent;
  color: var(--muted);
  font-size: 1.5rem;
  margin-top: 1rem;
`

const HiddenInput = styled.input`display: none;`

/**
 * Provide the dominant native microphone action plus secondary media capture.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function RecorderCard( { account_id, on_note } ) {
    const [ state, set_state ] = useState( `idle` )
    const [ recording_id, set_recording_id ] = useState( null )
    const [ expanded, set_expanded ] = useState( false )
    const [ busy, set_busy ] = useState( false )
    const more_button = useRef( null )
    const mounted = useRef( true )
    const recorder = useRef( null )
    const starting = useRef( false )
    const photo_input = useRef( null )
    const video_input = useRef( null )
    const saved_recording = useLiveQuery(
        () => recording_id ? diary_database.recordings.get( recording_id ) : null,
        [ recording_id ],
        null,
    )
    const visible_state = saved_recording?.status ?? state
    const recording = visible_state === `recording`
    const button_label = busy ? state === `recording` ? `Saving…` : `Starting…` : recording ? `Stop` : `Record`

    useEffect( () => {
        mounted.current = true

        const protect_capture = event => {
            if( recorder.current?.recorder?.state !== `recording` ) return

            event.preventDefault()
            event.returnValue = ``
        }

        window.addEventListener( `beforeunload`, protect_capture )

        return () => {
            mounted.current = false
            window.removeEventListener( `beforeunload`, protect_capture )

            // Let pending startup finish its wake-lock setup before stopping capture.
            if( !starting.current && recorder.current?.recorder?.state === `recording` ) {
                void recorder.current.stop().catch( error => toast.error( error.message ) )
            }
        }
    }, [] )

    async function toggle_recording() {
        if( busy ) return

        set_busy( true )

        try {
            if( state === `recording` ) {
                await recorder.current.stop()
                return
            }

            recorder.current = new DurableRecorder( account_id, next => {
                set_state( next.status )
                set_recording_id( next.id )

                if( next.status === `saved_local` ) {
                    toast.success( mounted.current ? `Recording saved on this device` : `Recording stopped and saved on this device` )
                    void sync_outbox( account_id )
                }
            } )
            starting.current = true
            await recorder.current.start()
            starting.current = false

            // Permission and wake-lock requests can finish after leaving this page.
            if( !mounted.current ) await recorder.current.stop()
        } catch ( error ) {
            set_state( `idle` )
            toast.error( error.message ?? `Microphone could not start` )
        } finally {
            starting.current = false
            set_busy( false )
        }
    }

    async function selected_media( event, item_type ) {
        const [ file ] = event.target.files

        if( !file ) return

        try {
            await queue_media_file( account_id, file, item_type )
            toast.success( `${ item_type === `image` ? `Photo` : `Video` } saved on this device` )
            void sync_outbox( account_id )
        } catch ( error ) {
            toast.error( error.message ?? `Media could not be saved` )
        } finally {
            event.target.value = ``
        }
    }

    function close_options() {
        set_expanded( false )
        more_button.current?.focus()
    }

    function write_note() {
        close_options()
        on_note()
    }

    function choose_media( input ) {
        close_options()
        input.current.click()
    }

    return <Card aria-label="Capture a diary entry" onKeyDown={ event => {
        if( event.key === `Escape` && expanded ) close_options()
    } }
    >
        <Record
            $recording={ recording }
            aria-pressed={ recording }
            disabled={ busy }
            onClick={ toggle_recording }
            type="button"
        >{ button_label }</Record>
        { ![ `idle`, `uploaded` ].includes( visible_state ) && <div aria-live="polite"><Status value={ visible_state } /></div> }
        <div>
            <More
                ref={ more_button }
                aria-controls="capture-options"
                aria-expanded={ expanded }
                aria-label="Add entry"
                onClick={ () => set_expanded( !expanded ) }
                type="button"
            >{ expanded ? `−` : `+` }</More>
        </div>
        { expanded && <Secondary id="capture-options">
            <Button onClick={ write_note } type="button">Note</Button>
            <Button onClick={ () => choose_media( photo_input ) } type="button">Photo</Button>
            <Button onClick={ () => choose_media( video_input ) } type="button">Video</Button>
        </Secondary> }
        <HiddenInput
            ref={ photo_input }
            accept="image/*"
            aria-label="Choose photo"
            onChange={ event => selected_media( event, `image` ) }
            type="file"
        />
        <HiddenInput
            ref={ video_input }
            accept="video/*"
            aria-label="Choose video"
            onChange={ event => selected_media( event, `video` ) }
            type="file"
        />
    </Card>
}
