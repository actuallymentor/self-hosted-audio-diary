import React, { useCallback, useEffect, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import toast from "react-hot-toast"
import { StringParam, useQueryParam, withDefault } from "use-query-params"
import styled from "styled-components"

import { shift_day } from "../../../shared/diary_dates.js"
import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { list_local_recordings } from "../../modules/storage/database.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"
import { Timeline } from "../molecules/Timeline.jsx"

const Picker = styled.label`
  display: grid;
  gap: .4rem;
  max-width: 20rem;
`

const Navigation = styled.div`
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: .65rem;
  margin-bottom: 1.5rem;

  input { min-width: 0; width: 100%; }
`

const TagForm = styled.form`
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
  margin: 1rem 0;

  label { display: grid; flex: 1 1 12rem; gap: .35rem; }
  input { min-width: 0; width: 100%; }
`

function valid_date( value ) {
    if( !/^\d{4}-\d{2}-\d{2}$/.test( value ?? `` ) || value < `0001-01-01` ) return false

    const instant = new Date( `${ value }T12:00:00Z` )

    return !Number.isNaN( instant.getTime() ) && instant.toISOString().slice( 0, 10 ) === value
}

/**
 * Navigate historical days with a shareable date query.
 *
 * @returns {React.ReactElement}
 */
export default function CalendarPage() {
    const user = use_session( state => state.user )
    const today = current_capture().local_date
    const [ requested_date, set_date ] = useQueryParam( `date`, withDefault( StringParam, today ) )
    const date = valid_date( requested_date ) ? requested_date : today
    const [ saving_tags, set_saving_tags ] = useState( false )
    const active_date = useRef( date )
    const refresh_generation = useRef( 0 )
    const [ remote, set_remote ] = useState( {
        date: null,
        day: null,
        loaded: false,
        settled: false,
        unavailable: false,
    } )
    const selected = remote.date === date ? remote : {
        day: null,
        loaded: false,
        settled: false,
        unavailable: false,
    }
    const { day } = selected

    active_date.current = date

    const local_recordings = useLiveQuery(
        () => list_local_recordings( user.id ),
        [ user.id ],
        [],
    ).filter( recording => recording.capture.local_date === date )
    const refresh = useCallback( async ( { invalidate = false, quiet = false } = {} ) => {
        const generation = refresh_generation.current + 1

        refresh_generation.current = generation

        if( invalidate ) {
            set_remote( current => current.date === date
                ? { ...current, loaded: false, unavailable: false }
                : current
            )
        }

        try {
            const next = await api( `/days/${ date }` )

            if( active_date.current === date && refresh_generation.current === generation ) {
                set_remote( {
                    date,
                    day: next,
                    loaded: true,
                    settled: true,
                    unavailable: false,
                } )
            }
        } catch ( error ) {
            if( active_date.current !== date || refresh_generation.current !== generation ) return

            set_remote( current => ( {
                date,
                day: current.date === date ? current.day : null,
                loaded: false,
                settled: true,
                unavailable: true,
            } ) )
            if( !quiet && navigator.onLine ) toast.error( error.message )
        }
    }, [ date ] )

    useEffect( () => {
        void refresh()
    }, [ refresh ] )

    useEffect( () => {
        const synchronized = () => void refresh( { invalidate: true, quiet: true } )

        window.addEventListener( `shad:synchronized`, synchronized )
        return () => window.removeEventListener( `shad:synchronized`, synchronized )
    }, [ refresh ] )

    useEffect( () => {
        const waiting = day?.items.some( item =>
            [ `queued`, `transcribing` ].includes( item.recording_status?.transcription )
        )

        if( !waiting ) return undefined

        const timer = setInterval( () => {
            void refresh( { quiet: true } )
        }, 5_000 )

        return () => clearInterval( timer )
    }, [ day?.items, refresh ] )

    async function save_tags( event ) {
        event.preventDefault()
        const tags = event.currentTarget.elements.tags.value.split( `,` )

        set_saving_tags( true )

        try {
            await api( `/days/${ date }/tags`, { json: { tags }, method: `PUT` } )
            await refresh()
            toast.success( `Tags saved` )
        } catch ( error ) {
            toast.error( error.message )
        } finally {
            set_saving_tags( false )
        }
    }

    return <main>
        <h2>Calendar</h2>
        <Navigation>
            <Button aria-label="Previous day" disabled={ date === `0001-01-01` } onClick={ () => set_date( shift_day( date, -1 ) ) } type="button">←</Button>
            <Picker>
                <strong>Diary date</strong>
                <input max="9999-12-31" min="0001-01-01" onChange={ event => {
                    if( valid_date( event.target.value ) ) set_date( event.target.value )
                } } type="date" value={ date }
                />
            </Picker>
            <Button aria-label="Next day" disabled={ date === `9999-12-31` } onClick={ () => set_date( shift_day( date, 1 ) ) } type="button">→</Button>
            <Button onClick={ () => set_date( current_capture().local_date ) } type="button">Today</Button>
        </Navigation>
        { !valid_date( requested_date ) && <p role="status">Invalid diary date. Showing today.</p> }
        { selected.loaded && <TagForm onSubmit={ save_tags }>
            <label><strong>Day tags</strong>
                <input defaultValue={ day.tags.join( `, ` ) } key={ `${ date }:${ day.tags.join( `|` ) }` } name="tags" placeholder="family, health, idea" />
            </label>
            <Button disabled={ saving_tags } type="submit">{ saving_tags ? `Saving…` : `Save tags` }</Button>
        </TagForm> }
        { selected.unavailable && <Button onClick={ () => refresh() } type="button">Retry loading day</Button> }
        { !selected.settled ? <p>Loading your day…</p> : <Timeline
            items={ day?.items ?? [] }
            local_recordings={ local_recordings }
            on_changed={ refresh }
            remote_loaded={ selected.loaded }
            remote_unavailable={ selected.unavailable }
        /> }
    </main>
}
