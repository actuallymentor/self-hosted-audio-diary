import React, { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, Tag } from "lucide-react"
import { useLocation } from "react-router-dom"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { format_day } from "../../modules/text.js"
import { Button } from "../atoms/Button.jsx"
import { Skeleton } from "../atoms/Skeleton.jsx"
import { IconAction } from "./IconAction.jsx"
import { Modal } from "./Modal.jsx"
import { TagsEditor } from "./TagsEditor.jsx"
import { Timeline } from "./Timeline.jsx"

const Section = styled.section`
  margin-bottom: 2rem;
`

const Heading = styled.header`
  align-items: center;
  display: flex;
  gap: .5rem;
  justify-content: space-between;
  margin-bottom: .5rem;
  min-height: 2.75rem;

  h3 { font-size: 1.05rem; margin: 0; }
`

const Tags = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: .25rem .75rem;
  list-style: none;
  margin: 0 0 .75rem;
  padding: 0;

  li { color: var(--muted); font-size: .875rem; }
`

const Retry = styled.div`
  margin-bottom: 1rem;
`

function day_label( date ) {

    const { local_date: today } = current_capture()
    const noon = iso => new Date( `${ iso }T12:00:00Z` )
    const days_ago = Math.round( ( noon( today ) - noon( date ) ) / 86_400_000 )

    if( days_ago === 0 ) return `Today`
    if( days_ago === 1 ) return `Yesterday`

    return format_day( date, { weekday: `long` } )

}

/**
 * One diary day inside the feed: loads itself, then stays fresh while jobs run.
 *
 * @param {object} props
 * @param {string} props.date - Local diary date
 * @param {number} props.attempt - Bumped by the page to retry every failed day
 * @param {object[]} props.local_recordings - Device recordings for this date
 * @param {Function} props.on_changed - An entry or tag changed on this day
 * @param {Function} props.on_failure - Receives a message when a visible load fails
 * @returns {React.ReactElement}
 */
export function DaySection( { attempt, date, local_recordings, on_changed, on_failure } ) {

    const [ remote, set_remote ] = useState( { day: null, loaded: false, settled: false, unavailable: false } )
    const [ tagging, set_tagging ] = useState( false )
    const refresh_generation = useRef( 0 )
    const { hash } = useLocation()
    const { day } = remote

    const refresh = useCallback( async ( { invalidate = false, quiet = false } = {} ) => {

        // Sequence requests so an older response cannot undo a newer one
        const generation = refresh_generation.current + 1
        refresh_generation.current = generation

        if( invalidate ) set_remote( current => ( { ...current, loaded: false, unavailable: false } ) )

        try {
            const next = await api( `/days/${ date }` )
            if( refresh_generation.current === generation ) set_remote( { day: next, loaded: true, settled: true, unavailable: false } )
        } catch ( error ) {
            if( refresh_generation.current !== generation ) return
            set_remote( current => ( { ...current, loaded: false, settled: true, unavailable: true } ) )
            if( !quiet && navigator.onLine ) on_failure( error.message ?? `The server did not respond.` )
        }

    }, [ date, on_failure ] )

    useEffect( () => {
        void refresh()
    }, [ attempt, refresh ] )

    useEffect( () => {

        const synchronized = () => void refresh( { invalidate: true, quiet: true } )

        window.addEventListener( `shad:synchronized`, synchronized )
        return () => window.removeEventListener( `shad:synchronized`, synchronized )

    }, [ refresh ] )

    // Transcripts land in the background; poll quietly only while one is pending
    useEffect( () => {

        const waiting = day?.items.some( item =>
            [ `queued`, `transcribing` ].includes( item.recording_status?.transcription )
        )

        if( !waiting ) return undefined

        const timer = setInterval( () => void refresh( { quiet: true } ), 5_000 )

        return () => clearInterval( timer )

    }, [ day?.items, refresh ] )

    // Search links target one entry that only exists once its day has loaded
    // Scroll once per link, so a later background refresh cannot yank the reader back
    const reached_hash = useRef( null )
    useEffect( () => {
        const owns_entry = day?.items.some( item => hash === `#item-${ item.id }` )
        if( !owns_entry || reached_hash.current === hash ) return
        reached_hash.current = hash
        document.getElementById( hash.slice( 1 ) )?.scrollIntoView( { block: `start` } )
    }, [ day, hash ] )

    async function changed() {
        await refresh()
        on_changed()
    }

    async function save_tags( tags ) {
        await api( `/days/${ date }/tags`, { json: { tags }, method: `PUT` } )
        await refresh()
    }

    return <Section aria-label={ day_label( date ) } data-date={ date }>
        <Heading>
            <h3>{ day_label( date ) }</h3>
            { day && <IconAction icon={ Tag } label="Edit tags" onClick={ () => set_tagging( true ) } /> }
        </Heading>

        { day?.tags.length > 0 && <Tags aria-label="Day tags">{ day.tags.map( tag => <li key={ tag }>#{ tag }</li> ) }</Tags> }
        { remote.unavailable && <Retry><Button icon={ RotateCcw } onClick={ () => refresh() }>Retry loading day</Button></Retry> }

        { !remote.settled ? <Skeleton count={ 1 } label="Loading your day…" /> : <Timeline
            items={ day?.items ?? [] }
            local_recordings={ local_recordings }
            on_changed={ changed }
            remote_loaded={ remote.loaded }
            remote_unavailable={ remote.unavailable }
        /> }

        { /* Stays mounted through refreshes, so a sync cannot wipe a tag draft */ }
        { day && <Modal on_close={ () => set_tagging( false ) } open={ tagging } title={ `Tags · ${ day_label( date ) }` }>
            <TagsEditor initial={ day.tags.join( `, ` ) } on_save={ save_tags } />
        </Modal> }
    </Section>

}
