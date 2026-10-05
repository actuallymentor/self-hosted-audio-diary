import React, { useRef, useState } from "react"
import styled from "styled-components"

const Element = styled.button`
  border-color: transparent;
  color: var(--muted);
  gap: 0;
  padding: .3em .55rem;

  .label {
    display: inline-block;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-width 240ms var(--ease-out), opacity 240ms ease, margin 240ms var(--ease-out);
    white-space: nowrap;
  }

  &:hover:not(:disabled), &:focus-visible, &[data-revealed] {
    border-color: var(--border-strong);
    color: var(--ink);
    padding-right: .875rem;

    .label { margin-left: .4em; max-width: 12em; opacity: 1; }
  }

  &[data-tone="danger"]:hover:not(:disabled),
  &[data-tone="danger"]:focus-visible,
  &[data-tone="danger"][data-revealed] { color: var(--danger-ink); }
`

/**
 * Compact item action: icon at rest, icon + label on hover/focus.
 * Touch: a 450ms hold reveals the label without activating; a separate tap activates.
 *
 * @param {object} props
 * @param {React.ComponentType} props.icon - Lucide icon
 * @param {string} props.label - Visible and accessible name
 * @returns {React.ReactElement}
 */
export function IconAction( { icon: Icon, label, onClick, tone, ...properties } ) {

    const [ revealed, set_revealed ] = useState( false )
    const hold = useRef( { timer: null, x: 0, y: 0, swallow: false } )

    function press( event ) {
        hold.current.swallow = false
        if( event.pointerType !== `touch` ) return
        hold.current.x = event.clientX
        hold.current.y = event.clientY
        hold.current.timer = setTimeout( () => {
            hold.current.swallow = true
            set_revealed( true )
        }, 450 )
    }

    function cancel() {
        clearTimeout( hold.current.timer )
    }

    // Scrolling or dragging cancels the hold
    function move( event ) {
        if( Math.hypot( event.clientX - hold.current.x, event.clientY - hold.current.y ) > 10 ) cancel()
    }

    function click( event ) {
        // Releasing a long-press must not activate
        if( hold.current.swallow ) {
            hold.current.swallow = false
            event.preventDefault()
            return
        }
        onClick?.( event )
    }

    return <Element
        data-revealed={ revealed || undefined }
        data-tone={ tone }
        onBlur={ () => set_revealed( false ) }
        onClick={ click }
        onContextMenu={ event => event.pointerType === `touch` || hold.current.swallow ? event.preventDefault() : undefined }
        onPointerCancel={ cancel }
        onPointerDown={ press }
        onPointerLeave={ cancel }
        onPointerMove={ move }
        onPointerUp={ cancel }
        type="button"
        { ...properties }
    >
        <Icon aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />
        <span className="label">{ label }</span>
    </Element>

}
