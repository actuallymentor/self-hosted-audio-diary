import React, { useEffect, useState } from "react"
import { Link2, LogOut, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { recover_application_shell } from "../../modules/pwa/lifecycle.js"
import { request_durable_storage } from "../../modules/storage/database.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"
import { Switch } from "../atoms/Switch.jsx"

const Stack = styled.main`
  display: grid;
  gap: 1rem;
  min-width: 0;
  overflow-wrap: anywhere;

  h2 { margin-bottom: .5rem; }
  section { background: var(--surface); border: 1px solid var(--border); border-radius: .75rem; padding: 1.25rem; }
  section > p { color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1rem; }
`

const ReadingControl = styled.div`
  margin: 1.5rem 0;

  header { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem 1rem; margin-bottom: .25rem; }
  header label { flex: 1; }
  output { font-variant-numeric: tabular-nums; font-weight: 500; }
  input[type="range"] { display: block; margin: 0; }
`

const Scale = styled.div`
  margin-bottom: 2rem;
  position: relative;

  span {
    border-left: 2px solid var(--muted);
    color: var(--muted);
    font-size: .8rem;
    left: ${ ( { $default_position } ) => $default_position }%;
    padding: .2rem .35rem 0;
    position: absolute;
    top: calc(100% - .5rem);
    white-space: nowrap;
  }
`

const SizeActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .75rem;
`

const Preview = styled.div`
  background: var(--page);
  border-left: 3px solid var(--accent);
  border-radius: 0 .5rem .5rem 0;
  margin-top: 1.5rem;
  max-width: 65ch;
  padding: 1rem;

  h4 { margin: 0 0 .5rem; }
  p { font-size: 1rem; margin: 0; }
`

const reading_controls = [
    { name: `--font-scale`, label: `Text size`, min: 90, max: 140, default_value: 100, factor: 1, format: value => `${ value }%`, style: value => `${ value }%` },
    { name: `--line-height`, label: `Line spacing`, min: 130, max: 200, default_value: 155, factor: 100, format: value => `${ ( value / 100 ).toFixed( 2 ) }×`, style: value => String( value / 100 ) },
    { name: `--letter-spacing`, label: `Letter spacing`, min: 0, max: 12, default_value: 0, factor: 100, format: value => `${ ( value / 100 ).toFixed( 2 ) }em`, style: value => `${ value / 100 }em` },
]

function read_preferences() {
    return Object.fromEntries( reading_controls.map( control => {
        const saved = parseFloat( localStorage.getItem( control.name ) ) * control.factor
        const value = Number.isFinite( saved ) ? Math.min( control.max, Math.max( control.min, Math.round( saved ) ) ) : control.default_value
        return [ control.name, value ]
    } ) )
}

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
    const [ reading, set_reading ] = useState( read_preferences )

    useEffect( () => {
        void request_durable_storage().then( set_storage )
        void fetch( `/version` ).then( response => response.json() ).then( set_version )
    }, [] )

    function set_reading_value( control, value ) {
        const bounded = Math.min( control.max, Math.max( control.min, value ) )
        const css_value = control.style( bounded )
        document.documentElement.style.setProperty( control.name, css_value )
        localStorage.setItem( control.name, css_value )
        set_reading( previous => ( { ...previous, [ control.name ]: bounded } ) )
    }

    function set_preference( name, enabled ) {
        localStorage.setItem( name, String( enabled ) )
    }

    async function invite() {
        try {
            const result = await api( `/admin/invitations`, { method: `POST` } )
            const link = `${ location.origin }/register/${ result.token }`
            await navigator.clipboard?.writeText( link )
            toast.success( `Invitation copied. It expires in seven days.` )
        } catch ( error ) {
            toast.error( error.message ?? `Invitation could not be created` )
        }
    }

    async function logout() {
        try {
            await api( `/auth/logout`, { method: `POST` } )
            clear()
        } catch ( error ) {
            toast.error( error.message ?? `Sign out failed` )
        }
    }

    return <Stack>
        <h2>Settings</h2>
        <section>
            <h3>Reading comfort</h3>
            { reading_controls.map( control => <ReadingControl key={ control.name }>
                <header>
                    <label htmlFor={ control.name }>{ control.label }</label>
                    <output htmlFor={ control.name }>{ control.format( reading[ control.name ] ) }</output>
                    <Button aria-label={ `Reset ${ control.label.toLowerCase() }` } disabled={ reading[ control.name ] === control.default_value } icon={ RotateCcw } onClick={ () => set_reading_value( control, control.default_value ) } quiet>Reset</Button>
                </header>
                <Scale $default_position={ ( control.default_value - control.min ) / ( control.max - control.min ) * 100 }>
                    <input aria-describedby={ `${ control.name }-default` } aria-valuetext={ control.format( reading[ control.name ] ) } id={ control.name } max={ control.max } min={ control.min } onChange={ event => set_reading_value( control, Number( event.target.value ) ) } step="1" type="range" value={ reading[ control.name ] } />
                    <span id={ `${ control.name }-default` }>Default { control.format( control.default_value ) }</span>
                </Scale>
                { control.name === `--font-scale` && <SizeActions>
                    <Button aria-label="Decrease text size" disabled={ reading[ control.name ] === control.min } icon={ Minus } onClick={ () => set_reading_value( control, reading[ control.name ] - 5 ) } />
                    <Button aria-label="Increase text size" disabled={ reading[ control.name ] === control.max } icon={ Plus } onClick={ () => set_reading_value( control, reading[ control.name ] + 5 ) } />
                </SizeActions> }
            </ReadingControl> ) }
            <Preview aria-label="Reading preview">
                <h4>Reading preview</h4>
                <p>A quiet moment worth remembering. Today I made time to pause, notice the small things, and put my thoughts into words.</p>
            </Preview>
        </section>
        <section>
            <h3>Local safety</h3>
            <p>{ storage?.persisted ? `Browser storage is marked persistent.` : `Persistent browser storage was not granted. Keep server backups current.` }</p>
            { storage?.quota && <p>Using { Math.round( storage.usage / 1024 / 1024 ) } MiB of { Math.round( storage.quota / 1024 / 1024 ) } MiB available to this origin.</p> }
        </section>
        <section>
            <h3>Recording feedback</h3>
            <Switch defaultChecked={ localStorage.getItem( `shad:haptics` ) === `true` } onChange={ event => set_preference( `shad:haptics`, event.target.checked ) }>Haptic confirmation</Switch>
            <Switch defaultChecked={ localStorage.getItem( `shad:sounds` ) === `true` } onChange={ event => set_preference( `shad:sounds`, event.target.checked ) }>Short start and stop sounds</Switch>
        </section>
        { user.role === `admin` && <section>
            <h3>People</h3>
            <p>Create a one-use link. SHAD sends no email.</p>
            <Button icon={ Link2 } onClick={ invite }>Copy new invitation</Button>
        </section> }
        <section>
            <h3>Application</h3>
            <p>Signed in as { user.email }</p>
            <p>Update recovery clears only the app shell. Device recordings stay intact.</p>
            <p>Version { version?.version ?? `…` }</p>
            <div className="actions">
                <Button icon={ RefreshCw } onClick={ recover_application_shell }>Update app</Button>
                <Button icon={ LogOut } onClick={ logout }>Sign out</Button>
            </div>
        </section>
    </Stack>
}
