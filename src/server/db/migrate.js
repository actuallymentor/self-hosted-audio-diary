const migrations = [
    {
        version: 1,
        sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bootstrap_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        claimed_at INTEGER
      );
      INSERT OR IGNORE INTO bootstrap_state (singleton, claimed_at) VALUES (1, NULL);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('provisioning', 'active', 'recovery_pending')),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS sessions_user_expiry ON sessions(user_id, expires_at);

      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_recovery (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        bucket TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        window_started_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS days (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        metadata_path TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, local_date)
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('audio', 'image', 'video', 'text')),
        relative_path TEXT NOT NULL,
        display_text TEXT,
        mime TEXT,
        sha256 TEXT,
        byte_size INTEGER,
        captured_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER,
        UNIQUE(user_id, id)
      );
      CREATE INDEX IF NOT EXISTS items_day_capture ON items(day_id, captured_at);

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        value TEXT NOT NULL,
        UNIQUE(user_id, value)
      );

      CREATE TABLE IF NOT EXISTS day_tags (
        day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(day_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date TEXT NOT NULL,
        item_type TEXT NOT NULL,
        mime TEXT NOT NULL,
        capture_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('receiving', 'complete', 'failed')),
        item_id TEXT,
        whole_sha256 TEXT,
        total_bytes INTEGER,
        updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, id)
      );

      CREATE TABLE IF NOT EXISTS upload_chunks (
        upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(upload_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS operations (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operation_id TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, operation_id)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        run_after INTEGER NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(type, dedupe_key)
      );
      CREATE INDEX IF NOT EXISTS jobs_available ON jobs(status, run_after, lease_expires_at);

      CREATE TABLE IF NOT EXISTS reflections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        citations_json TEXT NOT NULL,
        model TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_documents (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        UNIQUE(user_id, item_id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        content,
        tags,
        content='search_documents',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2',
        prefix='2 3 4'
      );

      CREATE TRIGGER IF NOT EXISTS search_documents_insert AFTER INSERT ON search_documents BEGIN
        INSERT INTO search_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS search_documents_delete AFTER DELETE ON search_documents BEGIN
        INSERT INTO search_fts(search_fts, rowid, content, tags) VALUES ('delete', old.id, old.content, old.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS search_documents_update AFTER UPDATE ON search_documents BEGIN
        INSERT INTO search_fts(search_fts, rowid, content, tags) VALUES ('delete', old.id, old.content, old.tags);
        INSERT INTO search_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
      END;

      CREATE TABLE IF NOT EXISTS archive_inventory (
        user_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        scanned_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, relative_path)
      );
    `,
    },
]

/**
 * Apply every forward-only database migration transactionally.
 *
 * @param {import('better-sqlite3').Database} database
 */
export function migrate_database( database ) {
    database.exec( `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  ` )

    const applied = new Set(
        database.prepare( `SELECT version FROM schema_migrations` ).all().map( row => row.version ),
    )

    for( const migration of migrations ) {
        if( applied.has( migration.version ) ) continue

        database.transaction( () => {
            database.exec( migration.sql )
            database
                .prepare( `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)` )
                .run( migration.version, Date.now() )
        } )()
    }
}
