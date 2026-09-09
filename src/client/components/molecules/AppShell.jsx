import React, { useEffect, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import styled from "styled-components"

const Frame = styled.div`
  margin: 0 auto;
  max-width: 62rem;
  min-height: 100vh;
  padding: 1rem;
`

const Header = styled.header`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.25rem;

  h1 { font-size: 1.15rem; margin: 0; }
  h1 a { color: inherit; text-decoration: none; }
`

const MenuButton = styled.button`
  align-items: center;
  display: inline-flex;
  gap: .5rem;

  @media (min-width: 48rem) { display: none; }
`

const Navigation = styled.nav`
  display: ${ ( { $open } ) => $open ? `grid` : `none` };
  gap: .25rem;
  width: 100%;

  a {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-weight: 800;
    min-height: 3rem;
    padding: .5rem .75rem;
    text-decoration: none;
  }

  a.active { background: var(--accent-soft); color: #204e59; }

  @media (min-width: 48rem) {
    display: flex;
    flex-wrap: wrap;
    width: auto;
  }
`

/**
 * Keep desktop navigation visible and mobile navigation behind a menu.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function AppShell( { children } ) {
    const [ menu_open, set_menu_open ] = useState( false )
    const menu_button = useRef( null )
    const { pathname } = useLocation()

    useEffect( () => set_menu_open( false ), [ pathname ] )

    function close_menu( event ) {
        if( event.key !== `Escape` || !menu_open ) return
        set_menu_open( false )
        menu_button.current?.focus()
    }

    return <Frame>
        <Header onKeyDown={ close_menu }>
            <h1><NavLink to="/">SHAD</NavLink></h1>
            <MenuButton aria-controls="primary-navigation" aria-expanded={ menu_open } onClick={ () => set_menu_open( !menu_open ) } ref={ menu_button } type="button">
                <span aria-hidden="true">☰</span> Menu
            </MenuButton>
            <Navigation $open={ menu_open } aria-label="Primary navigation" id="primary-navigation" onClick={ () => set_menu_open( false ) }>
                <NavLink end to="/">Today</NavLink>
                <NavLink to="/calendar">Calendar</NavLink>
                <NavLink to="/search">Search</NavLink>
                <NavLink to="/reflection">Reflect</NavLink>
                <NavLink to="/settings">Settings</NavLink>
            </Navigation>
        </Header>
        { children }
    </Frame>
}
