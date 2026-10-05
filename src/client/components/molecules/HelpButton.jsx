import React, { useState } from "react"
import { Info } from "lucide-react"
import styled from "styled-components"

import { Button } from "../atoms/Button.jsx"
import { Modal, ModalActions } from "./Modal.jsx"

const Trigger = styled.button`
  border-color: transparent;
  color: var(--muted);
  padding: 0;

  &:hover:not(:disabled) { border-color: transparent; color: var(--ink); }
`

/**
 * Outlined "i" at the label-row right; opens a centered help modal.
 *
 * @param {object} props
 * @param {string} props.topic - Accessible "About …" subject
 * @param {string} props.title - Descriptive modal heading
 * @returns {React.ReactElement}
 */
export function HelpButton( { children, title, topic } ) {

    const [ open, set_open ] = useState( false )

    return <>
        <Trigger aria-label={ `About ${ topic }` } onClick={ () => set_open( true ) } type="button">
            <Info aria-hidden="true" size={ 16 } strokeWidth={ 1.5 } />
        </Trigger>
        <Modal on_close={ () => set_open( false ) } open={ open } title={ title }>
            { children }
            <ModalActions><Button onClick={ () => set_open( false ) } primary>Got it</Button></ModalActions>
        </Modal>
    </>

}
