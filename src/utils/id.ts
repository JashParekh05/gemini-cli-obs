import { randomBytes } from 'crypto';

/** Generates a session ID: sess_{timestamp}_{8 random hex chars} */
export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex');
  return `sess_${ts}_${rand}`;
}

/** Generates an event ID: evt_{timestamp}_{8 random hex chars} */
export function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex');
  return `evt_${ts}_${rand}`;
}
