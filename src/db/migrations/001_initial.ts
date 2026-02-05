import type Database from 'better-sqlite3';

export const version = 1;

export function up(db: Database.Database): void {
  db.exec(`
    -- ============================================================
    -- sessions table
    -- Tracks each Gemini CLI agent invocation as a named session.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      label       TEXT,                    -- Optional human-readable name
      model       TEXT,                    -- Primary model used (may be updated)
      started_at  TEXT    NOT NULL,
      ended_at    TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);

    -- ============================================================
    -- events table  (append-only instrument log)
    -- Gemini reports every tool call and LLM request here via
    -- the record_event MCP tool.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS events (
      id              TEXT    PRIMARY KEY,
      session_id      TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_type      TEXT    NOT NULL
                      CHECK (event_type IN (
                        'SESSION_START','SESSION_END',
                        'TOOL_START','TOOL_END',
                        'LLM_REQUEST','LLM_RESPONSE',
                        'ERROR','BUDGET_WARNING'
                      )),
      tool_name       TEXT,
      model           TEXT,
      prompt_chars    INTEGER,
      response_chars  INTEGER,
      duration_ms     INTEGER,
      error_message   TEXT,
      metadata_json   TEXT    NOT NULL DEFAULT '{}',
      recorded_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_id   ON events(session_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_events_event_type   ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_tool_name    ON events(tool_name) WHERE tool_name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_recorded_at  ON events(recorded_at DESC);

    -- ============================================================
    -- budget_config table  (single-row config for alerting)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS budget_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      max_per_session_usd   REAL    NOT NULL DEFAULT 0.0,
      max_per_day_usd       REAL    NOT NULL DEFAULT 0.0,
      alert_threshold_pct   REAL    NOT NULL DEFAULT 80.0,
      updated_at            TEXT    NOT NULL
    );

    -- Insert the singleton row
    INSERT OR IGNORE INTO budget_config
      (id, max_per_session_usd, max_per_day_usd, alert_threshold_pct, updated_at)
    VALUES
      (1, 0.0, 0.0, 80.0, datetime('now'));

    -- ============================================================
    -- schema_migrations  (migration runner state)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT    NOT NULL
    );
  `);
}
