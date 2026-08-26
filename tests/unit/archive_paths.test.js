import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { confined_path, safe_email, user_root } from "../../src/server/archive/paths.js"

test( `creates recognizable stable user roots and confines paths`, async () => {
    const root = await fs.mkdtemp( path.join( os.tmpdir(), `shad-path-` ) )

    try {
        assert.equal( safe_email( ` Ä Person+Diary@example.com ` ), `a-person-diary@example.com` )
        const user = user_root( root, `stable-id`, `person@example.com` )

        assert.ok( user.endsWith( `person@example.com--stable-id` ) )
        assert.throws( () => confined_path( user, `..`, `escape` ), /escapes/ )

        await fs.mkdir( user, { recursive: true } )
        await fs.symlink( os.tmpdir(), path.join( user, `linked` ) )
        assert.throws( () => confined_path( user, `linked`, `secret.txt` ), /symbolic link/ )
    } finally {
        await fs.rm( root, { force: true, recursive: true } )
    }
} )
