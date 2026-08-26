import { list_profiles } from "../src/server/archive/profile_store.js"
import { reconcile_archive } from "../src/server/archive/reconcile.js"
import { create_recovery } from "../src/server/auth/service.js"
import { read_config } from "../src/server/config/read_config.js"
import { create_runtime } from "../src/server/runtime/create_runtime.js"

const argument = process.argv.find( value => value.startsWith( `--admin-email=` ) )
const admin_email = argument?.slice( `--admin-email=`.length )

if( !admin_email ) throw new Error( `Usage: npm run recover-accounts -- --admin-email=name@example.com` )

const runtime = create_runtime( read_config() )

try {
    await reconcile_archive( runtime )

    const profiles = await list_profiles( runtime.config.diary_data_path )
    const profile = profiles.find( candidate =>
        candidate.email.normalize( `NFKC` ).trim().toLowerCase()
        === admin_email.normalize( `NFKC` ).trim().toLowerCase()
    )

    if( !profile || profile.role !== `admin` ) throw new Error( `Administrator profile was not found` )

    const recovery = create_recovery( runtime, profile.email )

    process.stdout.write( `Open this one-use link within one hour:\n/recover/${ recovery.token }\n` )
} finally {
    runtime.database.close()
}
