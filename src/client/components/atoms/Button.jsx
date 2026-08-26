import React from "react"
import styled from "styled-components"

const Element = styled.button`
  background: ${ ( { $primary } ) => $primary ? `var(--accent)` : `var(--surface)` };
  border-color: ${ ( { $primary } ) => $primary ? `var(--accent)` : `var(--border)` };
  color: ${ ( { $primary } ) => $primary ? `white` : `var(--ink)` };
`

/**
 * Render one accessible action with consistent touch sizing.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Button( { children, primary = false, ...properties } ) {
    return <Element $primary={ primary } { ...properties }>{ children }</Element>
}
