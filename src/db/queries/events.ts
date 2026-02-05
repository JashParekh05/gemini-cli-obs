import type Database from 'better-sqlite3';

export interface EventRow {
  id: string;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  model: string | null;
  prompt_chars: number | null;
  response_chars: number | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata_json: string;
  recorded_at: string;
}

export function makeEventQueries(db: Database.Database) {
  const insertStmt = db.prepare<
    [string, string, string, string | null, string | null, number | null, number | null, number | null, string | null, string, string]
  >(`
    INSERT INTO events
      (id, session_id, event_type, tool_name, model,
       prompt_chars, response_chars, duration_ms,
       error_message, metadata_json, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bySessionStmt = db.prepare<[string], EventRow>(`
    SELECT * FROM events WHERE session_id = ? ORDER BY recorded_at ASC
  `);

  const toolDurationsStmt = db.prepare<[string], { tool_name: string; duration_ms: number }>(`
    SELECT tool_name, duration_ms
    FROM events
    WHERE session_id = ?
      AND event_type = 'TOOL_END'
      AND tool_name IS NOT NULL
      AND duration_ms IS NOT NULL
    ORDER BY recorded_at ASC
  `);

  const allToolDurationsStmt = db.prepare<[], { tool_name: string; duration_ms: number; error: number }>(`
    SELECT
      e.tool_name,
      e.duration_ms,
      CASE WHEN e.error_message IS NOT NULL THEN 1 ELSE 0 END AS error
    FROM events e
    WHERE e.event_type = 'TOOL_END'
      AND e.tool_name IS NOT NULL
      AND e.duration_ms IS NOT NULL
  `);

  const llmCharsStmt = db.prepare<[string], { prompt_chars: number | null; response_chars: number | null; model: string | null }>(`
    SELECT prompt_chars, response_chars, model
    FROM events
    WHERE session_id = ?
      AND event_type IN ('LLM_REQUEST', 'LLM_RESPONSE')
  `);

  const countByTypeStmt = db.prepare<[string, string], { count: number }>(`
    SELECT COUNT(*) AS count FROM events
    WHERE session_id = ? AND event_type = ?
  `);

  const errorCountStmt = db.prepare<[string], { count: number }>(`
    SELECT COUNT(*) AS count FROM events
    WHERE session_id = ? AND event_type = 'ERROR'
  `);

  const uniqueToolsStmt = db.prepare<[string], { tool_name: string }>(`
    SELECT DISTINCT tool_name FROM events
    WHERE session_id = ? AND tool_name IS NOT NULL
  `);

  const allSessionDurationsStmt = db.prepare<[], { session_id: string; duration_ms: number }>(`
    SELECT session_id, SUM(duration_ms) AS duration_ms
    FROM events
    WHERE event_type = 'TOOL_END' AND duration_ms IS NOT NULL
    GROUP BY session_id
  `);

  // Daily LLM chars for cost estimation
  const dailyLlmCharsStmt = db.prepare<[string], { prompt_chars: number; response_chars: number }>(`
    SELECT COALESCE(SUM(prompt_chars), 0)   AS prompt_chars,
           COALESCE(SUM(response_chars), 0) AS response_chars
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE date(s.started_at) = date(?)
      AND e.event_type IN ('LLM_REQUEST', 'LLM_RESPONSE')
  `);

  return {
    insert(params: {
      id: string;
      sessionId: string;
      eventType: string;
      toolName?: string | undefined;
      model?: string | undefined;
      promptChars?: number | undefined;
      responseChars?: number | undefined;
      durationMs?: number | undefined;
      errorMessage?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
      recordedAt: string;
    }): void {
      insertStmt.run(
        params.id,
        params.sessionId,
        params.eventType,
        params.toolName ?? null,
        params.model ?? null,
        params.promptChars ?? null,
        params.responseChars ?? null,
        params.durationMs ?? null,
        params.errorMessage ?? null,
        JSON.stringify(params.metadata ?? {}),
        params.recordedAt,
      );
    },

    bySession(sessionId: string): EventRow[] {
      return bySessionStmt.all(sessionId);
    },

    toolDurations(sessionId: string): Array<{ tool_name: string; duration_ms: number }> {
      return toolDurationsStmt.all(sessionId);
    },

    allToolDurations(): Array<{ tool_name: string; duration_ms: number; error: number }> {
      return allToolDurationsStmt.all();
    },

    llmChars(sessionId: string): Array<{ prompt_chars: number | null; response_chars: number | null; model: string | null }> {
      return llmCharsStmt.all(sessionId);
    },

    countByType(sessionId: string, eventType: string): number {
      return countByTypeStmt.get(sessionId, eventType)?.count ?? 0;
    },

    errorCount(sessionId: string): number {
      return errorCountStmt.get(sessionId)?.count ?? 0;
    },

    uniqueTools(sessionId: string): string[] {
      return uniqueToolsStmt.all(sessionId).map((r) => r.tool_name);
    },

    allSessionDurations(): Array<{ session_id: string; duration_ms: number }> {
      return allSessionDurationsStmt.all();
    },

    dailyLlmChars(date: string): { promptChars: number; responseChars: number } {
      const row = dailyLlmCharsStmt.get(date);
      return {
        promptChars: row?.prompt_chars ?? 0,
        responseChars: row?.response_chars ?? 0,
      };
    },
  };
}
