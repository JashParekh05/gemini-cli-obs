import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { buildSessionSummary, compareSessionSummaries } from '../metrics/aggregator.js';
import { formatUsd } from '../metrics/cost.js';
import type { RegressionFlag } from '../types/metrics.js';

export const CompareSessionsInputSchema = z.object({
  baseline_session_id: z
    .string()
    .describe('The reference session (older / known-good baseline)'),
  compare_session_id: z
    .string()
    .describe('The session to compare against the baseline'),
});

export type CompareSessionsInput = z.infer<typeof CompareSessionsInputSchema>;

export function handleCompareSessions(
  input: CompareSessionsInput,
  db: DatabaseClient,
): string {
  const baseline = buildSessionSummary(db, input.baseline_session_id);
  if (!baseline) return `Error: baseline session "${input.baseline_session_id}" not found.`;

  const compare = buildSessionSummary(db, input.compare_session_id);
  if (!compare) return `Error: compare session "${input.compare_session_id}" not found.`;

  const diff = compareSessionSummaries(baseline, compare);
  const lines: string[] = [];

  lines.push('## Session Comparison');
  lines.push('');
  lines.push(`  Baseline: ${diff.baselineSessionId}${diff.baselineLabel ? ` (${diff.baselineLabel})` : ''}`);
  lines.push(`  Compare:  ${diff.compareSessionId}${diff.compareLabel ? ` (${diff.compareLabel})` : ''}`);
  lines.push('');

  // Cost comparison
  lines.push('### Cost');
  lines.push(`  Baseline: ${formatUsd(baseline.cost.totalCostUsd)}`);
  lines.push(`  Compare:  ${formatUsd(compare.cost.totalCostUsd)}`);
  const costSign = diff.costDeltaUsd >= 0 ? '+' : '';
  lines.push(`  Delta:    ${costSign}${formatUsd(diff.costDeltaUsd)} (${costSign}${diff.costDeltaPct.toFixed(1)}%)`);
  lines.push('');

  // Duration comparison
  if (diff.durationDeltaMs !== null) {
    lines.push('### Session Duration');
    lines.push(`  Baseline: ${formatMs(baseline.durationMs)}`);
    lines.push(`  Compare:  ${formatMs(compare.durationMs)}`);
    const dSign = diff.durationDeltaMs >= 0 ? '+' : '';
    lines.push(`  Delta:    ${dSign}${diff.durationDeltaMs}ms (${dSign}${diff.durationDeltaPct?.toFixed(1) ?? '?'}%)`);
    lines.push('');
  }

  // P95 latency comparison
  if (diff.p95LatencyDeltaMs !== null) {
    lines.push('### P95 Tool Latency');
    lines.push(`  Baseline P95: ${baseline.overallLatency?.p95Ms ?? '?'}ms`);
    lines.push(`  Compare  P95: ${compare.overallLatency?.p95Ms ?? '?'}ms`);
    const pSign = diff.p95LatencyDeltaMs >= 0 ? '+' : '';
    lines.push(`  Delta:    ${pSign}${diff.p95LatencyDeltaMs}ms (${pSign}${diff.p95LatencyDeltaPct?.toFixed(1) ?? '?'}%)`);
    lines.push('');
  }

  // Tool call count
  lines.push('### Tool Calls');
  lines.push(`  Baseline: ${baseline.toolCallCount}`);
  lines.push(`  Compare:  ${compare.toolCallCount}`);
  const tcSign = diff.toolCallDelta >= 0 ? '+' : '';
  lines.push(`  Delta:    ${tcSign}${diff.toolCallDelta}`);
  lines.push('');

  // Regressions
  if (diff.regressions.length === 0) {
    lines.push('✓ No regressions detected (all deltas within 20% threshold).');
  } else {
    lines.push('### Regressions');
    for (const r of diff.regressions) {
      lines.push(formatRegression(r));
    }
  }

  return lines.join('\n');
}

function formatRegression(r: RegressionFlag): string {
  const icon = r.severity === 'critical' ? '🔴' : '🟡';
  const sign = r.deltaPct >= 0 ? '+' : '';
  return `  ${icon} ${r.severity.toUpperCase()} — ${r.metric}: ${r.baselineValue.toFixed(2)} → ${r.compareValue.toFixed(2)} (${sign}${r.deltaPct.toFixed(1)}%)`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return '(active)';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
