import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { computeToolLatencyStats, computePercentiles } from '../metrics/latency.js';

export const GetLatencyStatsInputSchema = z.object({
  tool_name: z
    .string()
    .optional()
    .describe('Filter to a specific tool name. Omit for aggregate stats across all tools.'),
  session_id: z
    .string()
    .optional()
    .describe('Scope stats to a single session. Omit for global stats across all sessions.'),
});

export type GetLatencyStatsInput = z.infer<typeof GetLatencyStatsInputSchema>;

export function handleGetLatencyStats(
  input: GetLatencyStatsInput,
  db: DatabaseClient,
): string {
  const lines: string[] = [];

  if (input.session_id) {
    // Session-scoped stats
    const session = db.sessions.getById(input.session_id);
    if (!session) return `Error: session "${input.session_id}" not found.`;

    const durations = db.events.toolDurations(input.session_id);
    const filtered = input.tool_name
      ? durations.filter((r) => r.tool_name === input.tool_name)
      : durations;

    if (filtered.length === 0) {
      return `No TOOL_END events found${input.tool_name ? ` for tool "${input.tool_name}"` : ''} in session ${input.session_id}.`;
    }

    const stats = computePercentiles(filtered.map((r) => r.duration_ms));
    if (!stats) return 'No data.';

    lines.push(`## Latency Stats — Session ${input.session_id}${input.tool_name ? ` / ${input.tool_name}` : ' (all tools)'}`);
    lines.push('');
    appendPercentileBlock(lines, stats);
  } else {
    // Global stats across all sessions
    const allRows = db.events.allToolDurations();
    const filtered = input.tool_name
      ? allRows.filter((r) => r.tool_name === input.tool_name)
      : allRows;

    if (filtered.length === 0) {
      return `No TOOL_END events found${input.tool_name ? ` for tool "${input.tool_name}"` : ''} across any session.`;
    }

    if (input.tool_name) {
      // Single tool global
      const stats = computePercentiles(filtered.map((r) => r.duration_ms));
      if (!stats) return 'No data.';
      lines.push(`## Latency Stats — ${input.tool_name} (all sessions)`);
      lines.push('');
      appendPercentileBlock(lines, stats);
    } else {
      // All tools global breakdown
      lines.push('## Latency Stats — All Tools (global)');
      lines.push('');
      const toolStats = computeToolLatencyStats(filtered);
      lines.push('Tool                     Calls  P50    P95    P99    Err%');
      lines.push('─'.repeat(62));
      for (const t of toolStats) {
        const nameCol = t.toolName.padEnd(24);
        const callsCol = String(t.callCount).padStart(5);
        const p50Col = `${t.stats.p50Ms}ms`.padStart(7);
        const p95Col = `${t.stats.p95Ms}ms`.padStart(7);
        const p99Col = `${t.stats.p99Ms}ms`.padStart(7);
        const errCol = `${(t.errorRate * 100).toFixed(0)}%`.padStart(5);
        lines.push(`${nameCol} ${callsCol} ${p50Col} ${p95Col} ${p99Col} ${errCol}`);
      }
      lines.push('');
      const overallStats = computePercentiles(filtered.map((r) => r.duration_ms));
      if (overallStats) {
        lines.push('### Overall (all tools combined)');
        appendPercentileBlock(lines, overallStats);
      }
    }
  }

  return lines.join('\n');
}

function appendPercentileBlock(
  lines: string[],
  stats: NonNullable<ReturnType<typeof computePercentiles>>,
): void {
  lines.push(`  P50:     ${stats.p50Ms}ms`);
  lines.push(`  P75:     ${stats.p75Ms}ms`);
  lines.push(`  P95:     ${stats.p95Ms}ms`);
  lines.push(`  P99:     ${stats.p99Ms}ms`);
  lines.push(`  Mean:    ${stats.meanMs}ms`);
  lines.push(`  Min:     ${stats.minMs}ms`);
  lines.push(`  Max:     ${stats.maxMs}ms`);
  lines.push(`  Samples: ${stats.sampleCount}`);
}
