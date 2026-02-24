import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import type { SessionSummary } from '../types/metrics.js';
import { buildSessionSummary } from '../metrics/aggregator.js';
import { formatUsd } from '../metrics/cost.js';

export const GetSessionMetricsInputSchema = z.object({
  session_id: z.string().describe('Session ID to retrieve metrics for'),
});

export type GetSessionMetricsInput = z.infer<typeof GetSessionMetricsInputSchema>;

export function handleGetSessionMetrics(
  input: GetSessionMetricsInput,
  db: DatabaseClient,
): string {
  const summary = buildSessionSummary(db, input.session_id);
  if (!summary) {
    return `Error: session "${input.session_id}" not found.`;
  }
  return formatSessionSummary(summary);
}

/** Exported so end_session and list_sessions can reuse it */
export function formatSessionSummary(s: SessionSummary): string {
  const lines: string[] = [];

  lines.push(`## Session: ${s.sessionId}`);
  if (s.label) lines.push(`Label: ${s.label}`);
  lines.push(`Started: ${s.startedAt}`);
  lines.push(`Ended:   ${s.endedAt ?? '(active)'}`);
  if (s.durationMs !== null) {
    lines.push(`Duration: ${formatDuration(s.durationMs)}`);
  }
  lines.push('');

  // Cost block
  lines.push('### Cost Estimate');
  lines.push(`  Input tokens:  ~${s.cost.estimatedInputTokens.toLocaleString()}`);
  lines.push(`  Output tokens: ~${s.cost.estimatedOutputTokens.toLocaleString()}`);
  lines.push(`  Total tokens:  ~${s.cost.estimatedTotalTokens.toLocaleString()}`);
  lines.push(`  Input cost:   ${formatUsd(s.cost.inputCostUsd)}`);
  lines.push(`  Output cost:  ${formatUsd(s.cost.outputCostUsd)}`);
  lines.push(`  Total cost:   ${formatUsd(s.cost.totalCostUsd)}`);
  if (s.cost.modelUsed) lines.push(`  Model: ${s.cost.modelUsed}`);
  lines.push('');

  // Activity block
  lines.push('### Activity');
  lines.push(`  LLM requests:  ${s.llmRequestCount}`);
  lines.push(`  Tool calls:    ${s.toolCallCount}`);
  lines.push(`  Errors:        ${s.errorCount}`);
  if (s.uniqueToolsUsed.length > 0) {
    lines.push(`  Tools used:    ${s.uniqueToolsUsed.join(', ')}`);
  }
  lines.push('');

  // Overall latency
  if (s.overallLatency) {
    const l = s.overallLatency;
    lines.push('### Tool Latency (all tools)');
    lines.push(`  P50:  ${l.p50Ms}ms`);
    lines.push(`  P75:  ${l.p75Ms}ms`);
    lines.push(`  P95:  ${l.p95Ms}ms  ← watch for regressions`);
    lines.push(`  P99:  ${l.p99Ms}ms`);
    lines.push(`  Mean: ${l.meanMs}ms`);
    lines.push(`  Min:  ${l.minMs}ms  |  Max: ${l.maxMs}ms`);
    lines.push(`  Samples: ${l.sampleCount}`);
    lines.push('');
  }

  // Per-tool breakdown
  if (s.toolBreakdown.length > 0) {
    lines.push('### Per-Tool Breakdown');
    lines.push('  Tool                     Calls  P50    P95    Err%');
    lines.push('  ' + '─'.repeat(58));
    for (const t of s.toolBreakdown) {
      const nameCol = t.toolName.padEnd(24);
      const callsCol = String(t.callCount).padStart(5);
      const p50Col = `${t.stats.p50Ms}ms`.padStart(7);
      const p95Col = `${t.stats.p95Ms}ms`.padStart(7);
      const errCol = `${(t.errorRate * 100).toFixed(0)}%`.padStart(5);
      lines.push(`  ${nameCol} ${callsCol} ${p50Col} ${p95Col} ${errCol}`);
    }
  }

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
