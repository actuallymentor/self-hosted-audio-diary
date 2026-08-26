import { reconcile_archive } from "../src/server/archive/reconcile.js"
import { read_config } from "../src/server/config/read_config.js"
import { create_runtime } from "../src/server/runtime/create_runtime.js"

const runtime = create_runtime( read_config() )

try {
    const report = await reconcile_archive( runtime )
    process.stdout.write( `${ JSON.stringify( report, null, 2 ) }\n` )

    if( report.conflicts.length ) process.exitCode = 2
} finally {
    runtime.database.close()
}
