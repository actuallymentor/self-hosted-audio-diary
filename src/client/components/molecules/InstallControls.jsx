import React, { useEffect, useState } from "react"
import styled from "styled-components"

import { Button } from "../atoms/Button.jsx"

const InstallPill = styled( Button )`
  bottom: 5.25rem;
  box-shadow: var(--shadow);
  left: 1rem;
  position: fixed;
  z-index: 10;
`

const UpdatePill = styled( Button )`
  background: #ffedaa;
  bottom: 5.25rem;
  position: fixed;
  right: 1rem;
  z-index: 10;
`

/**
 * Surface native installation and waiting-worker updates without nagging.
 *
 * @param {object} props
 * @returns {React.ReactElement | null}
 */
export function InstallControls( { need_refresh, update_service_worker } ) {
    const [ install_prompt, set_install_prompt ] = useState( null )
    const standalone = window.matchMedia( `(display-mode: standalone)` ).matches

    useEffect( () => {
        const receive_prompt = event => {
            event.preventDefault()
            set_install_prompt( event )
        }

        window.addEventListener( `beforeinstallprompt`, receive_prompt )

        return () => window.removeEventListener( `beforeinstallprompt`, receive_prompt )
    }, [] )

    return <>
        { !standalone && install_prompt && <InstallPill onClick={ async () => {
            await install_prompt.prompt()
            set_install_prompt( null )
        } }
        >Install app</InstallPill> }
        { need_refresh && <UpdatePill onClick={ () => update_service_worker( true ) }>Update ready</UpdatePill> }
    </>
}
