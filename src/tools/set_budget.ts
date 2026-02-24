import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { formatUsd } from '../metrics/cost.js';

export const SetBudgetInputSchema = z.object({
  max_per_session_usd: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum cost per session in USD. Set to 0 to disable. Default: 0 (disabled).'),
  max_per_day_usd: z
    .number()
    .nonnegative()
    .optional()
    .describe('Maximum daily spend in USD. Set to 0 to disable. Default: 0 (disabled).'),
  alert_threshold_pct: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Percentage of budget at which to trigger a warning. Default: 80.'),
});

export type SetBudgetInput = z.infer<typeof SetBudgetInputSchema>;

export function handleSetBudget(input: SetBudgetInput, db: DatabaseClient): string {
  const current = db.budget.get();

  const next = {
    maxPerSessionUsd: input.max_per_session_usd ?? current.max_per_session_usd,
    maxPerDayUsd: input.max_per_day_usd ?? current.max_per_day_usd,
    alertThresholdPct: input.alert_threshold_pct ?? current.alert_threshold_pct,
  };

  db.budget.update(next);

  const lines: string[] = [];
  lines.push('## Budget Updated');
  lines.push('');
  lines.push(
    `  Per-session limit: ${next.maxPerSessionUsd > 0 ? formatUsd(next.maxPerSessionUsd) : 'disabled'}`,
  );
  lines.push(
    `  Daily limit:       ${next.maxPerDayUsd > 0 ? formatUsd(next.maxPerDayUsd) : 'disabled'}`,
  );
  lines.push(`  Alert threshold:   ${next.alertThresholdPct}%`);
  lines.push('');
  lines.push(
    `Warnings will fire via record_event responses when costs reach ${next.alertThresholdPct}% of the configured limit.`,
  );

  return lines.join('\n');
}
