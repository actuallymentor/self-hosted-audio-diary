import React, { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import toast from "react-hot-toast"
import styled from "styled-components"

import { current_capture } from "../../modules/recorder/recorder.js"
import { list_local_recordings } from "../../modules/storage/database.js"
import { queue_text, sync_outbox } from "../../modules/sync/outbox.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"
import { RecorderCard } from "../molecules/RecorderCard.jsx"

const TextForm = styled.form`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  display: grid;
  gap: .75rem;
  margin: 1rem 0 2rem;
  padding: 1rem;
`

const Pending = styled.section`
  background: #fffbea;
  border: 1px solid #ead88a;
  border-radius: 1rem;
  margin: 1rem 0;
  padding: 1rem;
`

const Uploading = styled.section`
  background: #edf8fa;
  border: 1px solid #bddde4;
  border-radius: 1rem;
  display: grid;
  gap: .65rem;
  margin: 1rem 0;
  padding: 1rem;

  small { color: var(--muted); }
`

const UploadHeading = styled.div`
  align-items: baseline;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
`

const UploadBar = styled.progress`
  accent-color: var(--accent);
  height: .8rem;
  width: 100%;
`

function upload_name( recording ) {
    if( recording.item_type === `image` ) return `photo`
    if( recording.item_type === `video` ) return `video`

    return `recording`
}

function UploadProgress( { recording } ) {
    const total_bytes = recording.byte_size ?? 0
    const uploaded_bytes = Math.min( recording.uploaded_bytes ?? 0, total_bytes )
    const finalizing = total_bytes > 0 && uploaded_bytes === total_bytes
    const percentage = total_bytes ? Math.round( uploaded_bytes / total_bytes * 100 ) : 0
    const name = upload_name( recording )

    return <Uploading aria-live="polite">
        <UploadHeading>
            <strong>{ finalizing ? `Finishing safely…` : `Uploading ${ name }…` }</strong>
            { uploaded_bytes > 0 && <span>{ percentage }%</span> }
        </UploadHeading>
        <UploadBar
            aria-label={ `${ name } upload progress` }
            max={ total_bytes || 1 }
            value={ uploaded_bytes || undefined }
        />
        <small>
            { finalizing
                ? `All bytes received. Waiting for server confirmation.`
                : `Saved on this device while the upload completes.` }
        </small>
    </Uploading>
}

/**
 * Render the minimal capture surface and relevant device outbox status.
 *
 * @returns {React.ReactElement}
 */
export function TodayPage() {
    const user = use_session( state => state.user )
    const [ writing, set_writing ] = useState( false )
    const [ saving, set_saving ] = useState( false )
    const local_recordings = useLiveQuery(
        () => list_local_recordings( user.id ),
        [ user.id ],
        [],
    )
    const pending = local_recordings.filter( recording => recording.status !== `uploaded` )
    const uploading = pending.filter( recording => recording.status === `syncing` )
    const outbox = pending.filter( recording => ![ `syncing`, `recording` ].includes( recording.status ) )


    useEffect( () => {
        void sync_outbox( user.id )
    }, [ user.id ] )

    async function save_text( event ) {
        event.preventDefault()
        const textarea = event.currentTarget.elements.note
        const text = textarea.value.trim()

        if( !text ) return

        set_saving( true )

        try {
            await queue_text( user.id, {
                capture: current_capture(),
                item_id: crypto.randomUUID(),
                operation_id: crypto.randomUUID(),
                text,
            } )
            set_writing( false )
            toast.success( `Note saved on this device` )
        } catch ( error ) {
            toast.error( error.message ?? `Note could not be saved` )
        } finally {
            set_saving( false )
        }
    }

    return <>
        <RecorderCard account_id={ user.id } on_note={ () => set_writing( true ) } />
        { uploading.map( recording => <UploadProgress key={ recording.id } recording={ recording } /> ) }
        { outbox.length > 0 && <Pending aria-live="polite">
            <strong>Device outbox</strong>
            { outbox.map( recording => <p key={ recording.id }>
                <Status value={ recording.status } />
                { recording.status === `unrecoverable` && <> — { recording.last_error }</> }
            </p> ) }
        </Pending> }
        { writing && <TextForm onSubmit={ save_text }>
            <label htmlFor="note"><strong>Write a note</strong></label>
            <textarea autoFocus id="note" name="note" placeholder="A detail worth remembering…" required />
            <Button disabled={ saving } primary type="submit">{ saving ? `Saving…` : `Save note` }</Button>
            <Button disabled={ saving } onClick={ () => set_writing( false ) } type="button">Cancel</Button>
        </TextForm> }
    </>
}
