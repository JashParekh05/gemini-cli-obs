import type { PercentileStats, ToolLatencyStats } from '../types/metrics.js';

/**
 * Computes percentile statistics from a sorted array of durations.
 * Uses the nearest-rank method — no interpolation, fully deterministic.
 */
export function computePercentiles(durationsMs: number[]): PercentileStats | null {
  if (durationsMs.length === 0) return null;

  const sorted = [...durationsMs].sort((a, b) => a - b);
  const n = sorted.length;

  function percentile(p: number): number {
    if (n === 1) return sorted[0] as number;
    const rank = Math.ceil((p / 100) * n) - 1;
    const clamped = Math.max(0, Math.min(n - 1, rank));
    return sorted[clamped] as number;
  }

  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    p50Ms: percentile(50),
    p75Ms: percentile(75),
    p95Ms: percentile(95),
    p99Ms: percentile(99),
    minMs: sorted[0] as number,
    maxMs: sorted[n - 1] as number,
    meanMs: Math.round(sum / n),
    sampleCount: n,
  };
}

/**
 * Groups raw tool-end events by tool name and computes per-tool latency stats.
 */
export function computeToolLatencyStats(
  rows: Array<{ tool_name: string; duration_ms: number; error: number }>,
): ToolLatencyStats[] {
  const grouped = new Map<string, { durations: number[]; errors: number }>();

  for (const row of rows) {
    const bucket = grouped.get(row.tool_name) ?? { durations: [], errors: 0 };
    bucket.durations.push(row.duration_ms);
    if (row.error) bucket.errors += 1;
    grouped.set(row.tool_name, bucket);
  }

  const results: ToolLatencyStats[] = [];

  for (const [toolName, { durations, errors }] of grouped.entries()) {
    const stats = computePercentiles(durations);
    if (!stats) continue;

    results.push({
      toolName,
      stats,
      errorRate: durations.length > 0 ? errors / durations.length : 0,
      callCount: durations.length,
    });
  }

  // Sort by call count desc for readability
  return results.sort((a, b) => b.callCount - a.callCount);
}

/**
 * Computes the regression delta between two P95 values.
 * Returns percentage change: positive = regression, negative = improvement.
 */
export function p95DeltaPct(baseline: number, compare: number): number {
  if (baseline === 0) return 0;
  return ((compare - baseline) / baseline) * 100;
}
