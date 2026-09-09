import React, { lazy, Suspense, useEffect } from "react"
import { Toaster } from "react-hot-toast"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { ReactRouter6Adapter } from "use-query-params/adapters/react-router-6"
import { QueryParamProvider } from "use-query-params"
import { useRegisterSW } from "virtual:pwa-register/react"
import { prefetch } from "less-lazy"

import { AuthPage } from "./components/pages/AuthPage.jsx"
import { TodayPage } from "./components/pages/TodayPage.jsx"
import { AppShell } from "./components/molecules/AppShell.jsx"
import { InstallControls } from "./components/molecules/InstallControls.jsx"
import { sync_outbox } from "./modules/sync/outbox.js"
import { use_session } from "./stores/session.js"
import { GlobalStyle } from "./styles.js"

// less-lazy extracts double-quoted dynamic import paths to prefetch likely next pages.
const CalendarPage = lazy( prefetch( () => import( "./components/pages/CalendarPage.jsx" ) ) )
const SearchPage = lazy( prefetch( () => import( "./components/pages/SearchPage.jsx" ) ) )
const ReflectionPage = lazy( prefetch( () => import( "./components/pages/ReflectionPage.jsx" ) ) )
const SettingsPage = lazy( prefetch( () => import( "./components/pages/SettingsPage.jsx" ) ) )

/**
 * Coordinate authentication, routing, PWA updates, and outbox resume triggers.
 *
 * @returns {React.ReactElement}
 */
export function App() {
    const { bootstrap_available, loading, restore, user } = use_session()
    const account_id = user?.id
    const { needRefresh: [ need_refresh ], updateServiceWorker: update_service_worker } = useRegisterSW()

    useEffect( () => {
        void restore()
    }, [ restore ] )

    useEffect( () => {
        if( !account_id ) return undefined

        const resume = () => {
            if( navigator.onLine ) void sync_outbox( account_id )
        }
        const reconnect = () => {
            void restore().then( () => sync_outbox( account_id ) )
        }

        window.addEventListener( `online`, reconnect )
        window.addEventListener( `focus`, resume )
        document.addEventListener( `visibilitychange`, resume )
        resume()

        return () => {
            window.removeEventListener( `online`, reconnect )
            window.removeEventListener( `focus`, resume )
            document.removeEventListener( `visibilitychange`, resume )
        }
    }, [ account_id, restore ] )

    if( loading ) return <><GlobalStyle /><main aria-busy="true">Opening your diary…</main></>

    return <>
        <GlobalStyle />
        <Toaster position="top-center" />
        <BrowserRouter>
            <QueryParamProvider adapter={ ReactRouter6Adapter }>
                <Routes>
                    { !user && <>
                        <Route path="/register/:token" element={ <AuthPage /> } />
                        <Route path="/recover/:recovery_token" element={ <AuthPage /> } />
                        <Route path="*" element={ <AuthPage bootstrap_available={ bootstrap_available } /> } />
                    </> }
                    { user && <>
                        <Route path="/" element={ <AppShell><TodayPage /></AppShell> } />
                        <Route path="/calendar" element={ <AppShell><Suspense fallback={ <p>Opening…</p> }><CalendarPage /></Suspense></AppShell> } />
                        <Route path="/search" element={ <AppShell><Suspense fallback={ <p>Opening…</p> }><SearchPage /></Suspense></AppShell> } />
                        <Route path="/reflection" element={ <AppShell><Suspense fallback={ <p>Opening…</p> }><ReflectionPage /></Suspense></AppShell> } />
                        <Route path="/settings" element={ <AppShell><Suspense fallback={ <p>Opening…</p> }><SettingsPage /></Suspense></AppShell> } />
                        <Route path="/register/:token" element={ <Navigate replace to="/" /> } />
                        <Route path="*" element={ <Navigate replace to="/" /> } />
                    </> }
                </Routes>
            </QueryParamProvider>
        </BrowserRouter>
        <InstallControls need_refresh={ need_refresh } update_service_worker={ update_service_worker } />
    </>
}
