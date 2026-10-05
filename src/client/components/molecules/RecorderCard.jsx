import React, { useEffect, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Camera, LoaderCircle, Mic, NotebookPen, Plus, Square, Video, X } from "lucide-react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { DurableRecorder, queue_media_file } from "../../modules/recorder/recorder.js"
import { diary_database } from "../../modules/storage/database.js"
import { sync_outbox } from "../../modules/sync/outbox.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"

const Card = styled.section`
  align-items: center;
  display: flex;
  flex-direction: column;
  padding: clamp(2rem, 9vh, 5rem) 0 1rem;
  text-align: center;
`

// The one dominant control: large round target, icon above label
const Record = styled.button`
  background: ${ ( { $recording } ) => $recording ? `var(--danger)` : `var(--action)` };
  border: 0;
  box-shadow: var(--shadow);
  color: #ffffff;
  flex-direction: column;
  font-family: "Montserrat Variable", Montserrat, system-ui, sans-serif;
  font-size: 1.1rem;
  font-weight: 500;
  gap: .4rem;
  height: 9rem;
  margin: 1rem;
  width: 9rem;

  &:hover:not(:disabled) {
    background: ${ ( { $recording } ) => $recording ? `var(--danger)` : `var(--action-hover)` };
    border-color: transparent;
    filter: brightness(1.05);
  }

  &::before { inset: 0; }
  .spin { animation: shad-spin 900ms linear infinite; }
`

const StatusLine = styled.div`
  min-height: 2rem;
`

const Secondary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
  justify-content: center;
  margin-top: 1rem;

  > * { animation: shad-fade 240ms ease both; }
  > :nth-child(2) { animation-delay: 40ms; }
  > :nth-child(3) { animation-delay: 80ms; }
`

const More = styled( Button )`
  border-color: transparent;
  color: var(--muted);
  margin-top: .5rem;
`

const HiddenInput = styled.input`display: none;`

function RecordGlyph( { busy, recording } ) {
    const Glyph = busy ? LoaderCircle : recording ? Square : Mic
    return <Glyph aria-hidden="true" className={ busy ? `spin` : undefined } size={ 28 } strokeWidth={ 1.5 } />
}

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
    const [ pending_action, set_pending_action ] = useState( null )
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
    const busy = Boolean( pending_action )
    const button_label = pending_action ?? ( recording ? `Stop` : `Record` )

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
                void recorder.current.stop( { discard_empty: true } ).catch( error => toast.error( error.message ) )
            }
        }
    }, [] )

    async function toggle_recording() {
        if( busy ) return

        set_pending_action( state === `recording` ? `Saving…` : `Starting…` )

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
            await recorder.current.start( () => mounted.current )
            starting.current = false

            // Permission and wake-lock requests can finish after leaving this page.
            if( !mounted.current ) await recorder.current.stop( { discard_empty: true } )
        } catch ( error ) {
            set_state( `idle` )
            toast.error( error.message ?? `Microphone could not start` )
        } finally {
            starting.current = false
            set_pending_action( null )
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
        >
            <RecordGlyph busy={ busy } recording={ recording } />
            { button_label }
        </Record>
        <StatusLine aria-live="polite">{ ![ `idle`, `uploaded` ].includes( visible_state ) && <Status value={ visible_state } /> }</StatusLine>
        <More
            ref={ more_button }
            aria-controls="capture-options"
            aria-expanded={ expanded }
            aria-label="Add entry"
            icon={ expanded ? X : Plus }
            onClick={ () => set_expanded( !expanded ) }
        />
        { expanded && <Secondary id="capture-options">
            <Button icon={ NotebookPen } onClick={ write_note }>Note</Button>
            <Button icon={ Camera } onClick={ () => choose_media( photo_input ) }>Photo</Button>
            <Button icon={ Video } onClick={ () => choose_media( video_input ) }>Video</Button>
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
