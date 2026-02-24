---
name: obs
description: >
  Use this skill to instrument and observe the current agent session.
  Activate when the user asks to: track costs, measure latency, compare sessions,
  detect regressions, set budget limits, export metrics, or analyze tool performance.
  Also activate automatically at the start of any multi-step task to ensure
  full observability coverage.
---

# Gemini CLI Observability Skill

This skill instruments your agent sessions with MLOps-grade observability:
P95/P99 tool latency, token usage, cost-per-session estimates, budget alerts,
and session-to-session regression detection.

## Workflow

### Starting a Session

Call `start_session` at the beginning of every multi-step task:

```
start_session(
  label: "<short description of task>",
  model: "<model you are using, e.g. gemini-2.5-pro>",
  metadata: { cwd: "<current directory>" }
)
```

Save the returned `session_id`. You will need it for every subsequent call.

### Instrumenting Tool Calls

Before invoking ANY Gemini CLI tool, record a TOOL_START event:
```
record_event(session_id: "<id>", event_type: "TOOL_START", tool_name: "<tool>")
```

Immediately after the tool returns, record TOOL_END with wall-clock duration:
```
record_event(
  session_id: "<id>",
  event_type: "TOOL_END",
  tool_name: "<tool>",
  duration_ms: <elapsed milliseconds>,
  response_chars: <character count of tool output>
)
```

If the tool throws an error, record ERROR instead of TOOL_END:
```
record_event(
  session_id: "<id>",
  event_type: "ERROR",
  tool_name: "<tool>",
  error_message: "<error detail>"
)
```

### Instrumenting LLM Calls

When you send a prompt to the model:
```
record_event(
  session_id: "<id>",
  event_type: "LLM_REQUEST",
  model: "<model name>",
  prompt_chars: <character count of prompt>
)
```

When the model responds:
```
record_event(
  session_id: "<id>",
  event_type: "LLM_RESPONSE",
  model: "<model name>",
  response_chars: <character count of response>,
  duration_ms: <time from LLM_REQUEST to now>
)
```

### Ending a Session

When the task is complete, call `end_session`:
```
end_session(session_id: "<id>")
```

This returns the full session summary: cost breakdown, latency percentiles,
error rate, and per-tool stats. Include this in your response to the user.

## Analytics Commands

Use these when the user asks observability questions:

**Current session metrics:**
```
get_session_metrics(session_id: "<id>")
```

**Latency breakdown:**
```
get_latency_stats(session_id: "<id>")           // this session only
get_latency_stats(tool_name: "write_file")       // specific tool, all sessions
get_latency_stats()                              // all tools, all sessions
```

**Compare two sessions (regression detection):**
```
compare_sessions(
  baseline_session_id: "<older session>",
  compare_session_id: "<newer session>"
)
```
Flags regressions automatically: warning at >20%, critical at >50% increase.

**List recent sessions:**
```
list_sessions(limit: 10, status: "ended")
```

**Set cost budget:**
```
set_budget(
  max_per_session_usd: 0.10,
  max_per_day_usd: 1.00,
  alert_threshold_pct: 80
)
```

**Export metrics for offline analysis:**
```
export_metrics(format: "csv", limit: 20)
export_metrics(format: "json", session_ids: ["<id1>", "<id2>"])
```

## Timing Notes

- Record duration_ms as the integer wall-clock milliseconds between TOOL_START
  and TOOL_END. Use `Date.now()` before and after the call.
- For LLM calls, duration_ms is the time from sending the request to receiving
  the first complete response token.
- Omit duration_ms if genuinely unavailable — the server handles nulls gracefully.
