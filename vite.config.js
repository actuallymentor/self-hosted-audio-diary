import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig( {
    plugins: [
        react(),
        VitePWA( {
            devOptions: { enabled: true, type: `module` },
            injectManifest: {
                // The plugin adds its generated manifest and declared icons separately.
                // Matching them here creates conflicting duplicate precache revisions.
                globPatterns: [ `**/*.{js,css,html,woff2}` ],
            },
            manifest: {
                background_color: `#fafbfc`,
                description: `Private, self-hosted voice and multimedia diary`,
                display: `standalone`,
                icons: [
                    { purpose: `any`, sizes: `any`, src: `/assets/icon.svg`, type: `image/svg+xml` },
                    { purpose: `maskable`, sizes: `any`, src: `/assets/icon-maskable.svg`, type: `image/svg+xml` },
                ],
                id: `/`,
                name: `SHAD · Self-Hosted Audio Diary`,
                orientation: `any`,
                scope: `/`,
                short_name: `SHAD`,
                start_url: `/`,
                theme_color: `#fafbfc`,
            },
            registerType: `prompt`,
            srcDir: `src/client`,
            strategies: `injectManifest`,
            filename: `sw.js`,
        } ),
    ],
    server: {
        host: `0.0.0.0`,
        proxy: {
            "/api": `http://localhost:3000`,
            "/health": `http://localhost:3000`,
            "/version": `http://localhost:3000`,
        },
    },
} )
