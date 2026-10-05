import React from "react"
import { LoaderCircle } from "lucide-react"
import styled, { css } from "styled-components"

const primary = css`
  background: var(--action);
  border-color: var(--action);
  color: var(--action-ink);

  &:hover:not(:disabled) { background: var(--action-hover); border-color: var(--action-hover); }
`

const quiet = css`
  border-color: transparent;
  color: var(--muted);

  &:hover:not(:disabled) { border-color: transparent; color: var(--ink); }
`

// Narrow skewed sheen on the next important pending action.
// Moves the gradient instead of an element, so no overflow clipping eats the hit area.
const attention = css`
  &::after {
    animation: shad-sheen 3000ms ease-in-out infinite;
    background: linear-gradient(108deg, transparent 41%, rgb(255 255 255 / 26%) 50%, transparent 59%) no-repeat;
    background-size: 250% 100%;
    border-radius: inherit;
    content: "";
    inset: 0;
    pointer-events: none;
    position: absolute;
  }
`

const Element = styled.button`
  ${ ( { $variant } ) => $variant === `primary` && primary }
  ${ ( { $variant } ) => $variant === `quiet` && quiet }
  ${ ( { $attention } ) => $attention && attention }

  .spin { animation: shad-spin 900ms linear infinite; }
`

/**
 * Pill action with an optional leading Lucide icon and honest busy state.
 *
 * @param {object} props
 * @param {boolean} [props.primary] - Solid filled action
 * @param {boolean} [props.quiet] - Borderless low-emphasis action
 * @param {boolean} [props.attention] - Repeat the pending-action sheen
 * @param {boolean} [props.busy] - Swap the icon for a spinner
 * @param {React.ComponentType} [props.icon] - Lucide icon component
 * @returns {React.ReactElement}
 */
export function Button( { attention = false, busy = false, children, icon: Icon, primary = false, quiet = false, type = `button`, ...properties } ) {

    const variant = primary ? `primary` : quiet ? `quiet` : `secondary`
    const Glyph = busy ? LoaderCircle : Icon

    return <Element $attention={ attention && !busy } $variant={ variant } type={ type } { ...properties }>
        { Glyph && <Glyph aria-hidden="true" className={ busy ? `spin` : undefined } size={ 16 } strokeWidth={ 1.5 } /> }
        { children }
    </Element>

}
