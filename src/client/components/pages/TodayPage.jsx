import React, { useCallback, useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { diary_database } from "../../modules/storage/database.js"
import { queue_text, sync_outbox } from "../../modules/sync/outbox.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"
import { Status } from "../atoms/Status.jsx"
import { RecorderCard } from "../molecules/RecorderCard.jsx"
import { Timeline } from "../molecules/Timeline.jsx"

const Heading = styled.div`
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-top: 2rem;
`

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

const TagForm = styled.form`
  align-items: end;
  display: grid;
  gap: .75rem;
  grid-template-columns: 1fr auto;
  margin: 1rem 0;

  label { display: grid; gap: .35rem; }
`

/**
 * Render the one-hand capture surface and today's canonical timeline.
 *
 * @returns {React.ReactElement}
 */
export function TodayPage() {
    const user = use_session( state => state.user )
    const { local_date } = current_capture()
    const [ day, set_day ] = useState( { items: [], tags: [] } )
    const [ loading, set_loading ] = useState( true )
    const pending = useLiveQuery(
        () => diary_database.recordings.where( `account_id` ).equals( user.id ).toArray(),
        [ user.id ],
        [],
    ).filter( recording => recording.status !== `uploaded` )

    const refresh = useCallback( async () => {
        try {
            const next = await api( `/days/${ local_date }` )
            set_day( next )
        } catch ( error ) {
            if( navigator.onLine ) toast.error( error.message )
        } finally {
            set_loading( false )
        }
    }, [ local_date ] )

    useEffect( () => {
        void refresh()
        void sync_outbox( user.id ).then( refresh )

        window.addEventListener( `shad:synchronized`, refresh )

        return () => window.removeEventListener( `shad:synchronized`, refresh )
    }, [ refresh, user.id ] )

    async function save_text( event ) {
        event.preventDefault()
        const textarea = event.currentTarget.elements.note
        const text = textarea.value.trim()

        if( !text ) return

        await queue_text( user.id, {
            capture: current_capture(),
            item_id: crypto.randomUUID(),
            operation_id: crypto.randomUUID(),
            text,
        } )
        textarea.value = ``
        toast.success( `Note saved on this device` )
        setTimeout( () => void refresh(), 500 )
    }

    async function save_tags( event ) {
        event.preventDefault()
        const tags = event.currentTarget.elements.tags.value.split( `,` )

        try {
            await api( `/days/${ local_date }/tags`, { json: { tags }, method: `PUT` } )
            await refresh()
            toast.success( `Tags saved` )
        } catch ( error ) {
            toast.error( error.message )
        }
    }

    return <>
        <RecorderCard account_id={ user.id } on_saved={ refresh } />
        { pending.length > 0 && <Pending aria-live="polite">
            <strong>Device outbox</strong>
            { pending.map( recording => <p key={ recording.id }>
                <Status value={ recording.status } />
                { recording.status === `unrecoverable` && <> — { recording.last_error }</> }
            </p> ) }
        </Pending> }
        <TextForm onSubmit={ save_text }>
            <label htmlFor="note"><strong>Write a note</strong></label>
            <textarea id="note" name="note" placeholder="A detail worth remembering…" />
            <Button type="submit">Save note</Button>
        </TextForm>
        <Heading>
            <h2>Today</h2>
            <time dateTime={ local_date }>{ new Date( `${ local_date }T12:00:00` ).toLocaleDateString( [], {
                day: `numeric`, month: `long`, weekday: `long`,
            } ) }</time>
        </Heading>
        <TagForm onSubmit={ save_tags }>
            <label><strong>Day tags</strong>
                <input defaultValue={ day.tags.join( `, ` ) } key={ day.tags.join( `|` ) } name="tags" placeholder="family, health, idea" />
            </label>
            <Button type="submit">Save tags</Button>
        </TagForm>
        { loading ? <p>Loading your day…</p> : <Timeline items={ day.items } on_changed={ refresh } /> }
    </>
}
