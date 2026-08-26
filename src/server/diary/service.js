import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { atomic_write, pretty_json } from "../archive/atomic_write.js"
import { day_paths, read_day, update_day } from "../archive/day_store.js"
import { confined_path, user_root } from "../archive/paths.js"
import { normalize_capture } from "../../shared/time.js"

function time_prefix( utc ) {
    return new Date( utc ).toISOString().slice( 11, 23 ).replaceAll( `:`, `-` )
}

/**
 * Read a day from its canonical archive representation.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} local_date
 * @returns {Promise<object>}
 */
export async function get_day( runtime, user, local_date ) {
    return read_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date,
        user_id: user.id,
    } )
}

/**
 * Persist a canonical text note before updating its database projection.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function add_text( runtime, user, input ) {
    const capture = normalize_capture( input.capture ?? {} )
    const item_id = input.item_id ?? randomUUID()
    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: capture.local_date,
        user_id: user.id,
    } )
    const relative_path = path.join(
        `text`,
        `${ time_prefix( capture.utc ) }--${ item_id }.txt`,
    )
    const target = confined_path( paths.absolute, relative_path )
    const text = input.text.trim()
    const item = {
        canonical: true,
        capture,
        id: item_id,
        path: relative_path,
        text,
        type: `text`,
    }

    await atomic_write( target, `${ text }\n` )
    await update_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: capture.local_date,
        user_id: user.id,
    }, metadata => {
        const existing = metadata.items.find( candidate => candidate.id === item_id )

        if( existing ) return metadata

        metadata.items.push( item )
        metadata.items.sort( ( left, right ) => left.capture.utc.localeCompare( right.capture.utc ) )

        return metadata
    } )

    project_item( runtime, user, capture.local_date, item )

    return item
}

/**
 * Replace normalized day tags in archive and projection.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} local_date
 * @param {string[]} submitted_tags
 * @returns {Promise<string[]>}
 */
export async function set_tags( runtime, user, local_date, submitted_tags ) {
    const tags = normalize_tags( submitted_tags )

    await update_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date,
        user_id: user.id,
    }, metadata => ( { ...metadata, tags } ) )

    project_tags( runtime, user.id, local_date, tags )

    return tags
}

function normalize_tags( submitted_tags ) {
    const valid_tags = Array.isArray( submitted_tags )
        ? submitted_tags.filter( tag => typeof tag === `string` )
        : []

    return [ ...new Set( valid_tags
        .map( tag => tag.normalize( `NFKC` ).trim().toLowerCase() )
        .filter( Boolean ) ) ]
        .sort()
}

/**
 * Project canonical day tags without rewriting the archive.
 *
 * @param {object} runtime
 * @param {string} user_id
 * @param {string} local_date
 * @param {string[]} submitted_tags
 * @returns {string[]}
 */
export function project_tags( runtime, user_id, local_date, submitted_tags ) {
    const tags = normalize_tags( submitted_tags )
    const day_id = `${ user_id }:${ local_date }`

    runtime.database.transaction( () => {
        ensure_day( runtime, user_id, local_date )
        runtime.database.prepare( `DELETE FROM day_tags WHERE day_id = ?` ).run( day_id )

        for( const tag of tags ) {
            runtime.database.prepare( `
        INSERT INTO tags (user_id, value) VALUES (?, ?)
        ON CONFLICT(user_id, value) DO NOTHING
      ` ).run( user_id, tag )
            const tag_id = runtime.database
                .prepare( `SELECT id FROM tags WHERE user_id = ? AND value = ?` )
                .get( user_id, tag ).id
            runtime.database.prepare( `INSERT INTO day_tags (day_id, tag_id) VALUES (?, ?)` ).run( day_id, tag_id )
        }

        runtime.database.prepare( `
      UPDATE search_documents SET tags = ? WHERE user_id = ? AND local_date = ?
    ` ).run( tags.join( ` ` ), user_id, local_date )
    } )()

    return tags
}

/**
 * Ensure the database contains a projection row for one archive day.
 *
 * @param {object} runtime
 * @param {string} user_id
 * @param {string} local_date
 */
export function ensure_day( runtime, user_id, local_date ) {
    runtime.database.prepare( `
    INSERT INTO days (id, user_id, local_date, metadata_path, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, local_date) DO UPDATE SET updated_at = excluded.updated_at
  ` ).run(
        `${ user_id }:${ local_date }`,
        user_id,
        local_date,
        path.join( `days`, local_date, `metadata.json` ),
        Date.now(),
    )
}

/**
 * Project one canonical item into SQLite and FTS after its files are durable.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} local_date
 * @param {object} item
 */
export function project_item( runtime, user, local_date, item ) {
    const captured_at = new Date( item.capture.utc ).getTime()
    const text = item.text ?? item.display_transcript ?? ``

    runtime.database.transaction( () => {
        ensure_day( runtime, user.id, local_date )
        runtime.database.prepare( `
      INSERT INTO items (
        id, user_id, day_id, type, relative_path, display_text, mime,
        sha256, byte_size, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        relative_path = excluded.relative_path,
        display_text = excluded.display_text,
        mime = excluded.mime,
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        deleted_at = NULL
    ` ).run(
            item.id,
            user.id,
            `${ user.id }:${ local_date }`,
            item.type,
            item.path,
            text,
            item.mime ?? null,
            item.sha256 ?? null,
            item.byte_size ?? null,
            captured_at,
            Date.now(),
        )
        runtime.search.index_document( runtime, {
            content: text,
            item_id: item.id,
            local_date,
            type: item.type,
            user_id: user.id,
        } )
    } )()
}

function owned_item( runtime, user_id, item_id ) {
    return runtime.database.prepare( `
        SELECT items.*, days.local_date
        FROM items JOIN days ON days.id = items.day_id
        WHERE items.id = ? AND items.user_id = ? AND items.deleted_at IS NULL
    ` ).get( item_id, user_id )
}

/**
 * Edit a canonical text note or the manual display transcript, never machine output.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} item_id
 * @param {string} text
 * @returns {Promise<object>}
 */
export async function edit_item_text( runtime, user, item_id, text ) {
    const item = owned_item( runtime, user.id, item_id )

    if( !item ) {
        const error = new Error( `Diary item was not found` )
        error.status_code = 404
        error.code = `item_not_found`
        throw error
    }

    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    } )
    let target

    if( item.type === `text` ) {
        target = confined_path( paths.absolute, item.relative_path )
    } else if( item.type === `audio` ) {
        const metadata = await read_day( {
            diary_root: runtime.config.diary_data_path,
            email: user.email,
            local_date: item.local_date,
            user_id: user.id,
        } )
        const archived = metadata.items.find( candidate => candidate.id === item_id )

        if( !archived?.transcript?.display_path ) {
            const error = new Error( `Transcript is not ready` )
            error.status_code = 409
            error.code = `transcript_unavailable`
            throw error
        }

        target = confined_path( paths.absolute, archived.transcript.display_path )
    } else {
        const error = new Error( `This item has no editable text` )
        error.status_code = 422
        error.code = `item_not_editable`
        throw error
    }

    await atomic_write( target, `${ text.trim() }\n` )
    await update_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    }, metadata => {
        const archived = metadata.items.find( candidate => candidate.id === item_id )

        if( item.type === `text` ) archived.text = text.trim()
        else {
            archived.display_transcript = text.trim()
            archived.transcript.display_source = `manual`
        }

        return metadata
    } )
    runtime.database.prepare( `UPDATE items SET display_text = ? WHERE id = ?` ).run( text.trim(), item_id )
    runtime.search.index_document( runtime, {
        content: text.trim(),
        item_id,
        local_date: item.local_date,
        type: item.type,
        user_id: user.id,
    } )

    return { id: item_id, text: text.trim() }
}

/**
 * Move canonical and preserved generated files into recoverable per-user trash.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} item_id
 * @returns {Promise<object>}
 */
export async function trash_item( runtime, user, item_id ) {
    const item = owned_item( runtime, user.id, item_id )

    if( !item ) {
        const error = new Error( `Diary item was not found` )
        error.status_code = 404
        error.code = `item_not_found`
        throw error
    }

    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    } )
    const deleted_at = new Date()
    const tombstone_id = randomUUID()
    const trash_root = confined_path(
        paths.root,
        `.trash`,
        deleted_at.toISOString().replaceAll( `:`, `-` ),
        tombstone_id,
    )
    const metadata = await read_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    } )
    const archived = metadata.items.find( candidate => candidate.id === item_id )
    const relative_files = [
        archived.path,
        archived.transcript?.machine_path,
        archived.transcript?.display_path,
    ].filter( Boolean )

    await fs.mkdir( trash_root, { recursive: true } )

    for( const relative_file of relative_files ) {
        const source = confined_path( paths.absolute, relative_file )
        const target = confined_path( trash_root, relative_file )

        await fs.mkdir( path.dirname( target ), { recursive: true } )
        await fs.rename( source, target )
    }

    await atomic_write( confined_path( trash_root, `tombstone.json` ), pretty_json( {
        day: item.local_date,
        deleted_at: deleted_at.toISOString(),
        item: archived,
        tombstone_id,
    } ) )
    await update_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date: item.local_date,
        user_id: user.id,
    }, value => {
        value.items = value.items.filter( candidate => candidate.id !== item_id )
        value.tombstones ??= []
        value.tombstones.push( {
            deleted_at: deleted_at.toISOString(),
            item_id,
            tombstone_id,
        } )
        return value
    } )
    runtime.database.transaction( () => {
        runtime.database.prepare( `UPDATE items SET deleted_at = ? WHERE id = ?` ).run( deleted_at.getTime(), item_id )
        runtime.database.prepare( `DELETE FROM search_documents WHERE user_id = ? AND item_id = ?` ).run( user.id, item_id )
    } )()

    return { deleted_at: deleted_at.toISOString(), id: item_id, tombstone_id }
}

async function find_tombstone( root, tombstone_id ) {
    const trash_root = confined_path( root, `.trash` )
    let deleted_instants

    try {
        deleted_instants = await fs.readdir( trash_root, { withFileTypes: true } )
    } catch ( error ) {
        if( error.code === `ENOENT` ) return null
        throw error
    }

    for( const instant of deleted_instants ) {
        if( !instant.isDirectory() ) continue

        const candidate = confined_path( trash_root, instant.name, tombstone_id )

        try {
            const tombstone = JSON.parse( await fs.readFile(
                confined_path( candidate, `tombstone.json` ),
                `utf8`,
            ) )

            if( tombstone.tombstone_id === tombstone_id ) return { candidate, tombstone }
        } catch ( error ) {
            if( error.code !== `ENOENT` ) throw error
        }
    }

    return null
}

/**
 * Restore one owner-scoped tombstone without ever purging recoverable content.
 *
 * @param {object} runtime
 * @param {object} user
 * @param {string} tombstone_id
 * @returns {Promise<object>}
 */
export async function restore_item( runtime, user, tombstone_id ) {
    const root = user_root( runtime.config.diary_data_path, user.id, user.email )
    const found = await find_tombstone( root, tombstone_id )

    if( !found || found.tombstone.item?.id === undefined ) {
        const error = new Error( `Trashed entry was not found` )

        error.status_code = 404
        error.code = `tombstone_not_found`
        throw error
    }

    const { item } = found.tombstone
    const local_date = found.tombstone.day
    const paths = day_paths( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date,
        user_id: user.id,
    } )
    const relative_files = [
        item.path,
        item.transcript?.machine_path,
        item.transcript?.display_path,
    ].filter( Boolean )

    for( const relative_file of relative_files ) {
        const source = confined_path( found.candidate, relative_file )
        const target = confined_path( paths.absolute, relative_file )

        try {
            await fs.access( target )

            const error = new Error( `Restore target already exists` )

            error.status_code = 409
            error.code = `restore_conflict`
            throw error
        } catch ( error ) {
            if( error.code !== `ENOENT` ) throw error
        }

        await fs.access( source )
    }

    for( const relative_file of relative_files ) {
        const source = confined_path( found.candidate, relative_file )
        const target = confined_path( paths.absolute, relative_file )

        await fs.mkdir( path.dirname( target ), { recursive: true } )
        await fs.rename( source, target )
    }

    await update_day( {
        diary_root: runtime.config.diary_data_path,
        email: user.email,
        local_date,
        user_id: user.id,
    }, metadata => {
        if( !metadata.items.some( candidate => candidate.id === item.id ) ) metadata.items.push( item )
        metadata.items.sort( ( left, right ) => left.capture.utc.localeCompare( right.capture.utc ) )
        metadata.tombstones = ( metadata.tombstones ?? [] )
            .filter( candidate => candidate.tombstone_id !== tombstone_id )

        return metadata
    } )
    project_item( runtime, user, local_date, item )
    await fs.rm( found.candidate, { recursive: true } )

    return item
}
