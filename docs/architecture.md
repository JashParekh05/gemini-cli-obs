# Architecture

## Overview

`gemini-cli-obs` is a stateless MCP server backed by a single SQLite database.
Gemini CLI is the client — it reports events via tool calls, and queries analytics
via the same mechanism.

```
┌─────────────────────────────────────────────────────┐
│                   Gemini CLI                        │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │  SKILL   │   │  Agent   │   │  Built-in Tools│  │
│  │  obs/    │──▶│  Loop    │──▶│  write_file    │  │
│  │SKILL.md  │   │          │   │  run_shell     │  │
│  └──────────┘   └────┬─────┘   │  web_fetch ... │  │
│                       │         └────────────────┘  │
│                       │ MCP tool calls              │
└───────────────────────┼─────────────────────────────┘
                        │
              JSON-RPC over stdio
                        │
┌───────────────────────▼─────────────────────────────┐
│              gemini-cli-obs (MCP Server)             │
│                                                     │
│  start_session    record_event    end_session        │
│  get_session_metrics              get_latency_stats  │
│  compare_sessions  list_sessions                     │
│  set_budget        export_metrics                    │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │              DatabaseClient                    │ │
│  │  SQLite (WAL mode) @ ~/.gemini/obs.db          │ │
│  │                                                │ │
│  │  sessions     events (append-only)   budget    │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌────────────────┐  ┌───────────────────────────┐  │
│  │ metrics/       │  │ Pricing tiers (USD/1M tok)│  │
│  │  latency.ts    │  │  gemini-2.5-pro:  $0.075i │  │
│  │  cost.ts       │  │                  $0.30o   │  │
│  │  aggregator.ts │  │  gemini-2.5-flash: $0.0375│  │
│  └────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Event Flow

```
User: "refactor the auth module"
         │
         ▼
Gemini activates 'obs' skill (via SKILL.md)
         │
         ▼
start_session(label="refactor-auth", model="gemini-2.5-pro")
         │ returns session_id
         ▼
For each tool call:
  record_event(TOOL_START, tool_name="read_file")
  → [Gemini calls read_file]
  record_event(TOOL_END, tool_name="read_file", duration_ms=84, response_chars=2341)
         │
         ▼
For each LLM request:
  record_event(LLM_REQUEST, prompt_chars=3200)
  → [Gemini sends to model]
  record_event(LLM_RESPONSE, response_chars=800, duration_ms=1240)
         │
         ▼
end_session(session_id) → returns full summary
```

## Metrics Computed

### Latency Percentiles (nearest-rank method)
- P50, P75, P95, P99, min, max, mean
- Per-tool breakdown + aggregate
- Global across all sessions for regression baselining

### Cost Estimation
- Characters → tokens at ~4 chars/token (Gemini average for English)
- USD = tokens × (price/1M)
- Separate input/output token costs
- Model-aware pricing (pro vs flash)

### Regression Detection (compare_sessions)
- Cost delta % → warning >20%, critical >50%
- Duration delta % → same thresholds
- P95 tool latency delta % → same thresholds

## SQLite Design Decisions

| Decision | Rationale |
|----------|-----------|
| WAL mode | Allows concurrent reads during active sessions |
| `events` is append-only | Tamper-evident audit trail (no UPDATEs ever) |
| `budget_config` is a singleton row | Single budget config per deployment |
| Separate `sessions` + `events` tables | Enables per-session and cross-session queries without joins for the hot path |
| better-sqlite3 (sync) | MCP tool handlers are synchronous; no event-loop overhead needed |


Session_ID: sess_mlztkbpy_1a412477

call record_event with session_id "sess_mlztkbpy_1a412477", event_type "TOOL_START", tool_name "write_file"

call record_event with session_id "sess_mlztkbpy_1a412477", event_type "TOOL_END", tool_name "write_file", duration_ms 412, response_chars 800

call record_event with session_id "sess_mlztkbpy_1a412477", event_type "LLM_REQUEST", model "gemini-2.5-pro", prompt_chars 3200

call record_event with session_id "sess_mlztkbpy_1a412477", event_type "LLM_RESPONSE", model "gemini-2.5-pro", response_chars 800, duration_ms 1240

call end_session with session_id "sess_mlztkbpy_1a412477"
