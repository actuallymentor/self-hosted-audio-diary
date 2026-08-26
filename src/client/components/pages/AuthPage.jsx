import React, { useState } from "react"
import { useParams } from "react-router-dom"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { use_session } from "../../stores/session.js"
import { Button } from "../atoms/Button.jsx"

const Wrap = styled.main`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
`

const Card = styled.form`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1.4rem;
  box-shadow: var(--shadow);
  display: grid;
  gap: 1rem;
  max-width: 28rem;
  padding: 2rem;
  width: 100%;

  h1, p { margin: 0; }
  label { display: grid; font-weight: 800; gap: .35rem; }
`

/**
 * Claim an empty install, sign in, or consume an invitation.
 *
 * @returns {React.ReactElement}
 */
export function AuthPage() {
    const { recovery_token, token } = useParams()
    const bootstrap_available = use_session( state => state.bootstrap_available )
    const set_authenticated = use_session( state => state.set_authenticated )
    const [ busy, set_busy ] = useState( false )

    async function submit( event ) {
        event.preventDefault()
        set_busy( true )

        const form = new FormData( event.currentTarget )
        const credentials = {
            email: form.get( `email` ),
            password: form.get( `password` ),
        }
        const path = recovery_token
            ? `/auth/recover/${ encodeURIComponent( recovery_token ) }`
            : token
                ? `/auth/register/${ encodeURIComponent( token ) }`
                : bootstrap_available ? `/auth/bootstrap` : `/auth/login`

        try {
            const response = await api( path, { json: credentials, method: `POST` } )

            set_authenticated( response )
            toast.success( token ? `Account ready` : `Welcome back` )
        } catch ( error ) {
            toast.error( error.message )
        } finally {
            set_busy( false )
        }
    }

    const heading = recovery_token
        ? `Recover account`
        : token ? `Accept invitation` : bootstrap_available ? `Create administrator` : `Welcome back`

    return <Wrap>
        <Card onSubmit={ submit }>
            <div>
                <h1>{ heading }</h1>
                <p>Your private diary lives on your server.</p>
            </div>
            { !recovery_token && <label>Email <input autoComplete="email" name="email" required type="email" /></label> }
            <label>Password <input autoComplete={ token ? `new-password` : `current-password` } minLength="12" name="password" required type="password" /></label>
            <Button disabled={ busy } primary type="submit">{ busy ? `Working…` : heading }</Button>
        </Card>
    </Wrap>
}
