import React, { useEffect, useRef, useState } from "react"
import { CalendarDays, Download, LogOut, Menu, Mic, RefreshCw, Search, Settings, Sparkles, X } from "lucide-react"
import toast from "react-hot-toast"
import { NavLink, useLocation } from "react-router-dom"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { use_pwa } from "../../stores/pwa.js"
import { use_session } from "../../stores/session.js"

const destinations = [
    { to: `/`, label: `Today`, icon: Mic, end: true },
    { to: `/calendar`, label: `Calendar`, icon: CalendarDays },
    { to: `/search`, label: `Search`, icon: Search },
    { to: `/reflection`, label: `Reflect`, icon: Sparkles },
]

const Frame = styled.div`
  margin: 0 auto;
  max-width: 62rem;
  min-height: 100vh;
  padding: 0 1rem 2rem;

  /* Keep content clear of the bottom tab bar */
  @media (max-width: 47.99rem) { padding-bottom: calc(5rem + env(safe-area-inset-bottom)); }
`

const Header = styled.header`
  align-items: center;
  display: flex;
  gap: 1.5rem;
  min-height: 4rem;
  position: relative;

  .brand {
    color: inherit;
    font-family: "Montserrat Variable", Montserrat, system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 500;
    letter-spacing: .08em;
    margin-right: auto;
    text-decoration: none;
  }
`

const TopNavigation = styled.nav`
  display: flex;
  gap: .25rem;

  a {
    align-items: center;
    color: var(--muted);
    display: flex;
    gap: .45rem;
    min-height: 2.75rem;
    padding: 0 .75rem;
    position: relative;
    text-decoration: none;
    transition: color var(--quick) ease;
  }

  a:hover { color: var(--ink); }

  /* Active underline grows from center */
  a::after {
    background: var(--accent);
    border-radius: 2px;
    bottom: .2rem;
    content: "";
    height: 2px;
    left: .75rem;
    position: absolute;
    right: .75rem;
    transform: scaleX(0);
    transition: transform 280ms var(--ease-out);
  }

  a.active { color: var(--ink); }
  a.active::after { transform: scaleX(1); }

  @media (forced-colors: active) { a::after { background: Highlight; forced-color-adjust: none; } }

  @media (max-width: 47.99rem) { display: none; }
`

const TabBar = styled.nav`
  background: var(--surface);
  border-top: 1px solid var(--border);
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  left: 0;
  padding-bottom: env(safe-area-inset-bottom);
  position: fixed;
  right: 0;
  z-index: 20;

  a {
    align-items: center;
    color: var(--muted);
    display: flex;
    justify-content: center;
    min-height: 3.5rem;
    position: relative;
  }

  /* Active: icon color + 3px top-edge line spanning the tab */
  a::before {
    background: var(--accent);
    content: "";
    height: 3px;
    inset: 0 0 auto;
    position: absolute;
    transform: scaleX(0);
    transition: transform 280ms var(--ease-out);
  }

  a.active { color: var(--ink); }
  a.active::before { transform: scaleX(1); }

  @media (forced-colors: active) { a::before { background: Highlight; forced-color-adjust: none; } }

  @media (min-width: 48rem) { display: none; }
`

const MenuPanel = styled.div`
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  box-shadow: var(--shadow);
  display: grid;
  min-width: 14rem;
  padding: .4rem;
  position: absolute;
  right: 0;
  top: calc(100% - .25rem);
  z-index: 30;

  &[hidden] { display: none; }
  &:not([hidden]) { animation: shad-fade 160ms ease both; }

  a, button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: .5rem;
    color: var(--ink);
    display: flex;
    font-size: 1rem;
    font-weight: 400;
    gap: .65rem;
    justify-content: flex-start;
    min-height: 2.75rem;
    padding: 0 .75rem;
    text-decoration: none;
    transform: none;
    width: 100%;
  }

  button::before { inset: 0; }
  a:hover, button:hover:not(:disabled), a.active { background: var(--hover); transform: none; }
  svg { color: var(--muted); }
  hr { border: 0; border-top: 1px solid var(--border); margin: .35rem 0; width: 100%; }
`

const MenuButton = styled.button`
  border-color: transparent;
  margin-right: -.5rem;
`

const UpdateDot = styled.span`
  background: var(--accent);
  border: 2px solid var(--page);
  border-radius: 50%;
  height: .65rem;
  position: absolute;
  right: .1rem;
  top: .1rem;
  width: .65rem;
`

const Page = styled.div`
  /* Navigation crossfade */
  animation: shad-fade 280ms ease both;
`

const icon = { 'aria-hidden': true, strokeWidth: 1.5 }

/**
 * Desktop: top navigation with icon, label and active underline.
 * Mobile: icon-only bottom tabs. Secondary items live behind the top-right menu.
 *
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function AppShell( { children } ) {

    const [ menu_open, set_menu_open ] = useState( false )
    const menu_button = useRef( null )
    const menu_panel = useRef( null )
    const { pathname } = useLocation()
    const clear = use_session( state => state.clear )
    const { install, install_prompt, need_refresh, update } = use_pwa()

    useEffect( () => set_menu_open( false ), [ pathname ] )

    // Outside click/tap closes the menu
    useEffect( () => {

        if( !menu_open ) return undefined

        const outside = event => {
            if( menu_panel.current?.contains( event.target ) || menu_button.current?.contains( event.target ) ) return
            set_menu_open( false )
        }
        document.addEventListener( `pointerdown`, outside )

        return () => document.removeEventListener( `pointerdown`, outside )

    }, [ menu_open ] )

    function close_menu( event ) {
        if( event.key !== `Escape` || !menu_open ) return
        set_menu_open( false )
        menu_button.current?.focus()
    }

    async function sign_out() {
        try {
            await api( `/auth/logout`, { method: `POST` } )
            clear()
        } catch ( error ) {
            toast.error( error.message ?? `Sign out failed` )
        }
    }

    return <Frame>
        <Header onKeyDown={ close_menu }>
            <NavLink className="brand" to="/">SHAD</NavLink>

            <TopNavigation aria-label="Primary navigation">
                { destinations.map( ( { end, icon: Icon, label, to } ) => <NavLink end={ end } key={ to } to={ to }>
                    <Icon size={ 20 } { ...icon } />{ label }
                </NavLink> ) }
            </TopNavigation>

            <MenuButton
                aria-controls="app-menu"
                aria-expanded={ menu_open }
                aria-label={ need_refresh ? `Menu, update ready` : `Menu` }
                onClick={ () => set_menu_open( !menu_open ) }
                ref={ menu_button }
                type="button"
            >
                { menu_open ? <X size={ 20 } { ...icon } /> : <Menu size={ 20 } { ...icon } /> }
                { need_refresh && <UpdateDot aria-hidden="true" /> }
            </MenuButton>

            <MenuPanel hidden={ !menu_open } id="app-menu" onClick={ event => event.target.closest( `a` ) && set_menu_open( false ) } ref={ menu_panel }>
                <NavLink to="/settings"><Settings size={ 16 } { ...icon } />Settings</NavLink>
                { need_refresh && <button onClick={ () => update( true ) } type="button"><RefreshCw size={ 16 } { ...icon } />Update ready · reload</button> }
                { install_prompt && <button onClick={ install } type="button"><Download size={ 16 } { ...icon } />Install app</button> }
                <hr />
                <button onClick={ sign_out } type="button"><LogOut size={ 16 } { ...icon } />Sign out</button>
            </MenuPanel>
        </Header>

        <Page key={ pathname }>{ children }</Page>

        <TabBar aria-label="Primary navigation, mobile">
            { destinations.map( ( { end, icon: Icon, label, to } ) => <NavLink end={ end } key={ to } to={ to }>
                <Icon size={ 20 } { ...icon } />
                <span className="visually-hidden">{ label }</span>
            </NavLink> ) }
        </TabBar>
    </Frame>

}
