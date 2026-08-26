/**
 * Clear only application-owned service workers and Cache Storage entries.
 */
export async function recover_application_shell() {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []

    await Promise.all( registrations.map( registration => registration.unregister() ) )

    const cache_names = await caches.keys()

    await Promise.all(
        cache_names
            .filter( name => name.startsWith( `workbox-` ) || name.startsWith( `shad-` ) )
            .map( name => caches.delete( name ) ),
    )

    const url = new URL( location.href )
    url.searchParams.set( `shell`, String( Date.now() ) )
    location.replace( url )
}
