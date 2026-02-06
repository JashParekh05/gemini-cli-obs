import type { DatabaseClient } from '../db/client.js';
import type { SessionSummary, SessionComparison, RegressionFlag } from '../types/metrics.js';
import { computePercentiles, computeToolLatencyStats, p95DeltaPct } from './latency.js';
import { computeCost } from './cost.js';

/**
 * Builds a full SessionSummary by querying events for a given session.
 * Returns null if the session does not exist.
 */
export function buildSessionSummary(
  db: DatabaseClient,
  sessionId: string,
): SessionSummary | null {
  const session = db.sessions.getById(sessionId);
  if (!session) return null;

  const llmRows = db.events.llmChars(sessionId);
  const toolDurations = db.events.toolDurations(sessionId);
  const errorCount = db.events.errorCount(sessionId);
  const uniqueTools = db.events.uniqueTools(sessionId);

  const toolCallCount = db.events.countByType(sessionId, 'TOOL_END');
  const llmRequestCount = db.events.countByType(sessionId, 'LLM_REQUEST');

  const cost = computeCost(llmRows);

  // Overall latency across all tool calls
  const allDurations = toolDurations.map((r) => r.duration_ms);
  const overallLatency = computePercentiles(allDurations);

  // Per-tool breakdown — annotate with error flag
  const allToolRows = toolDurations.map((r) => ({
    tool_name: r.tool_name,
    duration_ms: r.duration_ms,
    error: 0 as number, // session-specific durations don't carry error flag
  }));
  const toolBreakdown = computeToolLatencyStats(allToolRows);

  const durationMs =
    session.started_at && session.ended_at
      ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
      : null;

  return {
    sessionId: session.id,
    label: session.label,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    durationMs,
    toolCallCount,
    llmRequestCount,
    errorCount,
    uniqueToolsUsed: uniqueTools,
    cost,
    overallLatency,
    toolBreakdown,
  };
}

/**
 * Compares two sessions and flags regressions in cost, latency, and duration.
 */
export function compareSessionSummaries(
  baseline: SessionSummary,
  compare: SessionSummary,
): SessionComparison {
  const costDelta = compare.cost.totalCostUsd - baseline.cost.totalCostUsd;
  const costDeltaPct =
    baseline.cost.totalCostUsd > 0
      ? (costDelta / baseline.cost.totalCostUsd) * 100
      : 0;

  const durationDelta =
    baseline.durationMs !== null && compare.durationMs !== null
      ? compare.durationMs - baseline.durationMs
      : null;

  const durationDeltaPct =
    durationDelta !== null && baseline.durationMs !== null && baseline.durationMs > 0
      ? (durationDelta / baseline.durationMs) * 100
      : null;

  const baseP95 = baseline.overallLatency?.p95Ms ?? null;
  const cmpP95 = compare.overallLatency?.p95Ms ?? null;
  const p95Delta = baseP95 !== null && cmpP95 !== null ? cmpP95 - baseP95 : null;
  const p95DeltaPctVal =
    p95Delta !== null && baseP95 !== null ? p95DeltaPct(baseP95, cmpP95 as number) : null;

  const regressions: RegressionFlag[] = [];

  function maybeFlag(
    metric: string,
    baseVal: number,
    cmpVal: number,
    deltaPct: number,
  ): void {
    if (deltaPct > 50) {
      regressions.push({ metric, baselineValue: baseVal, compareValue: cmpVal, deltaPct, severity: 'critical' });
    } else if (deltaPct > 20) {
      regressions.push({ metric, baselineValue: baseVal, compareValue: cmpVal, deltaPct, severity: 'warning' });
    }
  }

  if (costDeltaPct > 0) {
    maybeFlag('cost_usd', baseline.cost.totalCostUsd, compare.cost.totalCostUsd, costDeltaPct);
  }
  if (durationDeltaPct !== null && durationDeltaPct > 0 && baseline.durationMs) {
    maybeFlag('session_duration_ms', baseline.durationMs, compare.durationMs ?? 0, durationDeltaPct);
  }
  if (p95DeltaPctVal !== null && p95DeltaPctVal > 0 && baseP95 !== null && cmpP95 !== null) {
    maybeFlag('p95_tool_latency_ms', baseP95, cmpP95, p95DeltaPctVal);
  }

  return {
    baselineSessionId: baseline.sessionId,
    compareSessionId: compare.sessionId,
    baselineLabel: baseline.label,
    compareLabel: compare.label,
    costDeltaUsd: roundUsd(costDelta),
    costDeltaPct: Math.round(costDeltaPct * 10) / 10,
    durationDeltaMs: durationDelta,
    durationDeltaPct: durationDeltaPct !== null ? Math.round(durationDeltaPct * 10) / 10 : null,
    toolCallDelta: compare.toolCallCount - baseline.toolCallCount,
    p95LatencyDeltaMs: p95Delta,
    p95LatencyDeltaPct: p95DeltaPctVal !== null ? Math.round(p95DeltaPctVal * 10) / 10 : null,
    regressions,
  };
}

function roundUsd(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}
