import { z } from 'zod';
import { EventType } from '../types/events.js';
import type { DatabaseClient } from '../db/client.js';
import { generateEventId } from '../utils/id.js';
import { computeCost } from '../metrics/cost.js';
import { formatUsd } from '../metrics/cost.js';
import { logger } from '../utils/logger.js';

export const RecordEventInputSchema = z.object({
  session_id: z.string().describe('Session ID returned by start_session'),
  event_type: z
    .enum([
      'SESSION_START',
      'SESSION_END',
      'TOOL_START',
      'TOOL_END',
      'LLM_REQUEST',
      'LLM_RESPONSE',
      'ERROR',
      'BUDGET_WARNING',
    ])
    .describe('The type of event being recorded'),
  tool_name: z
    .string()
    .optional()
    .describe('Name of the Gemini CLI tool, required for TOOL_START and TOOL_END events'),
  model: z
    .string()
    .optional()
    .describe('Model name for LLM_REQUEST / LLM_RESPONSE events'),
  prompt_chars: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Character count of the prompt sent to the model (LLM_REQUEST)'),
  response_chars: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Character count of the model response or tool output (LLM_RESPONSE or TOOL_END)'),
  duration_ms: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Wall-clock duration in milliseconds (TOOL_END, LLM_RESPONSE)'),
  error_message: z
    .string()
    .optional()
    .describe('Error detail, for ERROR events or failed TOOL_END events'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Additional context passed through verbatim'),
});

export type RecordEventInput = z.infer<typeof RecordEventInputSchema>;

export function handleRecordEvent(input: RecordEventInput, db: DatabaseClient): string {
  const session = db.sessions.getById(input.session_id);
  if (!session) {
    return `Error: session "${input.session_id}" not found. Call start_session first.`;
  }

  const now = new Date().toISOString();

  db.events.insert({
    id: generateEventId(),
    sessionId: input.session_id,
    eventType: input.event_type,
    ...(input.tool_name !== undefined && { toolName: input.tool_name }),
    ...(input.model !== undefined && { model: input.model }),
    ...(input.prompt_chars !== undefined && { promptChars: input.prompt_chars }),
    ...(input.response_chars !== undefined && { responseChars: input.response_chars }),
    ...(input.duration_ms !== undefined && { durationMs: input.duration_ms }),
    ...(input.error_message !== undefined && { errorMessage: input.error_message }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
    recordedAt: now,
  });

  // Update session model if we now know it
  if (input.model && !session.model) {
    db.sessions.updateModel(input.session_id, input.model);
  }

  logger.debug('Event recorded', {
    sessionId: input.session_id,
    eventType: input.event_type,
    toolName: input.tool_name,
  });

  // Check budget after LLM events
  if (
    input.event_type === EventType.LLM_RESPONSE ||
    input.event_type === EventType.TOOL_END
  ) {
    const budgetWarning = checkBudget(input.session_id, db);
    if (budgetWarning) {
      // Record the warning in the log too
      db.events.insert({
        id: generateEventId(),
        sessionId: input.session_id,
        eventType: 'BUDGET_WARNING',
        metadata: { warning: budgetWarning },
        recordedAt: new Date().toISOString(),
      });
      return `Event recorded.\n\n⚠️  BUDGET WARNING: ${budgetWarning}`;
    }
  }

  return `Event recorded: ${input.event_type}${input.tool_name ? ` (${input.tool_name})` : ''}${input.duration_ms !== undefined ? ` in ${input.duration_ms}ms` : ''}.`;
}

function checkBudget(sessionId: string, db: DatabaseClient): string | null {
  const config = db.budget.get();
  if (config.max_per_session_usd <= 0 && config.max_per_day_usd <= 0) return null;

  const llmRows = db.events.llmChars(sessionId);
  const sessionCost = computeCost(llmRows);

  if (
    config.max_per_session_usd > 0 &&
    sessionCost.totalCostUsd >= config.max_per_session_usd * (config.alert_threshold_pct / 100)
  ) {
    return `Session cost ${formatUsd(sessionCost.totalCostUsd)} is at ${Math.round((sessionCost.totalCostUsd / config.max_per_session_usd) * 100)}% of session budget (${formatUsd(config.max_per_session_usd)}).`;
  }

  if (config.max_per_day_usd > 0) {
    const today = new Date().toISOString().slice(0, 10) as string;
    const dailyChars = db.events.dailyLlmChars(today);
    const dailyCost = computeCost([
      { prompt_chars: dailyChars.promptChars, response_chars: null, model: null },
      { prompt_chars: null, response_chars: dailyChars.responseChars, model: null },
    ]);
    if (dailyCost.totalCostUsd >= config.max_per_day_usd * (config.alert_threshold_pct / 100)) {
      return `Daily spend ${formatUsd(dailyCost.totalCostUsd)} is at ${Math.round((dailyCost.totalCostUsd / config.max_per_day_usd) * 100)}% of daily budget (${formatUsd(config.max_per_day_usd)}).`;
    }
  }

  return null;
}
