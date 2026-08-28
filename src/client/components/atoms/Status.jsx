import React from "react"
import styled from "styled-components"

const Element = styled.span`
  background: var(--accent-soft);
  border-radius: 999px;
  color: #204e59;
  display: inline-flex;
  font-size: .82rem;
  font-weight: 800;
  padding: .25rem .65rem;
`

const labels = {
    complete: `Transcript ready`,
    needs_auth: `Sign in to sync`,
    queued: `Queued`,
    recording: `Recording`,
    retry: `Saved here · retrying`,
    saved_local: `Saved on this device`,
    syncing: `Uploading`,
    transcribing: `Transcribing`,
    unrecoverable: `Needs attention · kept on device`,
    uploaded: `Safe on server`,
}

/**
 * Explain durability in words instead of color alone.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Status( { value } ) {
    return <Element role="status">{ labels[value] ?? value }</Element>
}
