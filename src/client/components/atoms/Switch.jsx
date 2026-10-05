import React from "react"
import styled from "styled-components"

const Row = styled.label`
  align-items: center;
  border-radius: .5rem;
  cursor: pointer;
  display: flex;
  font-weight: 400;
  gap: 1rem;
  justify-content: space-between;
  margin: 0 -.5rem;
  min-height: 2.75rem;
  padding: .35rem .5rem;
  transition: background-color var(--quick) ease;

  &:hover { background: var(--hover); }

  input {
    appearance: none;
    background: var(--border-strong);
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    flex: none;
    height: 1.5rem;
    margin: 0;
    min-height: 0;
    padding: 0;
    position: relative;
    transition: background-color var(--quick) ease;
    width: 2.6rem;
  }

  input::after {
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
    content: "";
    height: 1.1rem;
    left: .2rem;
    position: absolute;
    top: .2rem;
    transition: transform var(--quick) var(--ease-out);
    width: 1.1rem;
  }

  input:checked { background: var(--action); }
  input:checked::after { transform: translateX(1.1rem); }

  @media (forced-colors: active) {
    input { border: 1px solid CanvasText; }
    input::after { background: CanvasText; }
    input:checked { background: Highlight; }
  }
`

/**
 * Live on/off preference; the whole row toggles.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function Switch( { children, ...properties } ) {

    return <Row>
        <span>{ children }</span>
        <input role="switch" type="checkbox" { ...properties } />
    </Row>

}
