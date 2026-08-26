import React, { useEffect, useState } from "react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { recover_application_shell } from "../../modules/pwa/lifecycle.js"
import { request_durable_storage } from "../../modules/storage/database.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"

const Stack = styled.main`
  display: grid;
  gap: 1rem;

  section { background: white; border: 1px solid var(--border); border-radius: 1rem; padding: 1rem; }
  label { display: grid; gap: .4rem; margin: 1rem 0; }
`

/**
 * Manage readability, persistence, invitations, session, and shell recovery.
 *
 * @returns {React.ReactElement}
 */
export default function SettingsPage() {
    const user = use_session( state => state.user )
    const clear = use_session( state => state.clear )
    const [ storage, set_storage ] = useState( null )
    const [ version, set_version ] = useState( null )

    useEffect( () => {
        void request_durable_storage().then( set_storage )
        void fetch( `/version` ).then( response => response.json() ).then( set_version )
    }, [] )

    function set_style( name, value ) {
        document.documentElement.style.setProperty( name, value )
        localStorage.setItem( name, value )
    }

    function set_preference( name, enabled ) {
        localStorage.setItem( name, String( enabled ) )
    }

    async function invite() {
        const result = await api( `/admin/invitations`, { method: `POST` } )
        const link = `${ location.origin }/register/${ result.token }`
        await navigator.clipboard?.writeText( link )
        toast.success( `Invitation copied. It expires in seven days.` )
    }

    async function logout() {
        await api( `/auth/logout`, { method: `POST` } )
        clear()
    }

    return <Stack>
        <h2>Settings</h2>
        <section>
            <h3>Reading comfort</h3>
            <label>Text size<input defaultValue="100" max="140" min="90" onChange={ event => set_style( `--font-scale`, `${ event.target.value }%` ) } type="range" /></label>
            <label>Line spacing<input defaultValue="155" max="200" min="130" onChange={ event => set_style( `--line-height`, String( event.target.value / 100 ) ) } type="range" /></label>
            <label>Letter spacing<input defaultValue="0" max="8" min="0" onChange={ event => set_style( `--letter-spacing`, `${ event.target.value / 100 }em` ) } type="range" /></label>
        </section>
        <section>
            <h3>Local safety</h3>
            <p>{ storage?.persisted ? `Browser storage is marked persistent.` : `Persistent browser storage was not granted. Keep server backups current.` }</p>
            { storage?.quota && <p>Using { Math.round( storage.usage / 1024 / 1024 ) } MiB of { Math.round( storage.quota / 1024 / 1024 ) } MiB available to this origin.</p> }
        </section>
        <section>
            <h3>Recording feedback</h3>
            <label><input defaultChecked={ localStorage.getItem( `shad:haptics` ) === `true` } onChange={ event => set_preference( `shad:haptics`, event.target.checked ) } type="checkbox" /> Haptic confirmation</label>
            <label><input defaultChecked={ localStorage.getItem( `shad:sounds` ) === `true` } onChange={ event => set_preference( `shad:sounds`, event.target.checked ) } type="checkbox" /> Short start and stop sounds</label>
        </section>
        { user.role === `admin` && <section>
            <h3>People</h3>
            <p>Create a one-use link. SHAD sends no email.</p>
            <Button onClick={ invite }>Copy new invitation</Button>
        </section> }
        <section>
            <h3>Application</h3>
            <p>Update recovery clears only the app shell. Device recordings stay intact.</p>
            <p>Version { version?.version ?? `…` }</p>
            <Button onClick={ recover_application_shell }>Update app</Button>{ ` ` }
            <Button onClick={ logout }>Sign out</Button>
        </section>
    </Stack>
}
