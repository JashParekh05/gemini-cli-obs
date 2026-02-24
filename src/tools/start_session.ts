import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { generateSessionId, generateEventId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

export const StartSessionInputSchema = z.object({
  label: z
    .string()
    .max(200)
    .optional()
    .describe('Short human-readable label for this session, e.g. "refactor-auth-module"'),
  model: z
    .string()
    .optional()
    .describe('Primary Gemini model in use, e.g. "gemini-2.5-pro"'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Optional key-value context, e.g. { cwd: "/src", branch: "feat/auth" }'),
});

export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;

export function handleStartSession(input: StartSessionInput, db: DatabaseClient): string {
  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.sessions.insert({
      id: sessionId,
      ...(input.label !== undefined && { label: input.label }),
      ...(input.model !== undefined && { model: input.model }),
      startedAt: now,
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    });

    db.events.insert({
      id: generateEventId(),
      sessionId,
      eventType: 'SESSION_START',
      ...(input.model !== undefined && { model: input.model }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      recordedAt: now,
    });
  });

  logger.info('Session started', { sessionId, label: input.label });

  return [
    `Session started.`,
    `  ID:    ${sessionId}`,
    `  Label: ${input.label ?? '(none)'}`,
    `  Model: ${input.model ?? '(unknown)'}`,
    ``,
    `Use this session ID in all subsequent record_event calls.`,
  ].join('\n');
}
