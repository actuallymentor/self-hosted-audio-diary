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
    // Route changes render asynchronously; give the target a moment to appear
    const find = ( selected, expected ) => [ ...document.querySelectorAll( selected ) ]
        .some( candidate => candidate.textContent.trim() === expected )
    await page.waitForFunction( find, { timeout: 5_000 }, selector, text ).catch( () => {} )

    const clicked = await page.evaluate( ( selected, expected ) => {
        const element = [ ...document.querySelectorAll( selected ) ]
            .find( candidate => candidate.textContent.trim() === expected )

        element?.click()
        return Boolean( element )
    }, selector, text )

    assert.ok( clicked, `Expected ${ selector } with text ${ text }` )
}

// Let finite transitions (route crossfade, toasts) settle; mid-fade colors are transient
async function settle_animations( page ) {
    await page.waitForFunction( () => document.getAnimations().every( animation =>
        animation.playState !== `running` || animation.effect?.getComputedTiming().iterations === Infinity
    ) )
}

async function choose_date( page, date, selector = `input[type=date]` ) {
    await page.$eval( selector, ( element, next_date ) => {
        const value = Object.getOwnPropertyDescriptor( HTMLInputElement.prototype, `value` ).set

        value.call( element, next_date )
        element.dispatchEvent( new Event( `input`, { bubbles: true } ) )
        element.dispatchEvent( new Event( `change`, { bubbles: true } ) )
    }, date )
}

async function wait_for_sync( page ) {
    await page.waitForFunction( async () => {
        const database = await new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( `shad_local` )
            request.onsuccess = () => resolve( request.result )
            request.onerror = () => reject( request.error )
        } )
        const states = await Promise.all( [ `recordings`, `operations` ].map( name =>
            new Promise( ( resolve, reject ) => {
                const request = database.transaction( name, `readonly` ).objectStore( name ).getAll()
                request.onsuccess = () => resolve( request.result.every( row => row.status === `uploaded` ) )
                request.onerror = () => reject( request.error )
            } )
        ) )
        database.close()
        return states.every( Boolean )
    }, { timeout: 30_000 } )
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
    page.on( `dialog`, dialog => {
        // Reloading an interrupted capture deliberately accepts the leave warning.
        if( dialog.type() === `beforeunload` ) void dialog.accept()
        else void dialog.dismiss()
    } )
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
    await page.waitForFunction( () => Boolean( document.querySelector( `button[aria-label="Add entry"]` ) ) )
    mark( `administrator created` )

    const registration = await page.evaluate( async () => {
        const ready = await navigator.serviceWorker.ready
        return Boolean( ready.active )
    } )

    assert.equal( registration, true )
    mark( `service worker active` )

    await page.reload( { waitUntil: `domcontentloaded` } )
    await page.waitForFunction( () => Boolean( document.querySelector( `button[aria-label="Add entry"]` ) ) )
    assert.equal( await page.evaluate( () => Boolean( navigator.serviceWorker.controller ) ), true )
    mark( `service worker controls page` )

    // Hold real upload requests so the user-visible transfer phases are observable.
    const { promise: chunk_released, resolve: release_chunk } = Promise.withResolvers()
    const { promise: chunk_started, resolve: report_chunk_started } = Promise.withResolvers()
    const { promise: completion_released, resolve: release_completion } = Promise.withResolvers()
    const { promise: completion_started, resolve: report_completion_started } = Promise.withResolvers()
    let chunk_requests = 0
    let dropped_status_requests = 0

    await page.setRequestInterception( true )
    const hold_upload_phases = request => {
        const { pathname } = new URL( request.url() )

        if( /\/api\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test( pathname ) ) {
            chunk_requests += 1
            report_chunk_started()
            void chunk_released.then( () => request.continue() )
            return
        }

        if( /\/api\/v1\/uploads\/[^/]+\/complete$/.test( pathname ) ) {
            report_completion_started()
            void completion_released.then( () => request.continue() )
            return
        }

        if(
            request.method() === `GET`
            && /\/api\/v1\/uploads\/[^/]+$/.test( pathname )
            && dropped_status_requests === 0
        ) {
            dropped_status_requests += 1
            void request.abort( `failed` )
            return
        }

        void request.continue()
    }

    page.on( `request`, hold_upload_phases )

    await click_text( page, `button`, `Record` )
    await page.waitForFunction( () => document.body.textContent.includes( `Recording` ) )
    mark( `native recording started` )
    await new Promise( resolve => setTimeout( resolve, 1_500 ) )
    await click_text( page, `button`, `Stop` )
    await page.waitForFunction( () => document.body.textContent.includes( `Saved on this device` ) )
    mark( `recording durable locally` )
    await chunk_started
    await click_text( page, `a`, `Calendar` )
    await page.waitForFunction( () => [ ...document.querySelectorAll( `li` ) ].some( item =>
        item.textContent.includes( `On this device` )
        && item.textContent.includes( `Not yet on server` )
        && item.textContent.includes( `Transcription waits for upload` )
    ) )
    await click_text( page, `a`, `Today` )
    await page.waitForFunction( () => document.body.textContent.includes( `Uploading recording` ) )
    assert.equal( await page.$eval( `progress[aria-label="recording upload progress"]`, element => element.hasAttribute( `value` ) ), false )
    mark( `upload progress visible` )
    release_chunk()
    await completion_started
    await page.waitForFunction( () => document.body.textContent.includes( `Finishing safely` ) )
    assert.equal( await page.$eval(
        `progress[aria-label="recording upload progress"]`,
        element => element.value === element.max,
    ), true )
    mark( `server finalization visible` )
    release_completion()
    await wait_for_sync( page )
    await click_text( page, `a`, `Calendar` )
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
    await page.waitForFunction( () => !document.body.textContent.includes( `Device outbox` ) )
    await page.waitForFunction( () => [ ...document.querySelectorAll( `li` ) ].some( item =>
        item.querySelector( `audio` )
        && item.textContent.includes( `Not on this device` )
        && item.textContent.includes( `On server` )
        && ( item.textContent.includes( `Queued` ) || item.textContent.includes( `Transcribing` ) )
    ) )
    assert.equal( dropped_status_requests, 1 )
    assert.equal( chunk_requests, 1 )
    mark( `lost final acknowledgment resumed without re-upload` )
    page.off( `request`, hold_upload_phases )
    await page.setRequestInterception( false )
    let online_audio_count = await page.$$eval( `audio`, elements => elements.length )

    await click_text( page, `a`, `Calendar` )
    await page.waitForFunction( expected => document.querySelectorAll( `audio` ).length >= expected, {}, online_audio_count )
    assert.equal( await page.$eval( `body`, element => element.innerText.includes( `status unavailable` ) ), false )
    mark( `calendar recording state loaded` )

    const empty_date = `2000-01-02`
    const failed_date = `2000-01-03`
    const { promise: calendar_request_started, resolve: report_calendar_request } = Promise.withResolvers()
    const { promise: calendar_request_released, resolve: release_calendar_request } = Promise.withResolvers()
    const { promise: calendar_refresh_started, resolve: report_calendar_refresh } = Promise.withResolvers()
    const { promise: calendar_refresh_released, resolve: release_calendar_refresh } = Promise.withResolvers()
    let empty_requests = 0
    const hold_calendar_request = request => {
        const { pathname } = new URL( request.url() )

        if( request.method() === `GET` && pathname.endsWith( `/days/${ empty_date }` ) ) {
            empty_requests += 1

            if( empty_requests === 1 ) {
                report_calendar_request()
                void calendar_request_released.then( () => request.continue() )
            } else {
                report_calendar_refresh()
                void calendar_refresh_released.then( () => request.continue() )
            }
            return
        }

        if( request.method() === `GET` && pathname.endsWith( `/days/${ failed_date }` ) ) {
            void request.abort( `failed` )
            return
        }

        void request.continue()
    }

    await page.setRequestInterception( true )
    page.on( `request`, hold_calendar_request )
    await choose_date( page, empty_date )
    await calendar_request_started
    await page.waitForFunction( () => document.body.textContent.includes( `Loading your day…` ) )
    release_calendar_request()
    await page.waitForFunction( () => document.body.textContent.includes( `No entries yet` ) )
    await page.evaluate( () => window.dispatchEvent( new CustomEvent( `shad:synchronized` ) ) )
    await calendar_refresh_started
    assert.equal( await page.$eval( `body`, element => element.innerText.includes( `This day could not be loaded` ) ), false )
    release_calendar_refresh()
    await choose_date( page, failed_date )
    await page.waitForFunction( () => document.body.textContent.includes( `This day could not be loaded` ) )
    await page.waitForSelector( `dialog[open]` )
    await click_text( page, `dialog[open] button`, `Close` )
    await page.waitForFunction( () => !document.querySelector( `dialog[open]` ) )
    page.off( `request`, hold_calendar_request )
    await page.setRequestInterception( false )
    mark( `calendar date change distinguishes empty and unavailable state` )

    await click_text( page, `a`, `Today` )
    assert.equal( await page.$( `textarea[name=note]` ), null )
    assert.equal( await page.$( `audio` ), null )
    await page.click( `button[aria-label="Add entry"]` )
    await click_text( page, `button`, `Note` )
    await page.waitForSelector( `textarea[name=note]` )
    await page.type( `textarea[name=note]`, `Browser journey epsilon remembers the canal.` )
    await click_text( page, `button`, `Save note` )
    await page.waitForFunction( () => document.body.textContent.includes( `Note saved on this device` ) )
    await wait_for_sync( page )
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

    await settle_animations( page )
    const accessibility = await new AxePuppeteer( page ).analyze()
    const severe = accessibility.violations.filter( violation =>
        violation.impact === `critical` || violation.impact === `serious`
    )

    assert.deepEqual( severe.map( violation => violation.id ), [] )
    mark( `accessibility scan passed` )

    // Leaving capture must finalize the live microphone before Calendar takes over.
    await click_text( page, `a`, `Today` )
    await click_text( page, `button`, `Record` )
    await page.waitForFunction( () => document.querySelector( `button[aria-pressed="true"]` ) )
    await new Promise( resolve => setTimeout( resolve, 1_000 ) )
    await click_text( page, `a`, `Calendar` )
    await page.waitForFunction( expected => document.querySelectorAll( `audio` ).length === expected, {}, online_audio_count + 1 )
    await wait_for_sync( page )
    online_audio_count += 1
    mark( `navigation away from live recording finalized and synchronized capture` )

    // A late microphone permission result must not create an orphaned recording.
    await click_text( page, `a`, `Today` )
    const count_local_recordings = () => page.evaluate( async () => {
        const database = await new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( `shad_local` )
            request.onsuccess = () => resolve( request.result )
            request.onerror = () => reject( request.error )
        } )
        const count = await new Promise( ( resolve, reject ) => {
            const request = database.transaction( `recordings`, `readonly` ).objectStore( `recordings` ).count()
            request.onsuccess = () => resolve( request.result )
            request.onerror = () => reject( request.error )
        } )
        database.close()
        return count
    } )
    const recordings_before_permission = await count_local_recordings()
    await page.evaluate( () => {
        const devices = navigator.mediaDevices
        const native_request = devices.getUserMedia
        window.shad_permission_gate = {}
        devices.getUserMedia = async function( ...args ) {
            const stream = await native_request.apply( devices, args )
            window.shad_permission_gate.stream = stream
            await new Promise( resolve => {
                window.shad_permission_gate.release = resolve
            } )
            return stream
        }
    } )
    try {
        await click_text( page, `button`, `Record` )
        await page.waitForFunction( () => Boolean( window.shad_permission_gate.release ) )
        assert.equal( await page.$$eval( `button`, elements => elements.some( element => element.textContent === `Starting…` && element.disabled ) ), true )
        await click_text( page, `a`, `Calendar` )
        await page.evaluate( () => window.shad_permission_gate.release() )
        await page.waitForFunction( () => window.shad_permission_gate.stream.getTracks().every( track => track.readyState === `ended` ) )
        assert.equal( await count_local_recordings(), recordings_before_permission )
    } finally {
        await page.evaluate( () => {
            window.shad_permission_gate.release?.()
            delete navigator.mediaDevices.getUserMedia
            delete window.shad_permission_gate
        } )
    }
    mark( `late microphone permission released real tracks without creating a recording` )

    // Delay only the native wake-lock promise to reproduce navigation during startup.
    await click_text( page, `a`, `Today` )
    await page.evaluate( () => {
        const wake_lock = navigator.wakeLock
        const native_request = wake_lock.request
        window.shad_wake_gate = {}
        wake_lock.request = async function( ...args ) {
            const lock = await native_request.apply( wake_lock, args )
            window.shad_wake_gate.lock = lock
            await new Promise( resolve => {
                window.shad_wake_gate.release = resolve
            } )
            return lock
        }
    } )
    try {
        await click_text( page, `button`, `Record` )
        await page.waitForFunction( () => Boolean( window.shad_wake_gate.release ) )
        assert.equal( await page.$$eval( `button`, elements => elements.some( element => element.textContent === `Starting…` && element.disabled ) ), true )
        await new Promise( resolve => setTimeout( resolve, 1_000 ) )
        await click_text( page, `a`, `Calendar` )
        await page.evaluate( () => window.shad_wake_gate.release() )
        await page.waitForFunction( expected => document.querySelectorAll( `audio` ).length === expected, {}, online_audio_count + 1 )
        await wait_for_sync( page )
        await page.waitForFunction( () => window.shad_wake_gate.lock.released )
        online_audio_count += 1
    } finally {
        await page.evaluate( () => {
            window.shad_wake_gate.release?.()
            delete navigator.wakeLock.request
            delete window.shad_wake_gate
        } )
    }
    mark( `navigation during pending startup released the native wake lock and synchronized capture` )

    // Exercise the compact capture controls with real browser file choosers.
    await click_text( page, `a`, `Today` )
    await page.focus( `button[aria-label="Add entry"]` )
    await page.keyboard.press( `Enter` )
    await page.waitForSelector( `#capture-options` )
    await page.keyboard.press( `Escape` )
    assert.equal( await page.$( `#capture-options` ), null )
    assert.equal( await page.$eval( `button[aria-label="Add entry"]`, element => element === document.activeElement ), true )

    const photo_path = path.join( profile, `diary-photo.png` )
    const video_path = path.join( profile, `diary-video.webm` )
    await page.screenshot( { path: photo_path } )
    const video_bytes = await page.evaluate( async () => {
        const canvas = document.createElement( `canvas` )
        canvas.width = 160
        canvas.height = 90
        const context = canvas.getContext( `2d` )
        context.fillStyle = `#2468a0`
        context.fillRect( 0, 0, 160, 90 )
        const stream = canvas.captureStream( 10 )
        const recorder = new MediaRecorder( stream, { mimeType: `video/webm` } )
        const chunks = []
        recorder.ondataavailable = event => chunks.push( event.data )
        const stopped = new Promise( resolve => {
            recorder.onstop = resolve
        } )
        recorder.start()
        await new Promise( resolve => setTimeout( resolve, 300 ) )
        recorder.stop()
        await stopped
        stream.getTracks().forEach( track => track.stop() )
        return [ ...new Uint8Array( await new Blob( chunks ).arrayBuffer() ) ]
    } )
    await fs.writeFile( video_path, new Uint8Array( video_bytes ) )

    // Retain the real Blob read, delaying its result so local saving is observable.
    await page.evaluate( () => {
        const native_read = Blob.prototype.arrayBuffer
        window.shad_video_gate = { native_read }
        Blob.prototype.arrayBuffer = async function() {
            const bytes = await native_read.call( this )
            if( this.type.startsWith( `video/` ) && !window.shad_video_gate.release ) {
                await new Promise( resolve => {
                    window.shad_video_gate.release = resolve
                } )
            }
            return bytes
        }
    } )
    try {
        for( const [ label, file ] of [ [ `Photo`, photo_path ], [ `Video`, video_path ] ] ) {
            await page.click( `button[aria-label="Add entry"]` )
            const [ chooser ] = await Promise.all( [ page.waitForFileChooser(), click_text( page, `button`, label ) ] )
            await chooser.accept( [ file ] )
            if( label === `Video` ) {
                await page.waitForFunction( () => Boolean( window.shad_video_gate.release ) )
                await page.waitForFunction( () => document.body.textContent.includes( `Saving video on this device…` ) )
                await page.evaluate( () => window.shad_video_gate.release() )
            }
            await page.waitForFunction( expected => document.body.textContent.includes( `${ expected } saved on this device` ), {}, label )
            await wait_for_sync( page )
        }
    } finally {
        await page.evaluate( () => {
            window.shad_video_gate.release?.()
            Blob.prototype.arrayBuffer = window.shad_video_gate.native_read
            delete window.shad_video_gate
        } )
    }
    await click_text( page, `a`, `Calendar` )
    await page.waitForSelector( `video` )
    await page.waitForSelector( `main img` )
    mark( `photo and video actions uploaded through native file choosers` )

    await page.waitForSelector( `input[name=tags]` )
    await page.type( `input[name=tags]`, `browser, calm` )
    await click_text( page, `button`, `Save tags` )
    await page.waitForFunction( () => document.body.textContent.includes( `Changes saved` ) )
    await page.reload( { waitUntil: `networkidle0` } )
    assert.equal( await page.$eval( `input[name=tags]`, element => element.value ), `browser, calm` )

    for( const [ before, after ] of [ [ `2024-12-31`, `2025-01-01` ], [ `2024-02-28`, `2024-02-29` ], [ `2024-02-29`, `2024-03-01` ], [ `2025-03-09`, `2025-03-10` ] ] ) {
        await choose_date( page, before )
        await page.click( `button[aria-label="Next day"]` )
        await page.waitForFunction( expected => document.querySelector( `input[type=date]` ).value === expected, {}, after )
        assert.equal( new URL( page.url() ).searchParams.get( `date` ), after )
        await page.click( `button[aria-label="Previous day"]` )
        await page.waitForFunction( expected => document.querySelector( `input[type=date]` ).value === expected, {}, before )
    }
    await click_text( page, `button`, `Today` )
    await page.waitForSelector( `audio` )
    mark( `calendar tags persisted and day arrows cross leap/month/year boundaries` )

    await click_text( page, `a`, `Reflect` )
    await page.waitForSelector( `select[name=period]` )
    assert.equal( await page.$eval( `select[name=period]`, element => element.value ), `week` )
    assert.deepEqual( await page.$$eval( `select[name=period] option`, elements => elements.map( element => element.textContent ) ), [ `Week`, `Month`, `Quarter`, `Year`, `Custom` ] )
    let previous_start = `9999-12-31`
    for( const period of [ `week`, `month`, `quarter`, `year` ] ) {
        await page.select( `select[name=period]`, period )
        assert.equal( await page.$( `input[type=date]` ), null )
        const dates = await page.$eval( `form small`, element => element.textContent.match( /\d{4}-\d{2}-\d{2}/g ) )
        assert.equal( dates.length, 2 )
        const [ range_start ] = dates
        assert.ok( range_start < previous_start )
        previous_start = range_start
    }
    await page.select( `select[name=period]`, `custom` )
    await choose_date( page, `2024-02-01`, `input[name=range_start]` )
    await choose_date( page, `2024-02-29`, `input[name=range_end]` )
    await page.select( `select[name=period]`, `month` )
    await page.select( `select[name=period]`, `custom` )
    assert.equal( await page.$eval( `input[name=range_start]`, element => element.value ), `2024-02-01` )
    await page.type( `textarea[name=question]`, `What gave me energy?` )
    await choose_date( page, `2024-03-01`, `input[name=range_start]` )
    await click_text( page, `button`, `Start reflection` )
    assert.equal( await page.$eval( `form`, element => element.checkValidity() ), false )
    mark( `reflection presets and custom date validation passed` )

    await page.click( `button[aria-controls="app-menu"]` )
    await click_text( page, `#app-menu a`, `Settings` )
    await page.waitForSelector( `#--font-scale` )
    assert.deepEqual( await page.$$eval( `output`, elements => elements.map( element => element.value ) ), [ `100%`, `1.55×`, `0.00em` ] )
    assert.equal( await page.$$eval( `input[type=range]`, elements => elements.every( element => document.getElementById( element.getAttribute( `aria-describedby` ) )?.textContent.startsWith( `Default` ) ) ), true )
    await page.click( `button[aria-label="Increase text size"]` )
    await page.focus( `#--line-height` )
    await page.keyboard.press( `ArrowRight` )
    await page.focus( `#--letter-spacing` )
    await page.keyboard.press( `ArrowRight` )
    await page.reload( { waitUntil: `networkidle0` } )
    assert.deepEqual( await page.$$eval( `input[type=range]`, elements => elements.map( element => element.value ) ), [ `105`, `156`, `1` ] )
    assert.deepEqual( await page.$$eval( `output`, elements => elements.map( element => element.value ) ), [ `105%`, `1.56×`, `0.01em` ] )
    assert.equal( await page.$eval( `[aria-label="Reading preview"]`, element => getComputedStyle( element ).fontSize ), `16.8px` )
    await page.click( `button[aria-label="Decrease text size"]` )
    assert.equal( await page.$eval( `#--font-scale`, element => element.value ), `100` )

    await page.setViewport( { width: 390, height: 844 } )
    const menu = `button[aria-controls="app-menu"]`
    const tabs = `nav[aria-label="Primary navigation, mobile"]`
    await page.waitForSelector( tabs, { visible: true } )
    await page.waitForSelector( menu, { visible: true } )
    assert.equal( await page.$eval( menu, element => element.getAttribute( `aria-expanded` ) ), `false` )
    await page.focus( menu )
    await page.keyboard.press( `Enter` )
    await page.keyboard.press( `Tab` )
    assert.equal( await page.evaluate( () => document.activeElement.textContent ), `Settings` )
    await page.keyboard.press( `Escape` )
    assert.equal( await page.$eval( menu, element => element === document.activeElement ), true )
    assert.equal( await page.$eval( menu, element => element.getAttribute( `aria-expanded` ) ), `false` )
    await click_text( page, `${ tabs } a`, `Today` )
    await page.waitForSelector( `button[aria-label="Add entry"]` )
    assert.equal( await page.$( `textarea[name=note]` ), null )
    await fs.mkdir( `artifacts`, { recursive: true } )
    await page.screenshot( { path: `artifacts/home-mobile.png`, fullPage: true } )
    await page.click( menu )
    await click_text( page, `#app-menu a`, `Settings` )
    await page.waitForSelector( `#--font-scale` )
    for( const selector of [ `#--font-scale`, `#--line-height`, `#--letter-spacing` ] ) {
        await page.focus( selector )
        await page.keyboard.press( `End` )
    }
    assert.equal( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth ), true )
    await page.screenshot( { path: `artifacts/settings-mobile-large-text.png`, fullPage: true } )
    await settle_animations( page )
    const settings_accessibility = await new AxePuppeteer( page ).analyze()
    const settings_violations = settings_accessibility.violations.filter( violation => [ `critical`, `serious` ].includes( violation.impact ) )
    assert.deepEqual( settings_violations.map( violation => violation.id ), [], JSON.stringify( settings_violations.map( violation => [ violation.id, violation.nodes.map( node => [ node.target, node.any[ 0 ]?.message ] ) ] ) ) )
    for( const label of [ `Calendar`, `Reflect` ] ) {
        await click_text( page, `${ tabs } a`, label )
        await page.waitForSelector( label === `Calendar` ? `input[type=date]` : `select[name=period]` )
        assert.equal( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth ), true, `${ label } fits mobile with maximum reading overrides` )
        await page.screenshot( { path: `artifacts/${ label.toLowerCase() }-mobile-large-text.png`, fullPage: true } )
    }
    await page.click( menu )
    await click_text( page, `#app-menu a`, `Settings` )
    await page.waitForSelector( `#--font-scale` )
    for( const label of [ `text size`, `line spacing`, `letter spacing` ] ) {
        await page.click( `button[aria-label="Reset ${ label }"]` )
    }
    assert.deepEqual( await page.$$eval( `output`, elements => elements.map( element => element.value ) ), [ `100%`, `1.55×`, `0.00em` ] )
    await page.setViewport( { width: 1280, height: 900 } )
    await page.waitForSelector( `nav[aria-label="Primary navigation"]`, { visible: true } )
    await page.screenshot( { path: `artifacts/settings-desktop.png`, fullPage: true } )
    mark( `reading controls persisted, defaults reset, mobile keyboard navigation and large text passed` )

    const unexpected_online_errors = browser_errors.filter(
        error => error !== `Failed to load resource: net::ERR_FAILED`,
    )

    assert.deepEqual( unexpected_online_errors, [], `Browser failures: ${ JSON.stringify( {
        api_failures,
        browser_errors,
    } ) }` )

    await page.goto( base_url, { waitUntil: `domcontentloaded` } )
    await page.setOfflineMode( true )
    await page.reload( { waitUntil: `domcontentloaded` } )
    try {
        await page.waitForFunction( () => Boolean( document.querySelector( `button[aria-label="Add entry"]` ) ) )
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
    await click_text( page, `a`, `Calendar` )
    await page.waitForFunction( () => [ ...document.querySelectorAll( `li` ) ].some( item =>
        item.textContent.includes( `Server status unavailable` )
        && item.textContent.includes( `Transcription status unavailable` )
        && item.textContent.includes( `Upload confirmed earlier` )
    ) )
    mark( `uploaded recording remains visible offline` )
    await click_text( page, `a`, `Today` )
    await click_text( page, `button`, `Record` )
    await new Promise( resolve => setTimeout( resolve, 1_000 ) )
    await click_text( page, `button`, `Stop` )
    await page.waitForFunction( () => document.body.textContent.includes( `Saved on this device` ) )
    mark( `offline recording durable locally` )
    await click_text( page, `a`, `Calendar` )
    await page.waitForFunction( () => [ ...document.querySelectorAll( `li` ) ].some( item =>
        item.textContent.includes( `On this device` )
        && item.textContent.includes( `Server status unavailable` )
        && item.textContent.includes( `Transcription status unavailable` )
    ) )
    await click_text( page, `a`, `Today` )

    await page.waitForFunction( () => [ ...document.querySelectorAll( `button` ) ].some( button =>
        button.textContent.trim() === `Record`
    ) )
    await click_text( page, `button`, `Record` )
    await new Promise( resolve => setTimeout( resolve, 6_000 ) )
    await page.reload( { waitUntil: `domcontentloaded` } )
    await page.waitForFunction( () => Boolean( document.querySelector( `button[aria-label="Add entry"]` ) ) )
    await page.waitForFunction( async () => {
        const database = await new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( `shad_local` )

            request.addEventListener( `success`, () => resolve( request.result ) )
            request.addEventListener( `error`, () => reject( request.error ) )
        } )
        const transaction = database.transaction( `recordings`, `readonly` )
        const request = transaction.objectStore( `recordings` ).getAll()
        const recordings = await new Promise( ( resolve, reject ) => {
            request.addEventListener( `success`, () => resolve( request.result ) )
            request.addEventListener( `error`, () => reject( request.error ) )
        } )
        const recovered = recordings.every( recording => recording.status !== `recording` )

        database.close()
        return recovered
    }, { polling: 100 } )
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
    await wait_for_sync( page )
    await click_text( page, `a`, `Calendar` )
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
            `Failed to load resource: net::ERR_FAILED`,
            `Failed to load resource: net::ERR_INTERNET_DISCONNECTED`,
            `Manifest: Line: 1, column: 1, Syntax error.`,
        ].includes( error )
    )

    assert.deepEqual( unexpected_browser_errors, [] )
} )
