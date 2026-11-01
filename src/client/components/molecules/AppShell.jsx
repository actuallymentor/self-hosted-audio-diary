import React, { useEffect, useState } from "react"
import { CalendarDays, Download, LogOut, Menu, Mic, RefreshCw, Search, Settings, Sparkles, X } from "lucide-react"
import toast from "react-hot-toast"
import { NavLink, useLocation } from "react-router-dom"
import styled from "styled-components"

import { api } from "../../modules/api/client.js"
import { use_pwa } from "../../stores/pwa.js"
import { use_session } from "../../stores/session.js"
import { outside, use_native_dialog } from "./Modal.jsx"

const destinations = [
    { to: `/`, label: `Today`, icon: Mic, end: true },
    { to: `/calendar`, label: `Calendar`, icon: CalendarDays },
    { to: `/search`, label: `Search`, icon: Search },
    { to: `/reflection`, label: `Reflect`, icon: Sparkles },
]

const Frame = styled.div`
  margin: 0 auto;
  max-width: 62rem;
  min-height: 100dvh;
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

// Native modal dialog sliding in from the right: focus, Escape and inert background come free
const Drawer = styled.dialog`
  background: var(--surface);
  border: 0;
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--ink);
  height: 100dvh;
  inset: 0 0 0 auto;
  margin: 0;
  max-height: none;
  max-width: calc(100vw - 3rem);
  padding: 0 1rem calc(1rem + env(safe-area-inset-bottom));
  width: 20rem;

  &[open] { animation: drawer-in 320ms var(--ease-out) both; display: flex; flex-direction: column; }
  &[data-closing] { animation: drawer-out 200ms ease-in both; }
  &::backdrop { background: rgb(0 20 26 / 45%); }
  &[open]::backdrop { animation: shad-fade 320ms var(--ease-out) both; }
  &[data-closing]::backdrop { animation: shad-fade 200ms ease-in reverse both; }

  @keyframes drawer-in { from { transform: translateX(100%); } to { transform: none; } }
  @keyframes drawer-out { from { transform: none; } to { transform: translateX(100%); } }

  /* Close sits exactly where the trigger was */
  header { align-items: center; display: flex; flex: none; justify-content: space-between; min-height: 4rem; }
  h2 { font-size: 1.05rem; margin: 0; padding-left: .75rem; }

  nav { display: grid; gap: .15rem; }
  .end { margin-top: auto; }

  nav a, nav button {
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

  nav button::before { inset: 0; }
  nav a:hover, nav button:hover:not(:disabled), nav a.active { background: var(--hover); transform: none; }
  nav svg { color: var(--muted); }
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
    const { closing, dialog: drawer } = use_native_dialog( menu_open )
    const { pathname } = useLocation()
    const clear = use_session( state => state.clear )
    const { install, install_prompt, need_refresh, update } = use_pwa()

    useEffect( () => set_menu_open( false ), [ pathname ] )

    async function sign_out() {
        try {
            await api( `/auth/logout`, { method: `POST` } )
            clear()
        } catch ( error ) {
            toast.error( error.message ?? `Sign out failed` )
        }
    }

    return <Frame>
        <Header>
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
                onClick={ () => set_menu_open( true ) }
                type="button"
            >
                <Menu size={ 20 } { ...icon } />
                { need_refresh && <UpdateDot aria-hidden="true" /> }
            </MenuButton>
        </Header>

        <Drawer
            aria-label="Menu"
            data-closing={ closing || undefined }
            id="app-menu"
            onCancel={ event => {
                event.preventDefault()
                set_menu_open( false )
            } }
            onClick={ event => {
                const backdrop = event.target === drawer.current && outside( drawer.current, event )
                if( backdrop || event.target.closest( `a` ) ) set_menu_open( false )
            } }
            ref={ drawer }
        >
            <header>
                <h2>Menu</h2>
                <MenuButton aria-label="Close menu" onClick={ () => set_menu_open( false ) } type="button"><X size={ 20 } { ...icon } /></MenuButton>
            </header>
            <nav aria-label="Secondary navigation">
                <NavLink to="/settings"><Settings size={ 16 } { ...icon } />Settings</NavLink>
                { need_refresh && <button onClick={ () => update( true ) } type="button"><RefreshCw size={ 16 } { ...icon } />Update ready · reload</button> }
                { install_prompt && <button onClick={ install } type="button"><Download size={ 16 } { ...icon } />Install app</button> }
            </nav>
            <nav aria-label="Account" className="end">
                <button onClick={ sign_out } type="button"><LogOut size={ 16 } { ...icon } />Sign out</button>
            </nav>
        </Drawer>

        <Page key={ pathname }>{ children }</Page>

        <TabBar aria-label="Primary navigation, mobile">
            { destinations.map( ( { end, icon: Icon, label, to } ) => <NavLink end={ end } key={ to } to={ to }>
                <Icon size={ 20 } { ...icon } />
                <span className="visually-hidden">{ label }</span>
            </NavLink> ) }
        </TabBar>
    </Frame>

}
