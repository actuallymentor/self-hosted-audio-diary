import { clientsClaim } from "workbox-core"
import { NavigationRoute, registerRoute } from "workbox-routing"
import {
    cleanupOutdatedCaches,
    createHandlerBoundToURL,
    precacheAndRoute,
} from "workbox-precaching"

clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute( self.__WB_MANIFEST )

// Navigation receives the local shell. API and diary media never enter Cache Storage.
registerRoute( new NavigationRoute( createHandlerBoundToURL( `/index.html` ), {
    denylist: [ /^\/api\//, /^\/health\//, /^\/version$/ ],
} ) )

self.addEventListener( `message`, event => {
    if( event.data?.type === `SKIP_WAITING` ) self.skipWaiting()
} )
