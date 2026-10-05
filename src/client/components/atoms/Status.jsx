import React from "react"
import { CircleAlert, CircleCheck, Clock, CloudOff, HardDrive, LoaderCircle, Mic, TriangleAlert } from "lucide-react"
import styled from "styled-components"

const tones = {
    danger: `background: var(--danger-bg); color: var(--danger-ink);`,
    info: `background: var(--info-bg); color: var(--info-ink);`,
    neutral: `background: var(--hover); color: var(--muted);`,
    success: `background: var(--success-bg); color: var(--success-ink);`,
    warn: `background: var(--warn-bg); color: var(--warn-ink);`,
}

const Element = styled.span`
  ${ ( { $tone } ) => tones[ $tone ] }
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: .8125rem;
  font-weight: 500;
  gap: .3em;
  line-height: 1.3;
  padding: .2rem .6rem .2rem .5rem;
`

// Label, tone and icon per durability state; meaning never rests on color alone
const states = {
    complete: [ `Transcript ready`, `success`, CircleCheck ],
    local_absent: [ `Not on this device`, `neutral`, HardDrive ],
    local_present: [ `On this device`, `info`, HardDrive ],
    needs_auth: [ `Sign in to sync`, `warn`, TriangleAlert ],
    not_queued: [ `Transcript not queued`, `neutral`, Clock ],
    queued: [ `Queued`, `info`, Clock ],
    recording: [ `Recording`, `danger`, Mic ],
    remote_absent: [ `Not yet on server`, `warn`, CloudOff ],
    remote_unknown: [ `Server status unavailable`, `neutral`, CloudOff ],
    remote_present: [ `On server`, `success`, CircleCheck ],
    retry: [ `Saved here · retrying`, `warn`, Clock ],
    saved_local: [ `Saved on this device`, `info`, HardDrive ],
    syncing: [ `Uploading`, `info`, LoaderCircle ],
    transcription_failed: [ `Transcription failed`, `danger`, CircleAlert ],
    transcription_waiting: [ `Transcription waits for upload`, `neutral`, Clock ],
    transcription_unknown: [ `Transcription status unavailable`, `neutral`, CloudOff ],
    transcribing: [ `Transcribing`, `info`, LoaderCircle ],
    unrecoverable: [ `Needs attention · kept on device`, `danger`, CircleAlert ],
    uploaded: [ `Safe on server`, `success`, CircleCheck ],
    uploaded_previous: [ `Upload confirmed earlier`, `neutral`, CircleCheck ],
}

/**
 * Small tinted pill: semantic icon plus words.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Status( { value } ) {

    const [ label, tone, Icon ] = states[ value ] ?? [ value, `neutral`, Clock ]

    return <Element $tone={ tone } role="status">
        <Icon aria-hidden="true" size={ 14 } strokeWidth={ 1.5 } />
        { label }
    </Element>

}
