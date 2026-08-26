import React, { useEffect, useState } from "react"
import { StringParam, useQueryParam, withDefault } from "use-query-params"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
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
    const [ date, set_date ] = useQueryParam( `date`, withDefault( StringParam, current_capture().local_date ) )
    const [ day, set_day ] = useState( null )

    useEffect( () => {
        let active = true

        api( `/days/${ date }` ).then( value => {
            if( active ) set_day( value )
        } )

        return () => {
            active = false
        }
    }, [ date ] )

    return <main>
        <h2>Calendar</h2>
        <Picker>
            <strong>Diary date</strong>
            <input onChange={ event => set_date( event.target.value ) } type="date" value={ date } />
        </Picker>
        <Timeline items={ day?.items ?? [] } />
    </main>
}
