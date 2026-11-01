import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { ArrowUp, ChevronDown, ChevronUp, CloudOff, RotateCcw } from "lucide-react"
import { Link } from "react-router-dom"
import { StringParam, useQueryParam } from "use-query-params"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { as_sentence, format_day } from "../../modules/text.js"
import { list_local_recordings } from "../../modules/storage/database.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"
import { Skeleton } from "../atoms/Skeleton.jsx"
import { DaySection } from "../molecules/DaySection.jsx"
import { EmptyState } from "../molecules/EmptyState.jsx"
import { Modal, ModalActions } from "../molecules/Modal.jsx"

const DAYS_PER_PAGE = 7

// Stays reachable while scrolling, so a jump never means scrolling back up first
const JumpBar = styled.div`
  align-items: end;
  background: var(--page);
  display: flex;
  gap: .75rem;
  margin: 0 -1rem 1rem;
  padding: .5rem 1rem .75rem;
  position: sticky;
  top: 0;
  z-index: 10;

  label { display: grid; flex: 0 1 14rem; gap: .25rem; min-width: 0; }
  input { min-width: 0; }
  button { margin-bottom: .375rem; }
`

const More = styled.div`
  display: flex;
  justify-content: center;
  margin: 0 0 1.5rem;
`

const Notice = styled.p`
  color: var(--muted);
  margin: 0 0 1rem;
`

const Invalid = styled( Notice )`
  color: var(--warn-ink);
`

const Partial = styled( Notice )`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: .25rem .75rem;
  max-width: none;
`

function valid_date( value ) {
    if( !/^\d{4}-\d{2}-\d{2}$/.test( value ?? `` ) || value < `0001-01-01` ) return false

    const instant = new Date( `${ value }T12:00:00Z` )

    return !Number.isNaN( instant.getTime() ) && instant.toISOString().slice( 0, 10 ) === value
}

// Equidistant days resolve to the older one, since a feed reads forward through time
function closest_date( dates, target ) {

    const distance = date => Math.abs( Date.parse( `${ date }T00:00:00Z` ) - Date.parse( `${ target }T00:00:00Z` ) )

    return dates.reduce( ( best, date ) => distance( date ) <= distance( best ) ? date : best )

}

/**
 * Keep loading older days as the end of the feed scrolls near.
 *
 * @param {Function} load_more
 * @returns {React.RefCallback} Attach to the "older" control
 */
function use_near_end( load_more ) {

    const observer = useRef( null )

    return useCallback( element => {

        observer.current?.disconnect()
        if( !element ) return

        observer.current = new IntersectionObserver( ( [ { isIntersecting } ] ) => isIntersecting && load_more(), { rootMargin: `400px` } )
        observer.current.observe( element )

    }, [ load_more ] )

}

/**
 * A feed of days that hold entries, newest first. Empty dates simply do not exist
 * here; jumping to any date lands on the closest day with entries.
 *
 * @returns {React.ReactElement}
 */
export default function CalendarPage() {

    const user = use_session( state => state.user )
    const [ requested_date, set_date ] = useQueryParam( `date`, StringParam )
    const [ index, set_index ] = useState( { dates: [], settled: false, unavailable: false } )
    const [ pages, set_pages ] = useState( { key: null, newer: 0, older: 1 } )
    const [ load_failure, set_load_failure ] = useState( null )
    const [ attempt, set_attempt ] = useState( 0 )
    const index_generation = useRef( 0 )
    const local_recordings = useLiveQuery( () => list_local_recordings( user.id ), [ user.id ], [] )

    const load_index = useCallback( async ( { quiet = false } = {} ) => {

        const generation = index_generation.current + 1
        index_generation.current = generation

        try {
            const { days } = await api( `/days` )
            if( index_generation.current === generation ) set_index( { dates: days.map( ( { local_date } ) => local_date ), settled: true, unavailable: false } )
        } catch ( error ) {
            if( index_generation.current !== generation ) return
            set_index( current => ( { ...current, settled: true, unavailable: true } ) )
            if( !quiet && navigator.onLine ) set_load_failure( error.message ?? `The server did not respond.` )
        }

    }, [] )

    useEffect( () => {
        void load_index()
    }, [ attempt, load_index ] )

    // Reconnecting with an empty outbox syncs nothing, so retry the index and every day directly
    useEffect( () => {

        const refresh = () => void load_index( { quiet: true } )
        const reconnect = () => set_attempt( current => current + 1 )

        window.addEventListener( `shad:synchronized`, refresh )
        window.addEventListener( `online`, reconnect )

        return () => {
            window.removeEventListener( `shad:synchronized`, refresh )
            window.removeEventListener( `online`, reconnect )
        }

    }, [ load_index ] )

    // Audio still on this device belongs in the feed even before the server knows it
    const pending_audio = local_recordings.filter( recording =>
        ( recording.item_type ?? `audio` ) === `audio` && ( recording.status !== `uploaded` || index.unavailable )
    )
    const pending_dates = pending_audio.map( ( { capture } ) => capture.local_date ).join()
    const dates = useMemo( () =>
        [ ...new Set( [ ...index.dates, ...pending_dates.split( `,` ).filter( Boolean ) ] ) ].sort().reverse()
    , [ index.dates, pending_dates ] )

    const invalid = Boolean( requested_date ) && !valid_date( requested_date )
    const target = requested_date && !invalid ? requested_date : null
    const anchor = target && dates.length ? closest_date( dates, target ) : dates[0]
    const anchor_index = Math.max( dates.indexOf( anchor ), 0 )

    // Paging is relative to the jump target; a new jump starts a fresh window
    const { newer, older } = pages.key === target ? pages : { newer: 0, older: 1 }
    const first = Math.max( anchor_index - newer * DAYS_PER_PAGE, 0 )
    const last = anchor_index + older * DAYS_PER_PAGE
    const visible = dates.slice( first, last )
    const has_older = last < dates.length

    // `last` is a dependency so each new page re-arms the observer if the end is still in view
    const show_older = useCallback( () => set_pages( current => {
        const base = current.key === target ? current : { key: target, newer: 0, older: 1 }
        return { ...base, older: base.older + 1 }
    } ), [ target, last ] )
    const older_control = use_near_end( show_older )

    function show_newer() {
        set_pages( { key: target, newer: newer + 1, older } )
    }

    // The jump bar is sticky, so a jump can start deep in the feed
    const landed = useRef( target )
    useEffect( () => {
        if( landed.current !== target ) window.scrollTo( 0, 0 )
        landed.current = target
    }, [ target ] )

    // A feed holds many players; starting one pauses the rest. Media events do not bubble, so capture
    useEffect( () => {

        const pause_others = ( { target: playing } ) => document.querySelectorAll( `audio, video` ).forEach( media => media !== playing && media.pause() )

        document.addEventListener( `play`, pause_others, true )
        return () => document.removeEventListener( `play`, pause_others, true )

    }, [] )

    function show_latest() {
        set_date( undefined )
        window.scrollTo( 0, 0 )
    }

    function retry() {
        set_load_failure( null )
        set_attempt( attempt + 1 )
    }

    const fail_day = useCallback( message => set_load_failure( message ), [] )
    const refresh_index = useCallback( () => void load_index( { quiet: true } ), [ load_index ] )

    return <main>
        <h2>Calendar</h2>

        <JumpBar>
            <label>Jump to date
                <input max="9999-12-31" min="0001-01-01" onChange={ event => {
                    if( valid_date( event.target.value ) ) set_date( event.target.value )
                } } type="date" value={ target ?? `` }
                />
            </label>
            <Button icon={ ArrowUp } onClick={ show_latest }>Latest</Button>
        </JumpBar>

        { invalid && <Invalid role="status">Invalid diary date. Showing the latest entries.</Invalid> }
        { target && anchor && anchor !== target && <Notice role="status">Nothing on { format_day( target ) }. Showing the closest day.</Notice> }

        { index.unavailable && dates.length > 0 && <Partial role="status">
            <span>Showing entries on this device. Older days could not be loaded.</span>
            <Button icon={ RotateCcw } onClick={ retry } quiet>Retry</Button>
        </Partial> }

        { !index.settled && <Skeleton label="Loading your diary…" /> }

        { index.settled && !dates.length && ( index.unavailable
            ? <EmptyState action={ <Button icon={ RotateCcw } onClick={ retry }>Retry</Button> } heading="Your diary could not be loaded" icon={ CloudOff }>
                Try again when the server is available.
            </EmptyState>
            : <EmptyState action={ <Link to="/">Record an entry</Link> } artwork heading="No entries yet">
                Your diary can start with one thought.
            </EmptyState> ) }

        { first > 0 && <More><Button icon={ ChevronUp } onClick={ show_newer }>Show newer days</Button></More> }

        { visible.map( date => <DaySection
            attempt={ attempt }
            date={ date }
            key={ date }
            local_recordings={ local_recordings.filter( recording => recording.capture.local_date === date ) }
            on_changed={ refresh_index }
            on_failure={ fail_day }
        /> ) }

        { has_older && <More ref={ older_control }><Button icon={ ChevronDown } onClick={ show_older }>Show older days</Button></More> }

        <Modal on_close={ () => set_load_failure( null ) } open={ Boolean( load_failure ) } title="Diary not loaded">
            <p>{ load_failure && as_sentence( load_failure ) } Entries saved on this device stay visible.</p>
            <ModalActions>
                <Button onClick={ () => set_load_failure( null ) }>Close</Button>
                <Button icon={ RotateCcw } onClick={ retry } primary>Retry</Button>
            </ModalActions>
        </Modal>
    </main>

}
