# gemini-cli-obs

an MCP server for Gemini CLI that tracks tool latency, token usage, and cost per session. built this because i had no visibility into what was actually happening during long agent runs.

```
Session: sess_m9k2_3a7f   Label: refactor-auth-module
Started: 2026-02-23T18:42:11Z   Duration: 2m 14s

Cost Estimate
  Input tokens:  ~8,400
  Output tokens: ~2,100
  Total cost:    $0.001283
  Model: gemini-2.5-pro

Tool Latency (all tools)
  P50:  312ms
  P95:  1,840ms
  P99:  3,210ms
  Samples: 23

Per-Tool Breakdown
  Tool                     Calls  P50    P95    Err%
  ──────────────────────────────────────────────────
  read_file                   11   84ms  201ms    0%
  write_file                   6  412ms  890ms    0%
  run_shell_command             4  1.2s   3.2s    0%
  google_web_search             2  2.1s   2.8s    0%
```

## setup

```bash
git clone https://github.com/JashParekh05/gemini-cli-obs
cd gemini-cli-obs
npm install
npm run build
```

add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "obs": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-cli-obs/build/index.js"],
      "env": {
        "OBS_DB_PATH": "$HOME/.gemini/obs.db"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

copy the skill so Gemini picks it up automatically:

```bash
cp -r .gemini/skills/obs ~/.gemini/skills/obs
```

## tools

| tool | what it does |
|------|-------------|
| `start_session` | starts a new session, returns an id |
| `record_event` | log tool calls, LLM requests, errors |
| `end_session` | close the session and get the full summary |
| `get_session_metrics` | cost + latency breakdown for a session |
| `get_latency_stats` | P50/P95/P99 for a specific tool or globally |
| `compare_sessions` | diff two sessions, flags regressions |
| `list_sessions` | recent sessions with cost and duration |
| `set_budget` | set a per-session cost limit |
| `export_metrics` | export to JSON or CSV |

## how it works

Gemini calls `start_session` at the start of a task, `record_event` before and after each tool call, and `end_session` when done. everything gets written to SQLite at `~/.gemini/obs.db`. token counts are estimated at ~4 chars/token. `compare_sessions` flags anything over a 20% increase in cost or latency as a warning and 50% as critical.

## config

```bash
OBS_DB_PATH=~/.gemini/obs.db
LOG_LEVEL=warn                # debug | info | warn | error
PRICE_INPUT_PER_1M=0.075
PRICE_OUTPUT_PER_1M=0.30
```

## stack

TypeScript · better-sqlite3 · @modelcontextprotocol/sdk · zod · Node 20+

## license

Apache 2.0
