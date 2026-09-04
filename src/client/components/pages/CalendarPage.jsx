import React, { useCallback, useEffect, useState } from "react"
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
    const [ days, set_days ] = useState( {} )
    const [ settled_dates, set_settled_dates ] = useState( {} )
    const day = days[date] ?? null
    const local_recordings = useLiveQuery(
        () => list_local_recordings( user.id ),
        [ user.id ],
        [],
    ).filter( recording => recording.capture.local_date === date )
    const refresh = useCallback( async () => {
        try {
            const next = await api( `/days/${ date }` )

            set_days( current => ( { ...current, [date]: next } ) )
        } catch ( error ) {
            if( navigator.onLine ) toast.error( error.message )
        } finally {
            set_settled_dates( current => ( { ...current, [date]: true } ) )
        }
    }, [ date ] )

    useEffect( () => {
        void refresh()
    }, [ refresh ] )

    useEffect( () => {
        const waiting = day?.items.some( item =>
            [ `queued`, `transcribing` ].includes( item.recording_status?.transcription )
        )

        if( !waiting ) return undefined

        const timer = setInterval( () => {
            void refresh()
        }, 5_000 )

        return () => clearInterval( timer )
    }, [ day?.items, refresh ] )

    return <main>
        <h2>Calendar</h2>
        <Picker>
            <strong>Diary date</strong>
            <input onChange={ event => set_date( event.target.value ) } type="date" value={ date } />
        </Picker>
        { !day && !settled_dates[date] ? <p>Loading your day…</p> : <Timeline
            items={ day?.items ?? [] }
            local_recordings={ local_recordings }
            on_changed={ refresh }
            remote_loaded={ day !== null }
        /> }
    </main>
}
