import { z } from 'zod';
import type { DatabaseClient } from '../db/client.js';
import { generateEventId } from '../utils/id.js';
import { buildSessionSummary } from '../metrics/aggregator.js';
import { formatSessionSummary } from './get_session_metrics.js';
import { logger } from '../utils/logger.js';

export const EndSessionInputSchema = z.object({
  session_id: z.string().describe('Session ID to close'),
});

export type EndSessionInput = z.infer<typeof EndSessionInputSchema>;

export function handleEndSession(input: EndSessionInput, db: DatabaseClient): string {
  const session = db.sessions.getById(input.session_id);
  if (!session) {
    return `Error: session "${input.session_id}" not found.`;
  }
  if (session.ended_at) {
    return `Session "${input.session_id}" was already ended at ${session.ended_at}.`;
  }

  const now = new Date().toISOString();

  db.transaction(() => {
    db.sessions.end(input.session_id, now);
    db.events.insert({
      id: generateEventId(),
      sessionId: input.session_id,
      eventType: 'SESSION_END',
      recordedAt: now,
    });
  });

  logger.info('Session ended', { sessionId: input.session_id });

  // Return the full session summary inline
  const summary = buildSessionSummary(db, input.session_id);
  if (!summary) return `Session ${input.session_id} ended.`;

  return `Session ended.\n\n${formatSessionSummary(summary)}`;
}
