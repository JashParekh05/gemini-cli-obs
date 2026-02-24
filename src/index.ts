#!/usr/bin/env node
/**
 * gemini-cli-obs — MLOps Observability MCP Server for Gemini CLI
 *
 * Exposes 8 MCP tools that let Gemini CLI report its own tool-call
 * latencies, LLM token usage, and costs — then surface P95 regressions,
 * session comparisons, and budget alerts back through the same interface.
 *
 * CRITICAL: This file must NEVER write to process.stdout.
 * All logging goes to process.stderr via src/utils/logger.ts.
 * stdout is exclusively owned by the MCP JSON-RPC framing layer.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { homedir } from 'os';
import { resolve } from 'path';

import { DatabaseClient } from './db/client.js';
import { logger } from './utils/logger.js';

import { StartSessionInputSchema, handleStartSession } from './tools/start_session.js';
import { RecordEventInputSchema, handleRecordEvent } from './tools/record_event.js';
import { EndSessionInputSchema, handleEndSession } from './tools/end_session.js';
import { GetSessionMetricsInputSchema, handleGetSessionMetrics } from './tools/get_session_metrics.js';
import { GetLatencyStatsInputSchema, handleGetLatencyStats } from './tools/get_latency_stats.js';
import { CompareSessionsInputSchema, handleCompareSessions } from './tools/compare_sessions.js';
import { ListSessionsInputSchema, handleListSessions } from './tools/list_sessions.js';
import { SetBudgetInputSchema, handleSetBudget } from './tools/set_budget.js';
import { ExportMetricsInputSchema, handleExportMetrics } from './tools/export_metrics.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const dbPath = resolve(
  (process.env['OBS_DB_PATH'] ?? '~/.gemini/obs.db').replace(/^~/, homedir()),
);

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new DatabaseClient(dbPath);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer(
  {
    name: 'gemini-cli-obs',
    version: '1.0.0',
  },
  {
    capabilities: { logging: {} },
  },
);

// ─── Tool registrations ───────────────────────────────────────────────────────

server.registerTool(
  'start_session',
  {
    title: 'Start Observability Session',
    description:
      'Call this at the beginning of every agent task to open a new observability session. ' +
      'Returns a session_id that must be passed to all subsequent record_event calls.',
    inputSchema: StartSessionInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  (input) => wrapHandler('start_session', () => handleStartSession(input, db)),
);

server.registerTool(
  'record_event',
  {
    title: 'Record Observability Event',
    description:
      'Record a TOOL_START, TOOL_END, LLM_REQUEST, LLM_RESPONSE, or ERROR event. ' +
      'Call with event_type=TOOL_START immediately before invoking any Gemini CLI tool, ' +
      'and with event_type=TOOL_END (plus duration_ms and response_chars) immediately after. ' +
      'For LLM calls, record LLM_REQUEST with prompt_chars and LLM_RESPONSE with response_chars + duration_ms.',
    inputSchema: RecordEventInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  (input) => wrapHandler('record_event', () => handleRecordEvent(input, db)),
);

server.registerTool(
  'end_session',
  {
    title: 'End Observability Session',
    description:
      'Close an active session and return its full metrics summary: cost breakdown, ' +
      'tool-call latency percentiles (P50/P95/P99), and per-tool breakdown.',
    inputSchema: EndSessionInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  (input) => wrapHandler('end_session', () => handleEndSession(input, db)),
);

server.registerTool(
  'get_session_metrics',
  {
    title: 'Get Session Metrics',
    description:
      'Retrieve full metrics for any session: cost estimate (input/output tokens + USD), ' +
      'latency percentiles (P50/P75/P95/P99), error rate, and per-tool breakdown.',
    inputSchema: GetSessionMetricsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  (input) => wrapHandler('get_session_metrics', () => handleGetSessionMetrics(input, db)),
);

server.registerTool(
  'get_latency_stats',
  {
    title: 'Get Latency Statistics',
    description:
      'Compute P50/P75/P95/P99 latency for tool calls. Scope to a specific tool name ' +
      'and/or session, or get global aggregate stats across all sessions. ' +
      'Use this to detect latency regressions between agent runs.',
    inputSchema: GetLatencyStatsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  (input) => wrapHandler('get_latency_stats', () => handleGetLatencyStats(input, db)),
);

server.registerTool(
  'compare_sessions',
  {
    title: 'Compare Two Sessions',
    description:
      'Compare a baseline session against a newer session. Returns cost delta, ' +
      'duration delta, P95 latency delta, and automatically flags regressions ' +
      '(warning >20%, critical >50%). Essential for detecting prompt or model changes that degrade performance.',
    inputSchema: CompareSessionsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  (input) => wrapHandler('compare_sessions', () => handleCompareSessions(input, db)),
);

server.registerTool(
  'list_sessions',
  {
    title: 'List Sessions',
    description:
      'List recent observability sessions with cost, duration, and tool-call count. ' +
      'Filter by active/ended status. Use verbose=true for full per-session metrics.',
    inputSchema: ListSessionsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  (input) => wrapHandler('list_sessions', () => handleListSessions(input, db)),
);

server.registerTool(
  'set_budget',
  {
    title: 'Set Budget Limits',
    description:
      'Configure per-session and/or per-day cost budgets (in USD). ' +
      'Once set, record_event responses will include a BUDGET_WARNING when costs ' +
      'approach the configured threshold.',
    inputSchema: SetBudgetInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  (input) => wrapHandler('set_budget', () => handleSetBudget(input, db)),
);

server.registerTool(
  'export_metrics',
  {
    title: 'Export Metrics',
    description:
      'Export session metrics as JSON or CSV. Includes cost breakdown, latency percentiles, ' +
      'and tool-call counts per session. Useful for offline analysis or sharing with a team.',
    inputSchema: ExportMetricsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  (input) => wrapHandler('export_metrics', () => handleExportMetrics(input, db)),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrapHandler(
  toolName: string,
  fn: () => string,
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    const text = fn();
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Tool ${toolName} failed`, { error: message });
    return {
      content: [{ type: 'text', text: `Error in ${toolName}: ${message}` }],
      isError: true,
    };
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('gemini-cli-obs MCP server started', { dbPath });
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
