import { create } from "zustand"

/**
 * Install and update affordances, surfaced in the app menu.
 * `update` is wired by App from the service-worker registration hook.
 */
export const use_pwa = create( set => ( {
    install_prompt: null,
    need_refresh: false,
    update: () => {},
    set_update: ( need_refresh, update ) => set( { need_refresh, update } ),
    install: async () => {
        const { install_prompt } = use_pwa.getState()
        await install_prompt?.prompt()
        set( { install_prompt: null } )
    },
} ) )

// Capture the native prompt as early as possible
if( typeof window !== `undefined` ) {
    window.addEventListener( `beforeinstallprompt`, event => {
        event.preventDefault()
        if( !matchMedia( `(display-mode: standalone)` ).matches ) use_pwa.setState( { install_prompt: event } )
    } )
}
