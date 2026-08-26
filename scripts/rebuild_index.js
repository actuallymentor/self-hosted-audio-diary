import { read_config } from "../src/server/config/read_config.js"
import { create_runtime } from "../src/server/runtime/create_runtime.js"

const runtime = create_runtime( read_config() )

try {
    runtime.search.rebuild_index( runtime )
    process.stdout.write( `Search index rebuilt.\n` )
} finally {
    runtime.database.close()
}
