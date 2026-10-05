import React from "react"
import styled from "styled-components"

const Card = styled.div`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  display: grid;
  gap: .6rem;
  margin: .75rem 0;
  padding: 1rem;
`

const Bar = styled.span`
  background: var(--skeleton);
  border-radius: .3rem;
  display: block;
  height: ${ ( { $height } ) => $height };
  overflow: hidden;
  position: relative;
  width: ${ ( { $width } ) => $width };

  &::after {
    animation: shad-sweep 1800ms ease-in-out infinite;
    background: linear-gradient(90deg, transparent, var(--hover), transparent);
    content: "";
    inset: 0;
    position: absolute;
  }
`

/**
 * Layout-shaped shimmer cards that stand in for loading results.
 *
 * @param {object} props
 * @param {string} props.label - Announced loading text
 * @param {number} [props.count] - Number of placeholder cards
 * @returns {React.ReactElement}
 */
export function Skeleton( { count = 2, label } ) {

    return <div aria-busy="true" role="status">
        <span className="visually-hidden">{ label }</span>
        { Array.from( { length: count }, ( _, index ) => <Card aria-hidden="true" key={ index }>
            <Bar $height=".75rem" $width="4.5rem" />
            <Bar $height="1rem" $width="92%" />
            <Bar $height="1rem" $width={ index % 2 ? `55%` : `70%` } />
        </Card> ) }
    </div>

}
