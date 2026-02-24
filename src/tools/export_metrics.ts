import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { buildSessionSummary } from '../metrics/aggregator.js';

export const ExportMetricsInputSchema = z.object({
  session_ids: z
    .array(z.string())
    .optional()
    .describe('Specific session IDs to export. Omit to export all sessions.'),
  format: z
    .enum(['json', 'csv'])
    .optional()
    .default('json')
    .describe('Output format: json (default) or csv'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Max sessions to include when session_ids is omitted'),
});

export type ExportMetricsInput = z.infer<typeof ExportMetricsInputSchema>;

export function handleExportMetrics(input: ExportMetricsInput, db: DatabaseClient): string {
  let sessionIds: string[];

  if (input.session_ids && input.session_ids.length > 0) {
    sessionIds = input.session_ids;
  } else {
    const rows = db.sessions.listRecent(input.limit);
    sessionIds = rows.map((r) => r.id);
  }

  const summaries = sessionIds
    .map((id) => buildSessionSummary(db, id))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (summaries.length === 0) {
    return 'No sessions found for export.';
  }

  if (input.format === 'csv') {
    return buildCsv(summaries);
  }

  return buildJson(summaries);
}

function buildJson(summaries: NonNullable<ReturnType<typeof buildSessionSummary>>[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    sessionCount: summaries.length,
    sessions: summaries.map((s) => ({
      sessionId: s.sessionId,
      label: s.label,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMs: s.durationMs,
      toolCallCount: s.toolCallCount,
      llmRequestCount: s.llmRequestCount,
      errorCount: s.errorCount,
      uniqueToolsUsed: s.uniqueToolsUsed,
      cost: s.cost,
      overallLatency: s.overallLatency,
      toolBreakdown: s.toolBreakdown,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function buildCsv(summaries: NonNullable<ReturnType<typeof buildSessionSummary>>[]): string {
  const header = [
    'session_id',
    'label',
    'started_at',
    'ended_at',
    'duration_ms',
    'tool_calls',
    'llm_requests',
    'errors',
    'total_tokens_est',
    'total_cost_usd',
    'model',
    'p50_ms',
    'p95_ms',
    'p99_ms',
  ].join(',');

  const rows = summaries.map((s) =>
    [
      s.sessionId,
      csvEscape(s.label ?? ''),
      s.startedAt,
      s.endedAt ?? '',
      s.durationMs ?? '',
      s.toolCallCount,
      s.llmRequestCount,
      s.errorCount,
      s.cost.estimatedTotalTokens,
      s.cost.totalCostUsd,
      csvEscape(s.cost.modelUsed ?? ''),
      s.overallLatency?.p50Ms ?? '',
      s.overallLatency?.p95Ms ?? '',
      s.overallLatency?.p99Ms ?? '',
    ].join(','),
  );

  return [header, ...rows].join('\n');
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
