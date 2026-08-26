function fts_query( value ) {
    return value
        .normalize( `NFKC` )
        .trim()
        .split( /\s+/ )
        .map( term => term.replace( /[^\p{L}\p{N}_-]/gu, `` ) )
        .filter( Boolean )
        .map( term => `"${ term.replaceAll( `"`, `""` ) }"*` )
        .join( ` AND ` )
}

/**
 * Upsert a search document through the trigger-backed FTS projection.
 *
 * @param {object} runtime
 * @param {object} document
 */
export function index_document( runtime, document ) {
    const tags = document.tags ?? runtime.database.prepare( `
        SELECT tags.value
        FROM day_tags
        JOIN days ON days.id = day_tags.day_id
        JOIN tags ON tags.id = day_tags.tag_id
        WHERE days.user_id = ? AND days.local_date = ?
        ORDER BY tags.value
    ` ).all( document.user_id, document.local_date ).map( row => row.value )

    runtime.database.prepare( `
    INSERT INTO search_documents (user_id, item_id, local_date, type, content, tags)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      local_date = excluded.local_date,
      type = excluded.type,
      content = excluded.content,
      tags = excluded.tags
  ` ).run(
        document.user_id,
        document.item_id,
        document.local_date,
        document.type,
        document.content,
        tags.join( ` ` ),
    )
}

/**
 * Search one owner's text, transcripts, and tags with stable deep links.
 *
 * @param {object} runtime
 * @param {string} user_id
 * @param {object} filters
 * @returns {object[]}
 */
export function search( runtime, user_id, filters ) {
    const query = fts_query( filters.query ?? `` )

    if( !query ) return []

    return runtime.database.prepare( `
    SELECT
      search_documents.item_id,
      search_documents.local_date,
      search_documents.type,
      snippet(search_fts, 0, '<mark>', '</mark>', ' … ', 24) AS snippet,
      bm25(search_fts) AS rank
    FROM search_fts
    JOIN search_documents ON search_documents.id = search_fts.rowid
    WHERE search_fts MATCH ?
      AND search_documents.user_id = ?
      AND (? IS NULL OR search_documents.local_date >= ?)
      AND (? IS NULL OR search_documents.local_date <= ?)
      AND (? IS NULL OR search_documents.type = ?)
    ORDER BY rank, search_documents.local_date DESC
    LIMIT 100
  ` ).all(
        query,
        user_id,
        filters.start ?? null,
        filters.start ?? null,
        filters.end ?? null,
        filters.end ?? null,
        filters.type ?? null,
        filters.type ?? null,
    )
}

/**
 * Recreate derived FTS rows from their content projection.
 *
 * @param {object} runtime
 */
export function rebuild_index( runtime ) {
    runtime.database.prepare( `INSERT INTO search_fts(search_fts) VALUES ('rebuild')` ).run()
}
