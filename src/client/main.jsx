import React from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/montserrat/index.css"
import "@fontsource-variable/nunito/index.css"

import { App } from "./App.jsx"

for( const property of [ `--font-scale`, `--letter-spacing`, `--line-height` ] ) {
    const value = localStorage.getItem( property )

    if( value ) document.documentElement.style.setProperty( property, value )
}

// Hidden documents pause every CSS loop (see GlobalStyle)
const mark_visibility = () => document.documentElement.toggleAttribute( `data-hidden`, document.hidden )
document.addEventListener( `visibilitychange`, mark_visibility )
mark_visibility()

createRoot( document.getElementById( `root` ) ).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
