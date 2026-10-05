import React, { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { CloudUpload, Inbox } from "lucide-react"
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
  border-radius: .75rem;
  display: grid;
  gap: .5rem;
  margin: 1rem auto 2rem;
  max-width: 40rem;
  padding: 1.25rem;

  footer { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: flex-end; margin-top: .75rem; }
`

const Panel = styled.section`
  border-radius: .75rem;
  display: grid;
  gap: .6rem;
  margin: 1rem auto;
  max-width: 40rem;
  padding: 1rem 1.25rem;

  h2 { align-items: center; display: flex; font-size: 1rem; gap: .5rem; margin: 0; }
  small { color: inherit; opacity: .85; }
  ul { display: grid; gap: .5rem; list-style: none; margin: 0; padding: 0; }
`

// Amber: kept on this device, not yet safe on the server
const Pending = styled( Panel )`
  background: var(--warn-bg);
  border: 1px solid var(--warn-line);
  color: var(--warn-ink);
`

const Uploading = styled( Panel )`
  background: var(--info-bg);
  color: var(--info-ink);
`

const UploadHeading = styled.div`
  align-items: baseline;
  display: flex;
  gap: 1rem;
  justify-content: space-between;

  span { font-variant-numeric: tabular-nums; }
`

const UploadBar = styled.progress`
  accent-color: var(--action);
  height: .5rem;
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
            <h2><CloudUpload aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />{ finalizing ? `Finishing safely…` : `Uploading ${ name }…` }</h2>
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
    const outbox = pending.filter( recording => recording.status !== `syncing`
        && ( recording.status !== `recording` || recording.item_type )
    )

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

    return <main>
        <RecorderCard account_id={ user.id } on_note={ () => set_writing( true ) } />
        { uploading.map( recording => <UploadProgress key={ recording.id } recording={ recording } /> ) }
        { outbox.length > 0 && <Pending aria-live="polite">
            <h2><Inbox aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />Device outbox</h2>
            <small>Kept safely on this device until the server confirms each item.</small>
            <ul>
                { outbox.map( recording => <li key={ recording.id }>
                    { recording.item_type && recording.status === `recording`
                        ? <span>Saving { upload_name( recording ) } on this device…</span>
                        : <Status value={ recording.status } /> }
                    { recording.status === `unrecoverable` && <> — { recording.last_error }</> }
                </li> ) }
            </ul>
        </Pending> }
        { writing && <TextForm onSubmit={ save_text }>
            <label htmlFor="note">Write a note</label>
            <textarea autoFocus id="note" name="note" placeholder="A detail worth remembering…" required />
            <footer>
                <Button disabled={ saving } onClick={ () => set_writing( false ) }>Cancel</Button>
                <Button busy={ saving } disabled={ saving } primary type="submit">{ saving ? `Saving…` : `Save note` }</Button>
            </footer>
        </TextForm> }
    </main>
}
