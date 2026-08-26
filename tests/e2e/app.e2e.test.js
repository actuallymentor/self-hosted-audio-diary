import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { AxePuppeteer } from "@axe-core/puppeteer"
import puppeteer from "puppeteer"

const base_url = process.env.APP_BASE_URL

function mark( value ) {
    process.stdout.write( `[e2e] ${ value }\n` )
}

async function click_text( page, selector, text ) {
    const clicked = await page.evaluate( ( selected, expected ) => {
        const element = [ ...document.querySelectorAll( selected ) ]
            .find( candidate => candidate.textContent.trim() === expected )

        element?.click()
        return Boolean( element )
    }, selector, text )

    assert.ok( clicked, `Expected ${ selector } with text ${ text }` )
}

test( `real Chrome captures, syncs, searches, and relaunches offline`, {
    skip: !base_url ? `APP_BASE_URL is required` : false,
    timeout: 180_000,
}, async t => {
    const profile = await fs.mkdtemp( path.join( os.tmpdir(), `shad-browser-` ) )
    const browser = await puppeteer.launch( {
        args: [
            `--unsafely-treat-insecure-origin-as-secure=${ base_url }`,
            `--use-fake-device-for-media-stream`,
            `--use-fake-ui-for-media-stream`,
            `--use-file-for-fake-audio-capture=${ path.resolve( `tests/fixtures/audio/fake-microphone.wav` ) }`,
        ],
        executablePath: process.env.CHROME_PATH
            ?? process.env.PUPPETEER_EXECUTABLE_PATH
            ?? await puppeteer.executablePath(),
        headless: process.env.CHROME_HEADLESS === `true`,
        pipe: true,
        userDataDir: profile,
    } )
    const page = await browser.newPage()
    const browser_errors = []
    const api_failures = []

    page.on( `console`, message => {
        if( message.type() === `error` ) browser_errors.push( message.text() )
    } )
    page.on( `pageerror`, error => browser_errors.push( error.message ) )
    page.on( `response`, response => {
        if( response.url().includes( `/api/` ) && !response.ok() ) {
            api_failures.push( `${ response.status() } ${ response.url() }` )
        }
    } )

    t.after( async () => {
        if( t.signal.aborted ) {
            await fs.mkdir( `artifacts`, { recursive: true } )
            await page.screenshot( { path: `artifacts/e2e-failure.png`, fullPage: true } ).catch( () => {} )
        }

        await browser.close()
        await fs.rm( profile, { force: true, recursive: true } )
    } )

    await page.goto( base_url, { waitUntil: `networkidle0` } )
    mark( `shell loaded` )

    const capabilities = await page.evaluate( () => ( {
        indexed_db: Boolean( window.indexedDB ),
        media_devices: Boolean( navigator.mediaDevices?.getUserMedia ),
        secure_context: window.isSecureContext,
        wake_lock: `wakeLock` in navigator,
    } ) )

    assert.deepEqual( capabilities, {
        indexed_db: true,
        media_devices: true,
        secure_context: true,
        wake_lock: true,
    } )

    await page.type( `input[name=email]`, `browser@example.com` )
    await page.type( `input[name=password]`, `correct horse battery staple` )
    await page.click( `button[type=submit]` )
    await page.waitForFunction( () => document.body.textContent.includes( `What happened?` ) )
    mark( `administrator created` )

    const registration = await page.evaluate( async () => {
        const ready = await navigator.serviceWorker.ready
        return Boolean( ready.active )
    } )

    assert.equal( registration, true )
    mark( `service worker active` )

    await page.reload( { waitUntil: `domcontentloaded` } )
    await page.waitForFunction( () => document.body.textContent.includes( `What happened?` ) )
    assert.equal( await page.evaluate( () => Boolean( navigator.serviceWorker.controller ) ), true )
    mark( `service worker controls page` )

    await click_text( page, `button`, `Record` )
    await page.waitForFunction( () => document.body.textContent.includes( `Recording` ) )
    mark( `native recording started` )
    await new Promise( resolve => setTimeout( resolve, 1_500 ) )
    await click_text( page, `button`, `Stop` )
    await page.waitForFunction( () => document.body.textContent.includes( `Saved on this device` ) )
    mark( `recording durable locally` )
    try {
        await page.waitForSelector( `audio`, { timeout: 30_000 } )
    } catch ( error ) {
        const recordings = await page.evaluate( async () => {
            const database = await new Promise( ( resolve, reject ) => {
                const request = indexedDB.open( `shad_local` )

                request.addEventListener( `success`, () => resolve( request.result ) )
                request.addEventListener( `error`, () => reject( request.error ) )
            } )
            const transaction = database.transaction( `recordings`, `readonly` )
            const request = transaction.objectStore( `recordings` ).getAll()

            return new Promise( ( resolve, reject ) => {
                request.addEventListener( `success`, () => resolve( request.result ) )
                request.addEventListener( `error`, () => reject( request.error ) )
            } )
        } )

        mark( `recording diagnostics: ${ JSON.stringify( recordings ) }` )
        throw error
    }
    mark( `recording durable on server` )
    const online_audio_count = await page.$$eval( `audio`, elements => elements.length )

    await page.type( `textarea[name=note]`, `Browser journey epsilon remembers the canal.` )
    await click_text( page, `button`, `Save note` )
    await page.waitForFunction( () => document.body.textContent.includes( `Browser journey epsilon` ) )
    mark( `text note synchronized` )

    await page.goto( `${ base_url }/search?q=epsilon`, { waitUntil: `domcontentloaded` } )
    try {
        await page.waitForFunction( () => document.body.textContent.includes( `Browser journey epsilon` ) )
    } catch ( error ) {
        mark( `search diagnostics: ${ JSON.stringify( {
            api_failures,
            body: ( await page.$eval( `body`, element => element.innerText ) ).slice( 0, 2_000 ),
            browser_errors,
            url: page.url(),
        } ) }` )
        throw error
    }
    mark( `search result found` )

    const accessibility = await new AxePuppeteer( page ).analyze()
    const severe = accessibility.violations.filter( violation =>
        violation.impact === `critical` || violation.impact === `serious`
    )

    assert.deepEqual( severe.map( violation => violation.id ), [] )
    mark( `accessibility scan passed` )

    assert.deepEqual( browser_errors, [], `Browser failures: ${ JSON.stringify( {
        api_failures,
        browser_errors,
    } ) }` )

    await page.goto( base_url, { waitUntil: `domcontentloaded` } )
    await page.setOfflineMode( true )
    await page.reload( { waitUntil: `domcontentloaded` } )
    try {
        await page.waitForFunction( () => document.body.textContent.includes( `What happened?` ) )
    } catch ( error ) {
        mark( `offline diagnostics: ${ JSON.stringify( {
            body: ( await page.$eval( `body`, element => element.innerText ) ).slice( 0, 2_000 ),
            browser_errors,
            controller: await page.evaluate( () => Boolean( navigator.serviceWorker?.controller ) ),
            url: page.url(),
        } ) }` )
        throw error
    }
    mark( `offline shell relaunched` )
    await click_text( page, `button`, `Record` )
    await new Promise( resolve => setTimeout( resolve, 1_000 ) )
    await click_text( page, `button`, `Stop` )
    await page.waitForFunction( () => document.body.textContent.includes( `Saved on this device` ) )
    mark( `offline recording durable locally` )

    await click_text( page, `button`, `Record` )
    await new Promise( resolve => setTimeout( resolve, 6_000 ) )
    await page.reload( { waitUntil: `domcontentloaded` } )
    await page.waitForFunction( () => document.body.textContent.includes( `What happened?` ) )
    await page.waitForFunction( () => !document.body.textContent.includes( `Recording` ) )
    const interrupted_statuses = await page.evaluate( async () => {
        const database = await new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( `shad_local` )

            request.addEventListener( `success`, () => resolve( request.result ) )
            request.addEventListener( `error`, () => reject( request.error ) )
        } )
        const transaction = database.transaction( `recordings`, `readonly` )
        const request = transaction.objectStore( `recordings` ).getAll()

        return new Promise( ( resolve, reject ) => {
            request.addEventListener( `success`, () => resolve( request.result.map( row => row.status ) ) )
            request.addEventListener( `error`, () => reject( request.error ) )
        } )
    } )

    assert.equal( interrupted_statuses.includes( `recording` ), false )
    assert.equal( interrupted_statuses.includes( `unrecoverable` ), false )
    mark( `interrupted recording recovered after reload` )

    await page.setOfflineMode( false )
    try {
        await page.waitForFunction(
            expected => document.querySelectorAll( `audio` ).length >= expected,
            { timeout: 30_000 },
            online_audio_count + 2,
        )
    } catch ( error ) {
        const recordings = await page.evaluate( async () => {
            const database = await new Promise( ( resolve, reject ) => {
                const request = indexedDB.open( `shad_local` )

                request.addEventListener( `success`, () => resolve( request.result ) )
                request.addEventListener( `error`, () => reject( request.error ) )
            } )
            const transaction = database.transaction( `recordings`, `readonly` )
            const request = transaction.objectStore( `recordings` ).getAll()

            return new Promise( ( resolve, reject ) => {
                request.addEventListener( `success`, () => resolve( request.result ) )
                request.addEventListener( `error`, () => reject( request.error ) )
            } )
        } )

        mark( `reconnect diagnostics: ${ JSON.stringify( {
            api_failures,
            browser_errors,
            navigator_online: await page.evaluate( () => navigator.onLine ),
            recordings,
        } ) }` )
        throw error
    }
    mark( `offline recording synchronized after reconnect` )

    // Chrome reports failed transport and manifest refreshes while DevTools forces
    // the network offline. The zero-error assertion above keeps earlier failures strict.
    const unexpected_browser_errors = browser_errors.filter( error =>
        ![
            `Failed to load resource: net::ERR_INTERNET_DISCONNECTED`,
            `Manifest: Line: 1, column: 1, Syntax error.`,
        ].includes( error )
    )

    assert.deepEqual( unexpected_browser_errors, [] )
} )
