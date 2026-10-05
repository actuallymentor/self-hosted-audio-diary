import React, { useEffect, useState } from "react"
import { CloudOff, RotateCcw, Search, SearchX } from "lucide-react"
import { StringParam, useQueryParam, withDefault } from "use-query-params"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { Button } from "../atoms/Button.jsx"
import { Skeleton } from "../atoms/Skeleton.jsx"
import { EmptyState } from "../molecules/EmptyState.jsx"

const Form = styled.form`
  align-items: center;
  display: grid;
  gap: .75rem;
  grid-template-columns: 1fr auto;
  margin-bottom: 1rem;
`

const Results = styled.ol`
  display: grid;
  gap: .75rem;
  list-style: none;
  margin: 0;
  padding: 0;

  /* Whole card is the link; subtle full-row hover tint */
  a {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: .75rem;
    color: inherit;
    display: grid;
    gap: .35rem;
    padding: 1rem 1.25rem;
    text-decoration: none;
    transition: background-color var(--quick) ease, border-color var(--quick) ease;
  }

  a:hover { background: var(--hover); border-color: var(--accent); }
  .meta { color: var(--link); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: .2em; }
`

const Count = styled.p`
  color: var(--muted);
  font-size: .875rem;
  margin: 0 0 .75rem;
`

// Server snippets wrap hits in <mark>; render them as elements, never as HTML
function Snippet( { text } ) {
    return text.split( /<\/?mark>/ ).map( ( part, index ) => index % 2 ? <mark key={ index }>{ part }</mark> : part )
}

/**
 * Search private FTS results with a shareable query.
 *
 * @returns {React.ReactElement}
 */
export default function SearchPage() {

    const [ query, set_query ] = useQueryParam( `q`, withDefault( StringParam, `` ) )
    const [ draft, set_draft ] = useState( query )
    const [ search, set_search ] = useState( { query: ``, results: [], status: `idle` } )
    const [ attempt, set_attempt ] = useState( 0 )

    useEffect( () => {

        if( !query ) {
            set_search( { query, results: [], status: `idle` } )
            return undefined
        }

        // Ignore responses for superseded queries
        let current = true
        set_search( { query, results: [], status: `loading` } )

        api( `/search?query=${ encodeURIComponent( query ) }` )
            .then( response => current && set_search( { query, results: response.results, status: `ready` } ) )
            .catch( error => current && set_search( { error: error.message, query, results: [], status: `failed` } ) )

        return () => {
            current = false
        }

    }, [ query, attempt ] )

    const { results, status } = search

    return <main>
        <h2>Search</h2>
        <Form role="search" onSubmit={ event => {
            event.preventDefault()
            set_query( draft.trim() )
        } }
        >
            <input aria-label="Search diary" onChange={ event => set_draft( event.target.value ) } placeholder="Words, people, places…" type="search" value={ draft } />
            <Button icon={ Search } primary type="submit">Search</Button>
        </Form>

        <section aria-live="polite">
            { status === `idle` && <EmptyState artwork heading="Search your diary">
                Notes and transcripts are searchable as soon as they reach the server.
            </EmptyState> }

            { status === `loading` && <Skeleton label="Searching…" /> }

            { status === `failed` && <EmptyState action={ <Button icon={ RotateCcw } onClick={ () => set_attempt( attempt + 1 ) }>Try again</Button> } heading="Search unavailable" icon={ CloudOff }>
                { search.error ?? `The server did not respond.` }
            </EmptyState> }

            { status === `ready` && !results.length && <EmptyState heading="No matches" icon={ SearchX }>
                Nothing matched “{ query }”. Try fewer or different words.
            </EmptyState> }

            { status === `ready` && results.length > 0 && <>
                <Count>{ results.length === 100 ? `First 100 matches` : `${ results.length } ${ results.length === 1 ? `match` : `matches` }` }</Count>
                <Results>
                    { results.map( result => <li key={ result.item_id }>
                        <a href={ `/calendar?date=${ result.local_date }#item-${ result.item_id }` }>
                            <span className="meta">{ result.local_date } · { result.type }</span>
                            <span><Snippet text={ result.snippet } /></span>
                        </a>
                    </li> ) }
                </Results>
            </> }
        </section>
    </main>

}
