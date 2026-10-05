import React, { useEffect, useId, useRef, useState } from "react"
import { X } from "lucide-react"
import styled from "styled-components"

const Dialog = styled.dialog`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .875rem;
  box-shadow: var(--shadow);
  color: var(--ink);
  max-height: calc(100dvh - 2rem);
  max-width: min(32rem, calc(100vw - 2rem));
  overflow: auto;
  padding: 1.5rem;
  width: 100%;

  /* 500ms rise + fade in, 200ms ease-in out */
  &[open] { animation: modal-in 500ms var(--ease-out) both; }
  &[data-closing] { animation: modal-out 200ms ease-in both; }
  &::backdrop { background: rgb(0 20 26 / 45%); }
  &[open]::backdrop { animation: shad-fade 500ms var(--ease-out) both; }
  &[data-closing]::backdrop { animation: shad-fade 200ms ease-in reverse both; }

  @keyframes modal-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes modal-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px); } }

  header { align-items: start; display: flex; gap: 1rem; justify-content: space-between; margin-bottom: .75rem; }
  h2 { font-size: 1.3rem; margin: .2rem 0 0; }
  p { margin: 0 0 1rem; }
`

const Close = styled.button`
  border-color: transparent;
  color: var(--muted);
  flex: none;
`

export const ModalActions = styled.div`
  display: flex;
  flex-wrap: wrap-reverse;
  gap: .75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
`

// Prefer a marked field over the first focusable (the close button); caret at the end
function focus_preferred( dialog ) {
    const target = dialog.querySelector( `[data-autofocus]` )
    if( !target ) return
    target.focus()
    if( `setSelectionRange` in target ) target.setSelectionRange( target.value.length, target.value.length )
}

/**
 * Native modal dialog: focus containment, Escape, inert background and focus return come from <dialog>.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Function} props.on_close - Called on Escape, backdrop or close button
 * @param {string} props.title
 * @returns {React.ReactElement}
 */
export function Modal( { children, on_close, open, title } ) {

    const dialog = useRef( null )
    const [ closing, set_closing ] = useState( false )
    const title_id = useId()

    // Mirror the open prop onto the native dialog, animating the exit
    useEffect( () => {

        const element = dialog.current
        if( !element ) return undefined

        // Opening (also mid-exit) cancels any closing animation
        if( open ) {
            set_closing( false )
            if( !element.open ) {
                element.showModal()
                focus_preferred( element )
            }
            return undefined
        }

        if( !element.open ) return undefined

        const reduced = matchMedia( `(prefers-reduced-motion: reduce)` ).matches
        set_closing( true )
        const timer = setTimeout( () => {
            element.close()
            set_closing( false )
        }, reduced ? 0 : 200 )

        return () => clearTimeout( timer )

    }, [ open ] )

    return <Dialog
        aria-labelledby={ title_id }
        data-closing={ closing || undefined }
        onCancel={ event => {
            event.preventDefault()
            on_close()
        } }
        onClick={ event => event.target === dialog.current && on_close() }
        ref={ dialog }
    >
        <header>
            <h2 id={ title_id }>{ title }</h2>
            <Close aria-label="Close" onClick={ on_close } type="button">
                <X aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />
            </Close>
        </header>
        { children }
    </Dialog>

}
