import { create } from "zustand"

import { api, set_csrf } from "../modules/api/client.js"

export const use_session = create( set => ( {
    bootstrap_available: false,
    loading: true,
    user: null,

    /** Restore the cookie session and rotate its CSRF token. */
    restore: async () => {
        try {
            const session = await api( `/auth/session` )

            set_csrf( session.csrf )
            if( session.user ) localStorage.setItem( `shad:last-user`, JSON.stringify( session.user ) )
            set( { ...session, loading: false } )
        } catch {
            set_csrf( null )
            let cached_user = null

            // DevTools and some embedded browsers can report online while every
            // request fails. Keep the local diary unlocked until the server can
            // explicitly confirm that the cookie session expired.
            try {
                cached_user = JSON.parse( localStorage.getItem( `shad:last-user` ) ?? `null` )
            } catch {
                localStorage.removeItem( `shad:last-user` )
            }

            set( { loading: false, user: cached_user } )
        }
    },

    /** Apply a fresh authenticated response. */
    set_authenticated: response => {
        set_csrf( response.csrf )
        localStorage.setItem( `shad:last-user`, JSON.stringify( response.user ) )
        set( { bootstrap_available: false, loading: false, user: response.user } )
    },

    /** Clear volatile authentication after logout or expiry. */
    clear: () => {
        set_csrf( null )
        localStorage.removeItem( `shad:last-user` )
        set( { loading: false, user: null } )
    },
} ) )
