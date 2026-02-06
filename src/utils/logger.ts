/**
 * Structured stderr logger.
 *
 * CRITICAL: This module MUST only write to process.stderr.
 * Writing to process.stdout corrupts the MCP JSON-RPC framing.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env;
  }
  return 'info';
}

const configuredLevel = LEVELS[getConfiguredLevel()];

function log(level: LogLevel, message: string, context?: unknown): void {
  if (LEVELS[level] < configuredLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context !== undefined ? { ctx: context } : {}),
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg: string, ctx?: unknown) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: unknown) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: unknown) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: unknown) => log('error', msg, ctx),
};
