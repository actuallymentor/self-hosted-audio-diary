import React, { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import toast from "react-hot-toast"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { Button } from "../atoms/Button.jsx"

const Form = styled.form`
  background: white;
  border: 1px solid var(--border);
  border-radius: 1rem;
  display: grid;
  gap: .8rem;
  padding: 1rem;

  div { display: grid; gap: .7rem; grid-template-columns: 1fr 1fr; }
`

const Reflection = styled.article`
  background: white;
  border: 1px solid var(--border);
  border-radius: 1rem;
  margin: 1rem 0;
  max-width: 75ch;
  padding: 1.25rem;
`

function week_ago() {
    const value = new Date()
    value.setDate( value.getDate() - 7 )
    return value.toISOString().slice( 0, 10 )
}

/**
 * Ask grounded questions across a complete selected diary range.
 *
 * @returns {React.ReactElement}
 */
export default function ReflectionPage() {
    const [ reflections, set_reflections ] = useState( [] )
    const [ busy, set_busy ] = useState( false )

    async function refresh() {
        const response = await api( `/reflections` )
        set_reflections( response.reflections )
    }

    useEffect( () => {
        void refresh()
    }, [] )

    async function submit( event ) {
        event.preventDefault()
        set_busy( true )

        const form = new FormData( event.currentTarget )

        try {
            await api( `/reflections`, {
                json: {
                    question: form.get( `question` ),
                    range_end: form.get( `range_end` ),
                    range_start: form.get( `range_start` ),
                },
                method: `POST`,
            } )
            await refresh()
            toast.success( `Reflection saved to your archive` )
        } catch ( error ) {
            toast.error( error.message )
        } finally {
            set_busy( false )
        }
    }

    async function listen( id ) {
        try {
            const result = await api( `/reflections/${ id }/speech`, { method: `POST` } )
            const audio = new Audio( result.media_path )
            await audio.play()
        } catch ( error ) {
            toast.error( error.code === `provider_unavailable` ? `Listen unavailable` : error.message )
        }
    }

    return <main>
        <h2>Reflection</h2>
        <p>Selected diary text is sent to your configured OpenRouter model. Zero-data-retention routing is requested.</p>
        <Form onSubmit={ submit }>
            <label>Question<textarea name="question" placeholder="What gave me energy this week?" required /></label>
            <div>
                <label>From<input defaultValue={ week_ago() } name="range_start" required type="date" /></label>
                <label>To<input defaultValue={ current_capture().local_date } name="range_end" required type="date" /></label>
            </div>
            <Button disabled={ busy } primary type="submit">{ busy ? `Reflecting…` : `Start reflection` }</Button>
        </Form>
        <section aria-label="Reflection history">
            { reflections.map( reflection => <Reflection key={ reflection.id }>
                <small>{ reflection.range_start } — { reflection.range_end }</small>
                <h3>{ reflection.question }</h3>
                <ReactMarkdown skipHtml>{ reflection.answer }</ReactMarkdown>
                <p>{ reflection.citations?.join( ` ` ) }</p>
                <Button onClick={ () => listen( reflection.id ) }>Listen</Button>
            </Reflection> ) }
        </section>
    </main>
}
