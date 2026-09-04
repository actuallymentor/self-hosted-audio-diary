import fs from "node:fs/promises"

import { archive_schema_version } from "../../shared/constants.js"
import { ensure_day, project_item, project_tags } from "../diary/service.js"
import { list_profiles } from "./profile_store.js"
import { confined_path, user_root } from "./paths.js"

/**
 * Rebuild database projections from human-readable archive files without rewriting them.
 *
 * @param {object} runtime
 * @returns {Promise<object>}
 */
export async function reconcile_archive( runtime ) {
    const report = { conflicts: [], days: 0, items: 0, profiles: 0 }
    const profiles = await list_profiles( runtime.config.diary_data_path )

    for( const profile of profiles ) {
        report.profiles += 1

        const existing = runtime.database.prepare( `SELECT id FROM users WHERE id = ?` ).get( profile.user_id )

        if( !existing ) {
            runtime.database.prepare( `
                INSERT INTO users (
                    id, email, email_normalized, password_hash, role, status, created_at
                ) VALUES (?, ?, ?, '!recovery-required!', ?, 'recovery_pending', ?)
            ` ).run(
                profile.user_id,
                profile.email,
                profile.email.normalize( `NFKC` ).trim().toLowerCase(),
                profile.role === `admin` ? `admin` : `member`,
                Date.now(),
            )
        }

        const root = user_root(
            runtime.config.diary_data_path,
            profile.user_id,
            profile.email,
        )
        const days_root = confined_path( root, `days` )
        let dates = []

        try {
            dates = ( await fs.readdir( days_root, { withFileTypes: true } ) )
                .filter( entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test( entry.name ) )
                .map( entry => entry.name )
        } catch ( error ) {
            if( error.code !== `ENOENT` ) throw error
        }

        for( const local_date of dates ) {
            const metadata_path = confined_path( days_root, local_date, `metadata.json` )
            let metadata

            try {
                metadata = JSON.parse( await fs.readFile( metadata_path, `utf8` ) )
            } catch ( error ) {
                report.conflicts.push( { local_date, reason: error.code ?? `invalid_metadata` } )
                continue
            }

            if( !metadata || typeof metadata !== `object` || Array.isArray( metadata ) ) {
                report.conflicts.push( { local_date, reason: `invalid_metadata` } )
                continue
            }

            if( metadata.schema_version > archive_schema_version ) {
                report.conflicts.push( { local_date, reason: `newer_schema` } )
                continue
            }

            report.days += 1
            ensure_day( runtime, profile.user_id, local_date )
            const valid_tags = Array.isArray( metadata.tags )
                && metadata.tags.every( tag => typeof tag === `string` )

            if( !valid_tags ) {
                report.conflicts.push( { local_date, reason: `invalid_tags` } )
            }

            project_tags(
                runtime,
                profile.user_id,
                local_date,
                valid_tags ? metadata.tags : [],
            )

            if( !Array.isArray( metadata.items ) ) {
                report.conflicts.push( { local_date, reason: `invalid_items` } )
                continue
            }

            for( const item of metadata.items ) {
                try {
                    const target = confined_path( days_root, local_date, item.path )

                    await fs.access( target )

                    if( item.type === `text` ) item.text = ( await fs.readFile( target, `utf8` ) ).trim()

                    if( item.transcript?.display_path ) {
                        item.display_transcript = ( await fs.readFile(
                            confined_path( days_root, local_date, item.transcript.display_path ),
                            `utf8`,
                        ) ).trim()
                    }

                    project_item( runtime, {
                        email: profile.email,
                        id: profile.user_id,
                    }, local_date, item )

                    if( item.type === `audio` ) {
                        const job_id = runtime.jobs.enqueue( runtime, {
                            dedupe_key: `${ item.id }:${ item.sha256 }`,
                            payload: { item_id: item.id },
                            type: `transcription`,
                            user_id: profile.user_id,
                        } )

                        // Archive transcript metadata is canonical proof that
                        // recovered operational state should already be complete.
                        if( item.transcript ) runtime.jobs.finish( runtime, { id: job_id } )
                    }

                    report.items += 1
                } catch ( error ) {
                    report.conflicts.push( {
                        item_id: item?.id,
                        local_date,
                        reason: error.code ?? `invalid_item`,
                    } )
                }
            }
        }
    }

    return report
}
