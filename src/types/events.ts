/**
 * Event types recorded by the Gemini CLI observability skill.
 * These map directly to what SKILL.md instructs Gemini to report.
 */
export const EventType = {
  SESSION_START: 'SESSION_START',
  SESSION_END: 'SESSION_END',
  TOOL_START: 'TOOL_START',
  TOOL_END: 'TOOL_END',
  LLM_REQUEST: 'LLM_REQUEST',
  LLM_RESPONSE: 'LLM_RESPONSE',
  ERROR: 'ERROR',
  BUDGET_WARNING: 'BUDGET_WARNING',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export interface RawEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly eventType: EventType;
  readonly toolName: string | null;   // For TOOL_START/TOOL_END events
  readonly model: string | null;      // For LLM_REQUEST/LLM_RESPONSE events
  readonly promptChars: number | null;   // Characters in the prompt (LLM_REQUEST)
  readonly responseChars: number | null; // Characters in the response (LLM_RESPONSE / TOOL_END)
  readonly durationMs: number | null;    // Caller-supplied wall-clock duration
  readonly errorMessage: string | null;
  readonly metadata: string;          // JSON blob for extra data
  readonly recordedAt: string;        // ISO 8601 — wall clock when record_event was called
}

/** Minimal shape required by the record_event MCP tool */
export interface RecordEventInput {
  sessionId: string;
  eventType: EventType;
  toolName?: string;
  model?: string;
  promptChars?: number;
  responseChars?: number;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}
