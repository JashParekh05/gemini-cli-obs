/**
 * Computed metric shapes returned by analytics tool handlers.
 * These are never stored in SQLite — always derived on query.
 */

export interface PercentileStats {
  readonly p50Ms: number;
  readonly p75Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly sampleCount: number;
}

export interface ToolLatencyStats {
  readonly toolName: string;
  readonly stats: PercentileStats;
  readonly errorRate: number;         // 0.0–1.0
  readonly callCount: number;
}

export interface CostBreakdown {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedTotalTokens: number;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
  readonly modelUsed: string | null;
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly label: string | null;
  readonly startedAt: string;         // ISO 8601
  readonly endedAt: string | null;    // null if still active
  readonly durationMs: number | null;
  readonly toolCallCount: number;
  readonly llmRequestCount: number;
  readonly errorCount: number;
  readonly uniqueToolsUsed: readonly string[];
  readonly cost: CostBreakdown;
  readonly overallLatency: PercentileStats | null;
  readonly toolBreakdown: readonly ToolLatencyStats[];
}

export interface SessionComparison {
  readonly baselineSessionId: string;
  readonly compareSessionId: string;
  readonly baselineLabel: string | null;
  readonly compareLabel: string | null;
  readonly costDeltaUsd: number;         // positive = compare is more expensive
  readonly costDeltaPct: number;
  readonly durationDeltaMs: number | null;
  readonly durationDeltaPct: number | null;
  readonly toolCallDelta: number;
  readonly p95LatencyDeltaMs: number | null;  // per overall tool calls
  readonly p95LatencyDeltaPct: number | null;
  readonly regressions: readonly RegressionFlag[];
}

export interface RegressionFlag {
  readonly metric: string;
  readonly baselineValue: number;
  readonly compareValue: number;
  readonly deltaPct: number;
  readonly severity: 'warning' | 'critical';  // warning >20%, critical >50%
}

export interface BudgetConfig {
  readonly id: number;
  readonly maxPerSessionUsd: number;  // 0 = disabled
  readonly maxPerDayUsd: number;      // 0 = disabled
  readonly alertThresholdPct: number; // default 80 — alert when N% of budget consumed
  readonly updatedAt: string;
}

export interface DailySpend {
  readonly date: string;   // YYYY-MM-DD
  readonly totalCostUsd: number;
  readonly sessionCount: number;
}
