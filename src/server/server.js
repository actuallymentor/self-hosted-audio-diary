import { create_app } from "./create_app.js"
import { read_config } from "./config/read_config.js"
import { start_worker } from "./jobs/worker.js"
import { create_runtime } from "./runtime/create_runtime.js"

const config = read_config()
const runtime = create_runtime( config )
await runtime.uploads.cleanup_expired_uploads( runtime )
const app = await create_app( runtime )
const stop_worker = start_worker( runtime )
const upload_janitor = setInterval(
    () => void runtime.uploads.cleanup_expired_uploads( runtime ),
    24 * 60 * 60 * 1000,
)

upload_janitor.unref()

async function shutdown( signal ) {
    runtime.log( `Stopping SHAD`, { signal } )
    clearInterval( upload_janitor )
    await stop_worker()
    await app.close()
    runtime.database.close()
}

process.once( `SIGINT`, () => void shutdown( `SIGINT` ) )
process.once( `SIGTERM`, () => void shutdown( `SIGTERM` ) )

await app.listen( { host: `0.0.0.0`, port: config.APP_PORT } )
runtime.log( `SHAD listening`, { port: config.APP_PORT } )
