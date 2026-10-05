import React, { useEffect, useState } from "react"
import { Sparkles, Volume2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import toast from "react-hot-toast"
import styled from "styled-components"

import { reflection_range } from "../../../shared/diary_dates.js"
import { api } from "../../modules/api/client.js"
import { current_capture } from "../../modules/recorder/recorder.js"
import { Button } from "../atoms/Button.jsx"
import { Skeleton } from "../atoms/Skeleton.jsx"
import { EmptyState } from "../molecules/EmptyState.jsx"
import { HelpButton } from "../molecules/HelpButton.jsx"

const Form = styled.form`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  display: grid;
  gap: 1.25rem;
  padding: 1.25rem;

  label, .field { display: grid; gap: .35rem; min-width: 0; }
  .label-row { align-items: center; display: flex; justify-content: space-between; }
  .range { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
  footer { display: flex; justify-content: flex-end; }
`

const Intro = styled.p`
  color: var(--muted);
  margin: -1rem 0 1.5rem;
`

const History = styled.section`
  margin-top: 2.5rem;

  > h3 { color: var(--muted); font-size: 1rem; }
`

const Reflection = styled.article`
  animation: shad-fade 320ms ease both;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  margin: .75rem 0;
  overflow-wrap: anywhere;
  padding: 1.25rem;

  > * { max-width: 65ch; }
  h4 { font-size: 1.15rem; margin: .25rem 0 .75rem; }
  .citations { color: var(--muted); font-size: .875rem; }
`

/**
 * Ask grounded questions across a complete selected diary range.
 *
 * @returns {React.ReactElement}
 */
export default function ReflectionPage() {
    const [ reflections, set_reflections ] = useState( null )
    const [ busy, set_busy ] = useState( false )
    const [ speaking, set_speaking ] = useState( null )
    const [ period, set_period ] = useState( `week` )
    const today = current_capture().local_date
    const [ custom_range, set_custom_range ] = useState( () => reflection_range( `week`, today ) )
    const range = period === `custom` ? custom_range : reflection_range( period, today )

    async function refresh() {
        const response = await api( `/reflections` )
        set_reflections( response.reflections )
    }

    useEffect( () => {
        void refresh().catch( error => {
            set_reflections( [] )
            toast.error( error.message )
        } )
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
        set_speaking( id )
        try {
            const result = await api( `/reflections/${ id }/speech`, { method: `POST` } )
            const audio = new Audio( result.media_path )
            await audio.play()
        } catch ( error ) {
            toast.error( error.code === `provider_unavailable` ? `Listen unavailable` : error.message )
        } finally {
            set_speaking( null )
        }
    }

    return <main>
        <h2>Reflection</h2>
        <Intro>Ask a question across a stretch of your diary.</Intro>
        <Form onSubmit={ submit }>
            <div className="field">
                <div className="label-row">
                    <label htmlFor="reflection-question">Question</label>
                    <HelpButton title="What leaves your server" topic="reflection privacy">
                        <p>Starting a reflection sends the diary text from the selected period to your configured OpenRouter model.</p>
                        <p>Zero-data-retention routing is requested. Recordings stay on your server; only their transcripts and your notes are sent.</p>
                        <p>Listen sends the answer text to the configured speech model. Answers are saved to your archive.</p>
                    </HelpButton>
                </div>
                <textarea id="reflection-question" name="question" placeholder="What gave me energy this week?" required />
            </div>
            <label>Period
                <select name="period" onChange={ event => set_period( event.target.value ) } value={ period }>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                    <option value="year">Year</option>
                    <option value="custom">Custom</option>
                </select>
            </label>
            { period === `custom` ? <div className="range">
                <label>From<input max={ custom_range.range_end || today } name="range_start"
                    onChange={ event => set_custom_range( { ...custom_range, range_start: event.target.value } ) }
                    required type="date" value={ custom_range.range_start }
                /></label>
                <label>To<input max={ today } min={ custom_range.range_start } name="range_end"
                    onChange={ event => set_custom_range( { ...custom_range, range_end: event.target.value } ) }
                    required type="date" value={ custom_range.range_end }
                /></label>
            </div> : <small aria-live="polite">{ range.range_start } — { range.range_end } · including today</small> }
            <footer>
                <Button busy={ busy } disabled={ busy } icon={ Sparkles } primary type="submit">{ busy ? `Reflecting…` : `Start reflection` }</Button>
            </footer>
        </Form>

        <History aria-label="Reflection history">
            <h3>Earlier reflections</h3>
            { reflections === null && <Skeleton count={ 1 } label="Loading reflections…" /> }
            { reflections?.length === 0 && <EmptyState artwork heading="No reflections yet">
                Your answers collect here, saved alongside the diary.
            </EmptyState> }
            { reflections?.map( reflection => <Reflection key={ reflection.id }>
                <small>{ reflection.range_start } — { reflection.range_end }</small>
                <h4>{ reflection.question }</h4>
                <ReactMarkdown skipHtml>{ reflection.answer }</ReactMarkdown>
                { reflection.citations?.length > 0 && <p className="citations">{ reflection.citations.join( ` ` ) }</p> }
                <Button busy={ speaking === reflection.id } disabled={ Boolean( speaking ) } icon={ Volume2 } onClick={ () => listen( reflection.id ) }>Listen</Button>
            </Reflection> ) }
        </History>
    </main>
}
