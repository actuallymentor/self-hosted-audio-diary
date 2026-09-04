import React from "react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { Status } from "../atoms/Status.jsx"

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`

const Item = styled.li`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  margin: .8rem 0;
  padding: 1rem;

  audio, video, img { border-radius: .7rem; margin-top: .6rem; max-width: 100%; width: 100%; }
  time { color: var(--muted); font-size: .82rem; }
  p { max-width: 70ch; white-space: pre-wrap; }
`

const RecordingStates = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .45rem;
  margin-top: .65rem;
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
} ) {
    const timeline_items = merge_items( items, local_recordings, remote_loaded )

    if( !timeline_items.length ) return <p>No entries yet. Your day can start with one thought.</p>

    async function edit( item ) {
        const current = item.type === `text` ? item.text : item.display_transcript
        const text = window.prompt( `Edit ${ item.type === `text` ? `note` : `transcript` }`, current ?? `` )

        if( !text?.trim() ) return

        try {
            await api( `/items/${ item.id }/text`, { json: { text }, method: `PATCH` } )
            await on_changed()
        } catch ( error ) {
            toast.error( error.message )
        }
    }

    async function remove( item ) {
        if( !window.confirm( `Move this ${ item.type } entry to recoverable trash?` ) ) return

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

    return <List>
        { timeline_items.map( item => <Item id={ `item-${ item.id }` } key={ item.id }>
            <time dateTime={ item.capture.utc }>
                { new Date( item.capture.utc ).toLocaleTimeString( [], { hour: `2-digit`, minute: `2-digit` } ) }
            </time>
            { item.type === `audio` && <RecordingStates aria-label="Recording state">
                <Status value={ item.local_recording?.local_present ? `local_present` : `local_absent` } />
                <Status value={ remote_state( item ) } />
                <Status value={ transcription_state( item ) } />
                { item.remote_present !== true && <Status value={ item.local_recording.status } /> }
            </RecordingStates> }
            { item.type === `text` && <p>{ item.text }</p> }
            { item.type === `audio` && item.remote_present && <audio controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.type === `image` && <a aria-label="Open full-size diary image" href={ `/api/v1/media/${ item.id }` } rel="noreferrer" target="_blank">
                <img alt="Diary attachment" loading="lazy" src={ `/api/v1/media/${ item.id }` } />
            </a> }
            { item.type === `video` && <video controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.display_transcript && <p>{ item.display_transcript }</p> }
            { item.type === `audio` && item.recording_status?.transcription === `complete` && !item.display_transcript && <p>No speech was detected.</p> }
            { ( item.type === `text` || item.display_transcript ) && <button onClick={ () => edit( item ) } type="button">Edit text</button> }
            { [ `failed`, `not_queued` ].includes( item.recording_status?.transcription ) && <button onClick={ () => retry_transcription( item ) } type="button">Retry transcription</button> }
            { item.remote_present && <>{ ` ` }<button onClick={ () => remove( item ) } type="button">Delete</button></> }
        </Item> ) }
    </List>
}
