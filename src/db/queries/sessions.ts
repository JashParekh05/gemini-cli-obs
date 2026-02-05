import type Database from 'better-sqlite3';

export interface SessionRow {
  id: string;
  label: string | null;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  metadata_json: string;
}

export function makeSessionQueries(db: Database.Database) {
  const insertStmt = db.prepare<[string, string | null, string | null, string, string]>(`
    INSERT INTO sessions (id, label, model, started_at, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getByIdStmt = db.prepare<[string], SessionRow>(`
    SELECT * FROM sessions WHERE id = ?
  `);

  const endSessionStmt = db.prepare<[string, string]>(`
    UPDATE sessions SET ended_at = ? WHERE id = ?
  `);

  const updateModelStmt = db.prepare<[string, string]>(`
    UPDATE sessions SET model = ? WHERE id = ?
  `);

  const listRecentStmt = db.prepare<[number], SessionRow>(`
    SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?
  `);

  const listByStatusStmt = db.prepare<[string, string, string, number], SessionRow>(`
    SELECT * FROM sessions
    WHERE (? = 'active' AND ended_at IS NULL)
       OR (? = 'ended'  AND ended_at IS NOT NULL)
       OR (? = 'all')
    ORDER BY started_at DESC
    LIMIT ?
  `);

  const dailySessionCountStmt = db.prepare<[string], { date: string; count: number }>(`
    SELECT date(started_at) AS date, COUNT(*) AS count
    FROM sessions
    WHERE date(started_at) = date(?)
  `);

  return {
    insert(params: {
      id: string;
      label?: string | undefined;
      model?: string | undefined;
      startedAt: string;
      metadata?: Record<string, unknown> | undefined;
    }): void {
      insertStmt.run(
        params.id,
        params.label ?? null,
        params.model ?? null,
        params.startedAt,
        JSON.stringify(params.metadata ?? {}),
      );
    },

    getById(id: string): SessionRow | undefined {
      return getByIdStmt.get(id);
    },

    end(id: string, endedAt: string): void {
      endSessionStmt.run(endedAt, id);
    },

    updateModel(id: string, model: string): void {
      updateModelStmt.run(model, id);
    },

    listRecent(limit: number): SessionRow[] {
      return listRecentStmt.all(limit);
    },

    listByStatus(status: 'active' | 'ended' | 'all', limit: number): SessionRow[] {
      return listByStatusStmt.all(status, status, status, limit);
    },

    dailyCount(date: string): number {
      return dailySessionCountStmt.get(date)?.count ?? 0;
    },
  };
}
