import React from "react"
import { NavLink } from "react-router-dom"
import styled from "styled-components"

const Frame = styled.div`
  margin: 0 auto;
  max-width: 62rem;
  min-height: 100vh;
  padding: 1rem 1rem 6.5rem;
`

const Header = styled.header`
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.25rem;

  h1 { font-size: 1.15rem; margin: 0; }
  span { color: var(--muted); font-size: .86rem; }
`

const Navigation = styled.nav`
  align-items: stretch;
  background: rgb(255 255 255 / 96%);
  border: 1px solid var(--border);
  border-radius: 1rem;
  bottom: .75rem;
  box-shadow: var(--shadow);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  left: 50%;
  max-width: 36rem;
  overflow: hidden;
  position: fixed;
  transform: translateX(-50%);
  width: calc(100% - 1.5rem);
  z-index: 5;

  a {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-size: .78rem;
    font-weight: 800;
    justify-content: center;
    min-height: 3.5rem;
    padding: .5rem .2rem;
    text-decoration: none;
  }

  a.active { background: var(--accent-soft); color: #204e59; }
`

/**
 * Keep core diary navigation reachable by one thumb.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function AppShell( { children, user } ) {
    return <Frame>
        <Header>
            <h1>SHAD</h1>
            <span>{ user.email }</span>
        </Header>
        { children }
        <Navigation aria-label="Primary navigation">
            <NavLink to="/">Today</NavLink>
            <NavLink to="/calendar">Calendar</NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/reflection">Reflect</NavLink>
            <NavLink to="/settings">Settings</NavLink>
        </Navigation>
    </Frame>
}
