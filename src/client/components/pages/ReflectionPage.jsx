import React, { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import toast from "react-hot-toast"
import styled from "styled-components"

import { reflection_range } from "../../../shared/diary_dates.js"
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

  label { display: grid; gap: .4rem; min-width: 0; }
  div { display: grid; gap: .7rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
`

const Reflection = styled.article`
  background: white;
  border: 1px solid var(--border);
  border-radius: 1rem;
  margin: 1rem 0;
  max-width: 65ch;
  overflow-wrap: anywhere;
  padding: 1.25rem;
`

/**
 * Ask grounded questions across a complete selected diary range.
 *
 * @returns {React.ReactElement}
 */
export default function ReflectionPage() {
    const [ reflections, set_reflections ] = useState( [] )
    const [ busy, set_busy ] = useState( false )
    const [ period, set_period ] = useState( `week` )
    const today = current_capture().local_date
    const [ custom_range, set_custom_range ] = useState( () => reflection_range( `week`, today ) )
    const range = period === `custom` ? custom_range : reflection_range( period, today )

    async function refresh() {
        const response = await api( `/reflections` )
        set_reflections( response.reflections )
    }

    useEffect( () => {
        void refresh().catch( error => toast.error( error.message ) )
    }, [] )

    async function submit( event ) {
        event.preventDefault()
        if( !range.range_start || !range.range_end || range.range_start > range.range_end || range.range_end > today ) {
            toast.error( `Choose a valid date range ending no later than today` )
            return
        }

        set_busy( true )

        const form = new FormData( event.currentTarget )

        try {
            await api( `/reflections`, {
                json: {
                    question: form.get( `question` ),
                    ...range,
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
            <label>Period
                <select name="period" onChange={ event => set_period( event.target.value ) } value={ period }>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                    <option value="year">Year</option>
                    <option value="custom">Custom</option>
                </select>
            </label>
            { period === `custom` ? <div>
                <label>From<input max={ custom_range.range_end || today } name="range_start"
                    onChange={ event => set_custom_range( { ...custom_range, range_start: event.target.value } ) }
                    required type="date" value={ custom_range.range_start }
                /></label>
                <label>To<input max={ today } min={ custom_range.range_start } name="range_end"
                    onChange={ event => set_custom_range( { ...custom_range, range_end: event.target.value } ) }
                    required type="date" value={ custom_range.range_end }
                /></label>
            </div> : <small aria-live="polite">{ range.range_start } — { range.range_end } · including today</small> }
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
