-- Private D1 database; never include this file or data in static assets.
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, line_sub TEXT NOT NULL UNIQUE, line_name TEXT NOT NULL,
      name TEXT, phone TEXT, consent_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL,
      nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active', level INTEGER NOT NULL DEFAULT 0,
      phase TEXT NOT NULL DEFAULT 'ready', found TEXT NOT NULL DEFAULT '[]',
      elapsed_ms INTEGER NOT NULL DEFAULT 0, current_ms INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0,
      segment_at INTEGER, last_seq INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, completed_at INTEGER, score_ms INTEGER,
      revision_token TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      run_id TEXT NOT NULL REFERENCES runs(id), event_id TEXT NOT NULL,
      seq INTEGER NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL,
      PRIMARY KEY (run_id, event_id), UNIQUE (run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_runs_user_created ON runs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_runs_completed_score ON runs(score_ms, misses, completed_at) WHERE status='complete';
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_oauth_expiry ON oauth_states(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_active ON runs(user_id) WHERE status='active';
