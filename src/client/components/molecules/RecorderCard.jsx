import React, { useRef, useState } from "react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { DurableRecorder, queue_media_file } from "../../modules/recorder/recorder.js"
import { sync_outbox } from "../../modules/sync/outbox.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"

const Card = styled.section`
  background: linear-gradient(150deg, #edf8fa, #fff);
  border: 1px solid #bddde4;
  border-radius: 1.5rem;
  box-shadow: var(--shadow);
  padding: clamp(1.25rem, 5vw, 2.5rem);
  text-align: center;
`

const Record = styled.button`
  align-items: center;
  background: ${ ( { $recording } ) => $recording ? `#a82c3c` : `var(--accent)` };
  border: 0;
  border-radius: 50%;
  box-shadow: 0 8px 22px rgb(57 124 141 / 28%);
  color: white;
  display: inline-flex;
  font-family: "Montserrat Variable", sans-serif;
  font-size: 1.2rem;
  height: 9rem;
  justify-content: center;
  margin: 1rem;
  width: 9rem;
`

const Secondary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .65rem;
  justify-content: center;
  margin-top: 1rem;
`

const HiddenInput = styled.input`position: absolute; height: 1px; width: 1px; opacity: 0;`

/**
 * Provide the dominant native microphone action plus secondary media capture.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function RecorderCard( { account_id, on_saved } ) {
    const [ state, set_state ] = useState( `idle` )
    const recorder = useRef( null )
    const photo_input = useRef( null )
    const video_input = useRef( null )

    async function toggle_recording() {
        try {
            if( state === `recording` ) {
                const id = await recorder.current.stop()
                set_state( `saved_local` )
                toast.success( `Recording saved on this device` )
                void sync_outbox( account_id ).then( on_saved )
                return id
            }

            recorder.current = new DurableRecorder( account_id, next => set_state( next.status ) )
            await recorder.current.start()
            set_state( `recording` )
        } catch ( error ) {
            set_state( `idle` )
            toast.error( error.message ?? `Microphone could not start` )
        }
    }

    async function selected_media( event, item_type ) {
        const [ file ] = event.target.files

        if( !file ) return

        try {
            await queue_media_file( account_id, file, item_type )
            toast.success( `${ item_type === `image` ? `Photo` : `Video` } saved on this device` )
            void sync_outbox( account_id ).then( on_saved )
        } catch ( error ) {
            toast.error( error.message ?? `Media could not be saved` )
        } finally {
            event.target.value = ``
        }
    }

    return <Card aria-labelledby="record-heading">
        <h2 id="record-heading">What happened?</h2>
        <p>Your audio is saved here before it syncs.</p>
        <Record
            $recording={ state === `recording` }
            aria-pressed={ state === `recording` }
            onClick={ toggle_recording }
            type="button"
        >{ state === `recording` ? `Stop` : `Record` }</Record>
        { state !== `idle` && <div><Status value={ state } /></div> }
        <Secondary>
            <Button onClick={ () => photo_input.current.click() }>Add photo</Button>
            <Button onClick={ () => video_input.current.click() }>Add video</Button>
        </Secondary>
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
