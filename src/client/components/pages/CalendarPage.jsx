import React, { useCallback, useEffect, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import toast from "react-hot-toast"
import { StringParam, useQueryParam, withDefault } from "use-query-params"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { list_local_recordings } from "../../modules/storage/database.js"
import { use_session } from "../../stores/session.js"
import { Timeline } from "../molecules/Timeline.jsx"

const Picker = styled.label`
  display: grid;
  gap: .4rem;
  max-width: 20rem;
`

/**
 * Navigate historical days with a shareable date query.
 *
 * @returns {React.ReactElement}
 */
export default function CalendarPage() {
    const user = use_session( state => state.user )
    const [ date, set_date ] = useQueryParam( `date`, withDefault( StringParam, current_capture().local_date ) )
    const active_date = useRef( date )
    const refresh_generation = useRef( 0 )
    const [ remote, set_remote ] = useState( {
        date: null,
        day: null,
        loaded: false,
        settled: false,
    } )
    const selected = remote.date === date ? remote : {
        day: null,
        loaded: false,
        settled: false,
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
                ? { ...current, loaded: false }
                : current
            )
        }

        try {
            const next = await api( `/days/${ date }` )

            if( active_date.current === date && refresh_generation.current === generation ) {
                set_remote( { date, day: next, loaded: true, settled: true } )
            }
        } catch ( error ) {
            if( active_date.current !== date || refresh_generation.current !== generation ) return

            set_remote( current => ( {
                date,
                day: current.date === date ? current.day : null,
                loaded: false,
                settled: true,
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

    return <main>
        <h2>Calendar</h2>
        <Picker>
            <strong>Diary date</strong>
            <input onChange={ event => set_date( event.target.value ) } type="date" value={ date } />
        </Picker>
        { !selected.settled ? <p>Loading your day…</p> : <Timeline
            items={ day?.items ?? [] }
            local_recordings={ local_recordings }
            on_changed={ refresh }
            remote_loaded={ selected.loaded }
        /> }
    </main>
}
