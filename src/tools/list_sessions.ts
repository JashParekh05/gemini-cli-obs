import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { buildSessionSummary } from '../metrics/aggregator.js';
import { formatUsd } from '../metrics/cost.js';
import { formatSessionSummary } from './get_session_metrics.js';

export const ListSessionsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Number of sessions to return, most recent first'),
  status: z
    .enum(['active', 'ended', 'all'])
    .optional()
    .default('all')
    .describe('Filter by session status'),
  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include full metrics for each session. False returns a compact summary table.'),
});

export type ListSessionsInput = z.infer<typeof ListSessionsInputSchema>;

export function handleListSessions(input: ListSessionsInput, db: DatabaseClient): string {
  const rows = db.sessions.listByStatus(input.status, input.limit);

  if (rows.length === 0) {
    return `No sessions found (filter: ${input.status}).`;
  }

  if (input.verbose) {
    const parts: string[] = [];
    for (const row of rows) {
      const summary = buildSessionSummary(db, row.id);
      if (summary) {
        parts.push(formatSessionSummary(summary));
        parts.push('─'.repeat(64));
      }
    }
    return parts.join('\n');
  }

  // Compact table
  const lines: string[] = [];
  lines.push('## Recent Sessions');
  lines.push('');
  lines.push('ID                         Label                  Cost      Duration   Tools');
  lines.push('─'.repeat(80));

  for (const row of rows) {
    const summary = buildSessionSummary(db, row.id);
    const idCol = row.id.slice(0, 26).padEnd(27);
    const labelCol = (row.label ?? '').slice(0, 22).padEnd(23);
    const costCol = summary ? formatUsd(summary.cost.totalCostUsd).padStart(9) : '        ?';
    const durCol = summary?.durationMs != null
      ? formatCompactMs(summary.durationMs).padStart(10)
      : (row.ended_at ? '       ?' : '   active');
    const toolsCol = summary?.toolCallCount != null ? String(summary.toolCallCount) : '?';
    lines.push(`${idCol} ${labelCol} ${costCol} ${durCol} ${toolsCol}`);
  }

  return lines.join('\n');
}

function formatCompactMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}
