import React, { useEffect, useState } from "react"
import { StringParam, useQueryParam, withDefault } from "use-query-params"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"

const Form = styled.form`
  display: grid;
  gap: .7rem;
  grid-template-columns: 1fr auto;
`

const Results = styled.ol`
  list-style: none;
  padding: 0;

  li { background: white; border: 1px solid var(--border); border-radius: 1rem; margin: .8rem 0; padding: 1rem; }
  a { display: block; font-weight: 800; margin-bottom: .35rem; }
`

/**
 * Search private FTS results with a shareable query.
 *
 * @returns {React.ReactElement}
 */
export default function SearchPage() {
    const [ query, set_query ] = useQueryParam( `q`, withDefault( StringParam, `` ) )
    const [ draft, set_draft ] = useState( query )
    const [ results, set_results ] = useState( [] )

    useEffect( () => {
        if( !query ) return set_results( [] )

        api( `/search?query=${ encodeURIComponent( query ) }` ).then( response => set_results( response.results ) )
    }, [ query ] )

    return <main>
        <h2>Search</h2>
        <Form onSubmit={ event => {
            event.preventDefault(); set_query( draft )
        } }
        >
            <input aria-label="Search diary" onChange={ event => set_draft( event.target.value ) } placeholder="Words, people, places…" value={ draft } />
            <button type="submit">Search</button>
        </Form>
        <Results aria-live="polite">
            { results.map( result => <li key={ result.item_id }>
                <a href={ `/calendar?date=${ result.local_date }#item-${ result.item_id }` }>{ result.local_date } · { result.type }</a>
                <span>{ result.snippet.replaceAll( `<mark>`, `` ).replaceAll( `</mark>`, `` ) }</span>
            </li> ) }
        </Results>
    </main>
}
