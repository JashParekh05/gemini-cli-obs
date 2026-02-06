import type { CostBreakdown } from '../types/metrics.js';

/**
 * Gemini pricing tiers (USD per 1M tokens, as of early 2026).
 * Configurable via environment variables.
 *
 * Default to gemini-2.5-pro pricing.
 * Flash pricing is ~50% of pro.
 */
export interface PricingTier {
  inputPer1M: number;
  outputPer1M: number;
}

function envFloat(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
}

export const PRICING: Record<string, PricingTier> = {
  'gemini-2.5-pro': {
    inputPer1M:  envFloat('PRICE_INPUT_PER_1M', 0.075),
    outputPer1M: envFloat('PRICE_OUTPUT_PER_1M', 0.30),
  },
  'gemini-2.5-flash': {
    inputPer1M:  envFloat('PRICE_FLASH_INPUT_PER_1M', 0.0375),
    outputPer1M: envFloat('PRICE_FLASH_OUTPUT_PER_1M', 0.15),
  },
};

const DEFAULT_PRICING: PricingTier = PRICING['gemini-2.5-pro'] as PricingTier;

/**
 * Resolves pricing for a model string.
 * Falls back to pro pricing if the model is unknown.
 */
export function pricingFor(model: string | null): PricingTier {
  if (!model) return DEFAULT_PRICING;
  if (model.includes('flash')) return PRICING['gemini-2.5-flash'] ?? DEFAULT_PRICING;
  return PRICING['gemini-2.5-pro'] ?? DEFAULT_PRICING;
}

/**
 * Rough token estimation from character count.
 * Gemini tokenizer averages ~4 chars/token for English text.
 * This is an approximation — exact counts require API-level instrumentation.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Computes a cost breakdown from raw LLM event data.
 *
 * @param llmRows - rows from events WHERE event_type IN ('LLM_REQUEST','LLM_RESPONSE')
 */
export function computeCost(
  llmRows: Array<{
    prompt_chars: number | null;
    response_chars: number | null;
    model: string | null;
  }>,
): CostBreakdown {
  let totalPromptChars = 0;
  let totalResponseChars = 0;
  let dominantModel: string | null = null;
  let modelCounts = new Map<string, number>();

  for (const row of llmRows) {
    totalPromptChars += row.prompt_chars ?? 0;
    totalResponseChars += row.response_chars ?? 0;
    if (row.model) {
      modelCounts.set(row.model, (modelCounts.get(row.model) ?? 0) + 1);
    }
  }

  // Pick the most-used model for pricing
  let maxCount = 0;
  for (const [model, count] of modelCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantModel = model;
    }
  }

  const pricing = pricingFor(dominantModel);
  const inputTokens = estimateTokens(totalPromptChars);
  const outputTokens = estimateTokens(totalResponseChars);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return {
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedTotalTokens: inputTokens + outputTokens,
    inputCostUsd: roundUsd(inputCost),
    outputCostUsd: roundUsd(outputCost),
    totalCostUsd: roundUsd(inputCost + outputCost),
    modelUsed: dominantModel,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000; // 6 decimal places
}

/**
 * Formats a USD value for display, with appropriate precision.
 */
export function formatUsd(value: number): string {
  if (value < 0.001) return `$${(value * 1000).toFixed(4)}m`; // millicents
  if (value < 0.01)  return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}
