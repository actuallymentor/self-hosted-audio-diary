import React, { useEffect, useRef, useState } from "react"
import { Check, TriangleAlert } from "lucide-react"
import styled from "styled-components"

import { as_sentence } from "../../modules/text.js"
import { Button } from "../atoms/Button.jsx"
import { Modal, ModalActions } from "./Modal.jsx"

const Form = styled.form`
  display: grid;
  gap: .5rem;
  margin: 0 0 1.5rem;

  .row { align-items: center; display: flex; gap: .5rem; }
  footer { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: flex-end; }
`

const Badge = styled.span`
  background: var(--warn-bg);
  border-radius: 999px;
  color: var(--warn-ink);
  font-size: .75rem;
  font-weight: 500;
  padding: .1rem .5rem;
`

// Amber banner immediately above Save/Discard; fades and collapses (200ms) when clean
const Banner = styled.div`
  display: grid;
  grid-template-rows: ${ ( { $open } ) => $open ? `1fr` : `0fr` };
  opacity: ${ ( { $open } ) => $open ? 1 : 0 };
  transition: grid-template-rows 200ms ease, opacity 200ms ease;

  > div { overflow: hidden; }

  p {
    align-items: center;
    background: var(--warn-bg);
    border: 1px solid var(--warn-line);
    border-radius: .5rem;
    color: var(--warn-ink);
    display: flex;
    gap: .5rem;
    margin: .25rem 0;
    max-width: none;
    padding: .5rem .75rem;
  }
`

// Wide enough for every label, so the button never jumps
const SaveButton = styled( Button )`
  min-width: 11em;
`

const PAUSE_BEFORE_SHEEN = 800

/**
 * Day tags with the full save lifecycle: clean → dirty → saving → saved → edited.
 *
 * @param {object} props
 * @param {string} props.initial - Server value, comma-separated
 * @param {Function} props.on_save - Persists a tag list; throws on failure
 * @returns {React.ReactElement}
 */
export function TagsEditor( { initial, on_save } ) {

    const [ value, set_value ] = useState( initial )
    const [ baseline, set_baseline ] = useState( initial )
    const [ saving, set_saving ] = useState( false )
    const [ saved, set_saved ] = useState( false )
    const [ paused, set_paused ] = useState( false )
    const [ failure, set_failure ] = useState( null )
    const typing = useRef( null )
    const dirty = value !== baseline

    // Adopt refreshed server values only while there are no local edits
    useEffect( () => {
        if( value !== baseline ) return
        set_value( initial )
        set_baseline( initial )
    }, [ initial ] )

    useEffect( () => () => clearTimeout( typing.current ), [] )

    function edit( next ) {
        set_value( next )
        set_saved( false )

        // Sheen waits for typing to pause
        set_paused( false )
        clearTimeout( typing.current )
        typing.current = setTimeout( () => set_paused( true ), PAUSE_BEFORE_SHEEN )
    }

    async function save( event ) {

        event?.preventDefault()
        if( !dirty || saving ) return

        // Remember exactly what was submitted; later edits stay dirty
        const submitted = value
        set_saving( true )
        set_failure( null )

        try {
            await on_save( submitted.split( `,` ) )
            set_baseline( submitted )
            set_saved( true )
        } catch ( error ) {
            set_failure( error.message ?? `The server did not accept the tags.` )
        } finally {
            set_saving( false )
        }

    }

    const label = saving ? `Saving…` : saved && !dirty ? `Changes saved` : `Save tags`

    return <Form onSubmit={ save }>
        <div className="row">
            <label htmlFor="day-tags">Day tags</label>
            { dirty && <Badge>Unsaved</Badge> }
        </div>
        <input id="day-tags" name="tags" onChange={ event => edit( event.target.value ) } placeholder="family, health, idea" value={ value } />

        <Banner $open={ dirty } aria-hidden={ !dirty }>
            <div><p><TriangleAlert aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />Unsaved changes to this day’s tags.</p></div>
        </Banner>

        <footer>
            <Button disabled={ !dirty || saving } onClick={ () => edit( baseline ) }>Discard</Button>
            <SaveButton
                attention={ dirty && paused && !saving }
                busy={ saving }
                disabled={ !dirty || saving }
                icon={ saved && !dirty ? Check : undefined }
                primary
                type="submit"
            >{ label }</SaveButton>
        </footer>

        <Modal on_close={ () => set_failure( null ) } open={ Boolean( failure ) } title="Tags not saved">
            <p>{ failure && as_sentence( failure ) } Your edits are still here.</p>
            <ModalActions>
                <Button onClick={ () => set_failure( null ) }>Back to editing</Button>
                <Button onClick={ save } primary>Try again</Button>
            </ModalActions>
        </Modal>
    </Form>

}
