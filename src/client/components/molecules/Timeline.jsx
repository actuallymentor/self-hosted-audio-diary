import React from "react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"

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

/**
 * Render one chronological day using stable media IDs instead of archive paths.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Timeline( { items = [], on_changed = () => {} } ) {
    if( !items.length ) return <p>No entries yet. Your day can start with one thought.</p>

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

    return <List>
        { items.map( item => <Item id={ `item-${ item.id }` } key={ item.id }>
            <time dateTime={ item.capture.utc }>
                { new Date( item.capture.utc ).toLocaleTimeString( [], { hour: `2-digit`, minute: `2-digit` } ) }
            </time>
            { item.type === `text` && <p>{ item.text }</p> }
            { item.type === `audio` && <audio controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.type === `image` && <a aria-label="Open full-size diary image" href={ `/api/v1/media/${ item.id }` } rel="noreferrer" target="_blank">
                <img alt="Diary attachment" loading="lazy" src={ `/api/v1/media/${ item.id }` } />
            </a> }
            { item.type === `video` && <video controls preload="metadata" src={ `/api/v1/media/${ item.id }` } /> }
            { item.display_transcript && <p>{ item.display_transcript }</p> }
            { ( item.type === `text` || item.display_transcript ) && <button onClick={ () => edit( item ) } type="button">Edit text</button> }
            { ` ` }<button onClick={ () => remove( item ) } type="button">Delete</button>
        </Item> ) }
    </List>
}
