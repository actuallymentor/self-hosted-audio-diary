import React from "react"
import styled from "styled-components"

import { Soundscape } from "./Soundscape.jsx"

const Wrap = styled.div`
  align-items: center;
  display: grid;
  justify-items: center;
  padding: 2rem 1rem 3rem;
  text-align: center;

  h3 { margin: .75rem 0 .35rem; }
  p { color: var(--muted); margin: 0 auto 1.25rem; max-width: 36ch; }
  > svg { color: var(--muted); }
`

/**
 * Small relevant icon (or quiet artwork), concise heading and explanation, clear action.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function EmptyState( { action, artwork = false, children, heading, icon: Icon } ) {

    return <Wrap>
        { artwork ? <Soundscape size="9rem" /> : Icon && <Icon aria-hidden="true" size={ 28 } strokeWidth={ 1.5 } /> }
        <h3>{ heading }</h3>
        { children && <p>{ children }</p> }
        { action }
    </Wrap>

}
