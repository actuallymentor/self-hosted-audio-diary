import React, { useEffect, useRef, useState } from "react"
import { CloudOff, Pencil, RotateCcw, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { Link } from "react-router-dom"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { as_sentence } from "../../modules/text.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"
import { EmptyState } from "./EmptyState.jsx"
import { IconAction } from "./IconAction.jsx"
import { Modal, ModalActions } from "./Modal.jsx"

const List = styled.ol`
  display: grid;
  gap: .75rem;
  list-style: none;
  margin: 0;
  padding: 0;
`

const Item = styled.li`
  animation: shad-fade 320ms ease both;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  padding: 1rem 1.25rem;

  /* Short, capped stagger for arriving items */
  &:nth-child(2) { animation-delay: 40ms; }
  &:nth-child(3) { animation-delay: 80ms; }
  &:nth-child(n + 4) { animation-delay: 120ms; }

  audio, video, img { border-radius: .5rem; display: block; margin-top: .75rem; max-width: 100%; width: 100%; }
  time { color: var(--muted); font-size: .875rem; }
  p { margin: .6rem 0 0; white-space: pre-wrap; }
  .quiet { color: var(--muted); }
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
  margin-top: .75rem;
`

const RecordingStates = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-top: .6rem;
`

// Wide enough for every label, so the button never jumps
const SaveButton = styled( Button )`
  min-width: 8.5em;
`

const Problem = styled.p`
  background: var(--danger-bg);
  border-radius: .5rem;
  color: var(--danger-ink);
  padding: .6rem .8rem;
`

function merge_items( items, local_recordings, remote_loaded ) {
    const local_audio = local_recordings.filter( recording =>
        ( recording.item_type ?? `audio` ) === `audio`
    )
    const local_by_id = new Map( local_audio.map( recording => [ recording.id, recording ] ) )
    const remote_ids = new Set( items.map( item => item.id ) )
    const remote = items.map( item => ( {
        ...item,
        local_recording: local_by_id.get( item.id ),
        remote_present: true,
    } ) )
    const local_only = local_audio
        .filter( recording =>
            ( recording.status !== `uploaded` || !remote_loaded ) && !remote_ids.has( recording.id )
        )
        .map( recording => ( {
            capture: recording.capture,
            id: recording.id,
            local_recording: recording,
            remote_present: remote_loaded ? false : null,
            type: `audio`,
        } ) )

    return [ ...remote, ...local_only ].sort( ( left, right ) =>
        left.capture.utc.localeCompare( right.capture.utc )
    )
}

function transcription_state( item ) {
    if( item.remote_present === null ) return `transcription_unknown`
    if( !item.remote_present ) return `transcription_waiting`

    const state = item.recording_status?.transcription ?? ( item.transcript ? `complete` : `not_queued` )

    return state === `failed` ? `transcription_failed` : state
}

function remote_state( item ) {
    if( item.remote_present === null ) return `remote_unknown`

    return item.remote_present ? `remote_present` : `remote_absent`
}

function local_sync_state( item ) {
    if( item.remote_present === null && item.local_recording.status === `uploaded` ) {
        return `uploaded_previous`
    }

    return item.local_recording.status
}

/**
 * Edit a note or transcript. A failed save keeps the text and offers retry.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
function EditModal( { item, on_close, on_saved, open } ) {

    const original = ( item?.type === `text` ? item.text : item?.display_transcript ) ?? ``
    const [ text, set_text ] = useState( original )
    const [ saving, set_saving ] = useState( false )
    const [ failed, set_failed ] = useState( null )
    const changed = text.trim() && text !== original

    // A save finishing after this session ended must not close a newer one
    const alive = useRef( true )
    useEffect( () => {
        alive.current = true
        return () => {
            alive.current = false
        }
    }, [] )

    async function save( event ) {

        event.preventDefault()
        if( !changed || saving ) return

        set_saving( true )
        set_failed( null )

        try {
            await api( `/items/${ item.id }/text`, { json: { text }, method: `PATCH` } )
            await on_saved()
            toast.success( `Text updated` )
            if( alive.current ) on_close()
        } catch ( error ) {
            if( alive.current ) set_failed( error.message ?? `The server did not accept the change.` )
        } finally {
            if( alive.current ) set_saving( false )
        }

    }

    return <Modal on_close={ on_close } open={ open } title={ `Edit ${ item?.type === `text` ? `note` : `transcript` }` }>
        <form onSubmit={ save }>
            <label className="visually-hidden" htmlFor="edit-text">Text</label>
            <textarea data-autofocus id="edit-text" onChange={ event => set_text( event.target.value ) } readOnly={ saving } value={ text } />
            { failed && <Problem role="alert">Not saved. { as_sentence( failed ) } Your text is kept; try again.</Problem> }
            <ModalActions>
                <Button disabled={ saving } onClick={ on_close }>Cancel</Button>
                <SaveButton busy={ saving } disabled={ !changed || saving } primary type="submit">
                    { saving ? `Saving…` : failed ? `Try again` : `Save` }
                </SaveButton>
            </ModalActions>
        </form>
    </Modal>

}

/**
 * Render one chronological day using stable media IDs instead of archive paths.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Timeline( {
    items = [],
    local_recordings = [],
    on_changed = () => {},
    remote_loaded = false,
    remote_unavailable = false,
} ) {
    const timeline_items = merge_items( items, local_recordings, remote_loaded )
    const [ editing, set_editing ] = useState( { open: false, item: null, session: 0 } )
    const [ deleting, set_deleting ] = useState( { open: false, item: null } )

    if( !timeline_items.length ) return remote_unavailable
        ? <EmptyState heading="This day could not be loaded" icon={ CloudOff }>
            Try again when the server is available.
        </EmptyState>
        : <EmptyState action={ <Link to="/">Record an entry</Link> } artwork heading="No entries yet">
            Your day can start with one thought.
        </EmptyState>

    async function remove( item ) {

        set_deleting( current => ( { ...current, open: false } ) )

        try {
            const removed = await api( `/items/${ item.id }`, { method: `DELETE` } )
            await on_changed()
            toast( current => <span>
                Entry moved to trash. { ` ` }
                <button onClick={ async () => {
                    try {
                        await api( `/trash/${ removed.tombstone_id }/restore`, { method: `POST` } )
                        toast.dismiss( current.id )
                        await on_changed()
                        toast.success( `Entry restored` )
                    } catch ( error ) {
                        toast.error( error.message )
                    }
                } }
                >Undo</button>
            </span>, { duration: 10_000 } )
        } catch ( error ) {
            toast.error( error.message )
        }
    }

    async function retry_transcription( item ) {
        try {
            await api( `/items/${ item.id }/transcription`, { method: `POST` } )
            await on_changed()
            toast.success( `Transcription queued` )
        } catch ( error ) {
            toast.error( error.message )
        }
    }

    return <>
        <List>{ timeline_items.map( item => <Item id={ `item-${ item.id }` } key={ item.id }>
            <time dateTime={ item.capture.utc }>
                { new Date( item.capture.utc ).toLocaleTimeString( [], { hour: `2-digit`, minute: `2-digit` } ) }
            </time>
            { item.type === `audio` && <RecordingStates aria-label="Recording state">
                <Status value={ item.local_recording?.local_present ? `local_present` : `local_absent` } />
                <Status value={ remote_state( item ) } />
                <Status value={ transcription_state( item ) } />
                { item.remote_present !== true && <Status value={ local_sync_state( item ) } /> }
            </RecordingStates> }
            { item.type === `text` && <p>{ item.text }</p> }
            { item.type === `audio` && item.remote_present && <audio controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.type === `image` && <a aria-label="Open full-size diary image" href={ `/api/v1/media/${ item.id }` } rel="noreferrer" target="_blank">
                <img alt="Diary attachment" loading="lazy" src={ `/api/v1/media/${ item.id }` } />
            </a> }
            { item.type === `video` && <video controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.display_transcript && <p>{ item.display_transcript }</p> }
            { item.type === `audio` && item.recording_status?.transcription === `complete` && !item.display_transcript && <p className="quiet">No speech was detected.</p> }
            { item.local_recording?.status === `unrecoverable` && item.local_recording.last_error && <Problem>{ item.local_recording.last_error }</Problem> }
            <Actions>
                { ( item.type === `text` || item.display_transcript ) && <IconAction icon={ Pencil } label="Edit text" onClick={ () => set_editing( current => ( { open: true, item, session: current.session + 1 } ) ) } /> }
                { [ `failed`, `not_queued` ].includes( item.recording_status?.transcription ) && <IconAction icon={ RotateCcw } label="Retry transcription" onClick={ () => retry_transcription( item ) } /> }
                { item.remote_present && <IconAction icon={ Trash2 } label="Delete" onClick={ () => set_deleting( { open: true, item } ) } tone="danger" /> }
            </Actions>
        </Item> ) }</List>

        <EditModal
            item={ editing.item }
            key={ editing.session }
            on_close={ () => set_editing( current => ( { ...current, open: false } ) ) }
            on_saved={ on_changed }
            open={ editing.open }
        />

        <Modal on_close={ () => set_deleting( current => ( { ...current, open: false } ) ) } open={ deleting.open } title="Move entry to trash?">
            <p>This { deleting.item?.type === `text` ? `note` : deleting.item?.type ?? `entry` } leaves your day and moves to recoverable trash. You can undo right after.</p>
            <ModalActions>
                <Button onClick={ () => set_deleting( current => ( { ...current, open: false } ) ) }>Cancel</Button>
                <Button icon={ Trash2 } onClick={ () => remove( deleting.item ) } primary>Move to trash</Button>
            </ModalActions>
        </Modal>
    </>
}
