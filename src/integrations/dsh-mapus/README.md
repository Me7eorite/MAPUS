# dsh-mapus

The DeepSeek Harness plugin for MAPUS: it turns the **MAPUS side panel** into a
DSH client, and exposes **the browser capabilities of MAPUS** as DSH tools.

Once installed, the conversation in the side panel is still the same
conversation, but thinking and orchestration move to the Harness agent loop.
Tool execution still happens in the browser (only the extension can drive a
page). What changes is *who thinks*, not what the UI looks like.

```
MAPUS side panel (React) ──port──> background/dsh-core.js
                                    │  POST /v1/turn   (NDJSON event stream)
                                    │  POST /v1/rpc    (tool results back)
                                    ▼
                       dsh-mapus bridge (127.0.0.1:7355, this plugin)
                        ├─ session ctx.agents.create / resume   ← one DSH session per turn
                        ├─ events  ctx.on('session/event')      → projected into panel events
                        ├─ stream  ctx.on('agent/assistant-stream') → per-token deltas
                        └─ tools   mapus_* (agent-scoped)        → executed in the browser
```

## Quick start (three steps)

```bash
# 1. start the bridge (it must already be installed into a profile, see
#    "Install into a profile" below; the current dsh has no --patch)
export DEEPSEEK_API_KEY=sk-...        # whichever model dsh uses, see "Models"
bin/start.sh

# 2. the console prints the url and token
#    [dsh-mapus] ready  http://127.0.0.1:7355  token <token>  (generated, ~/.dsh/mapus-bridge/token)

# 3. MAPUS dashboard → Settings → Agent model:
#    backend = DeepSeek Harness → paste the url and token → Test connection
#    (it answers with the tool count when the bridge is reachable) → Save
```

After that just talk to the Agent panel: the UI, the session and the tool cards
stay the same; what changed is that thinking and orchestration now run in the
dsh agent loop. To go back to the built-in backend, switch *Execution backend*
back — the two configurations do not overwrite each other.

## Reading a past conversation

dsh stores every session as `$DSH_HOME/sessions/<escaped cwd>/<sessionId>/session*.jsonl.zstd`
(a zstd-compressed JSON Lines event stream, more complete than what the panel
keeps: it includes tool calls and end-of-turn reasons). You can read them
without starting dsh:

```bash
bin/sessions.sh                 # list every session
bin/sessions.sh --mapus         # MAPUS-related only
bin/sessions.sh <id prefix>     # print a readable trace
bin/sessions.sh <id> --reasoning  # include the reasoning stream
bin/sessions.sh <id> --json       # raw one-event-per-line JSON
```

The file is a concatenation of zstd frames and node `zstdDecompressSync` only
decodes the first one, so `bin/sessions.mjs` splits on the magic number and
decodes frame by frame (needs node >= 22.15; `sessions.sh` picks a suitable one).

Common `bin/start.sh` flags: `--port 7356` (bridge port), `--ui-port 3090` (the
dsh Web UI port), `--profile headless`, `--reset` (kill the previous run first),
`--open` (open the UI afterwards).

### Models

The bridge ships no model: provider, endpoint and key all live in the dsh
profile (`~/.dsh/profiles/<name>/`). **Which model to use** is decided by the
dashboard → Settings → Agent model → *Provider* / *Model* dropdowns, no profile
editing needed.

The message `model request failed (check the dsh provider and key)` has two very
different causes behind one symptom:

| Real cause | How to confirm | How to fix |
| --- | --- | --- |
| no key in the shell | did startup print `model key loaded from …`? | `bin/start.sh` fills it from `refs:` in `~/.dsh/.credentials.yaml`; you can also `export DEEPSEEK_API_KEY=sk-...` |
| no model selected | log says `prompt variable "{{model}}" has no value` | on the settings page click *Load available models*, pick a provider + model |
| the selected provider is unreachable | log says `Connection error.` / `code: TRANSPORT` | switch provider (some self-hosted gateways are only reachable on certain networks) |

Start the bridge with `DSH_MAPUS_DEBUG=1 bin/start.sh` to see the raw harness
session events — that is the only way to tell these three apart, because the
client always gets the same generic message.

To see which providers and models the current profile actually offers:

```bash
curl -s -H "X-MAPUS-Token: $(cat ~/.dsh/mapus-bridge/token)" \
  http://127.0.0.1:7355/v1/models
```

## Install

Three channels, same package, pick one:

| channel | command |
| --- | --- |
| npm | `dsh plugin --profile web add dsh-mapus` |
| local checkout | `dsh plugin --profile web add /path/to/MAPUS/integrations/dsh-mapus` |
| release zip | unzip `dsh-mapus.zip`, then `dsh plugin --profile web add ./dsh-mapus` |

All three need `pnpm` on PATH (`dsh plugin add` is `pnpm add` underneath); the
copy bundled with dsh lives at
`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm`.

## Install into a profile (persistent, recommended)

Once installed, `dsh --profile web` already carries the bridge, no `--patch`
needed, and `bin/start.sh` detects the installed state and stops stacking an
overlay (two overlays would register the same bridge twice and collide on the
port).

**Option 1: one command** (any row of the table above)

```bash
dsh plugin --profile web add dsh-mapus
```

**Option 2: register by hand** (when `dsh plugin add` will not run, see the
pitfall below)

dsh needs two things: **the package name must resolve inside the profile
`node_modules`**, and **the package must be listed in `dsh.profile.bundles`**
putting it only in `dependencies` does not load it — verified.

```bash
cd ~/.dsh/profiles/web
ln -sfn /path/to/MAPUS/integrations/dsh-mapus node_modules/dsh-mapus
```

```json
// ~/.dsh/profiles/web/package.json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-mapus"]
    }
  },
  "dependencies": {
    "dsh-mapus": "file:/path/to/MAPUS/integrations/dsh-mapus"
  }
}
```

Then run `dsh --profile web`; once the banner says `dsh-mapus ready`, it works.

> **Pitfall**: `dsh plugin add` is `pnpm add` underneath and reinstalls every
> profile dependency. If **any** dependency points at a file that no longer
> exists (a deleted local `.tgz`, for example), pnpm fails the whole run with
> `ENOENT` — nothing to do with this plugin. Use option 2 and leave the broken
> dependency alone.

**Temporary use (leave the profile untouched)**: write an overlay by hand.

```yaml
# /tmp/mapus.yml
- insert:
    - id: mapus-bridge
      name: '/absolute/path/MAPUS/integrations/dsh-mapus/index.js'
      config:
        port: 7355
```

```bash
dsh --profile web --patch /tmp/mapus.yml
```

To change the bridge port temporarily while installed, the overlay must
**override by id**, not insert again:

```yaml
- id: mapus-bridge
  config:
    port: 7356
```

> `--patch` goes after `--profile` and before the app's own flags:
> `dsh --profile web --patch x.yml --no-open --port 7398`.
> Writing `dsh --profile web --no-open --patch x.yml` fails with `unknown option`.

Bare imports inside the plugin (`@deepseek-ai/dsh-tools`) resolve upwards from
the plugin directory. During local development, symlink the profile copy if it is
missing (`bin/start.sh` does this automatically):

```bash
mkdir -p node_modules
ln -sfn ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

A successful start prints:

```
[dsh-mapus] ready  http://127.0.0.1:7355  token <token>  (reused, ~/.dsh/mapus-bridge/token)
[dsh-mapus] provider profile default  model profile default  ·  paste the url and token into MAPUS → Settings → Agent model
```

Put that url and token into **MAPUS dashboard → Settings → Agent model →
Execution backend = DeepSeek Harness**; *Test connection* should answer with the
tool count.

## Configuration

Every key in the patch row's `config` is optional:

| Key | Default | Meaning |
| --- | --- | --- |
| `host` | `127.0.0.1` | loopback only; other addresses need `allowRemote` |
| `port` | `7355` | the bridge HTTP port; `0` lets the system pick one |
| `token` | empty | empty means generate on first start and write `$DSH_HOME/mapus-bridge/token` (0600) |
| `provider` / `model` | empty | empty follows the profile default; otherwise pinned per turn |
| `reasoningEffort` | empty | applied when the adapter supports it |
| `sessionPrefix` | `mapus` | DSH session id prefix, so they are recognisable in the session list |
| `maxSteps` | `40` | only drives the step counter in the side panel |
| `rpcTimeoutMs` | `120000` | timeout for a single browser tool call |
| `allowRemote` | `false` | allow a non-loopback bind (not recommended) |
| `systemPrompt` | empty | appended after the MAPUS persona block |
| `enableTools` | `true` | turn off to use the bridge only, without registering `mapus_*` |
| `enableHostTools` | `true` | mount the native dsh `bash` / `read` / `write` / `glob` / `grep` / `job_*` tools on the agent |
| `approvalPolicy` | `never` | reject sandbox escalation outright (`ask` hangs the turn when no Web UI is attached) |
| `sandboxMode` | `auto` | pin this session to `danger-full-access` when the host has no usable sandbox backend; `inherit` leaves it alone |

## Protocol

Plain HTTP plus NDJSON, no WebSocket: an MV3 service worker is suspended when
idle, so a long-lived connection would need reconnect logic, while one POST per
turn matches how the browser side already thinks.

| Route | Meaning |
| --- | --- |
| `GET /v1/health` | health check, **no token required** (the panel uses it to tell "not running" from "wrong token") |
| `GET /v1/catalog` | the declared tool surface |
| `POST /v1/turn` | one turn; the response body is an NDJSON event stream |
| `POST /v1/rpc` | the browser side sends a tool result back (matched by rpc id) |
| `POST /v1/cancel` | stop a turn |
| `POST /v1/shutdown` | close the bridge (tests and debugging) |

Event order within a turn:

```
hello → start → step → (reasoning) → rpc ⇄ POST /v1/rpc → delta… → done
```

`delta…` really does arrive in small pieces, from **`agent/assistant-stream`**:
dsh publishes streaming increments on a channel that is **process-local, scoped
per agent, and never written to the session log**. Listening only to
`session/event` leaves the panel silent until the model finishes and then dumps
the whole answer as a single `delta` — which looks exactly like "no streaming".
When `assistant/message` settles, only the part **not yet streamed** is filled
in, so the two paths never duplicate; reasoning is never re-sent once streamed,
because dsh sends another `start` before the answer attempt, which zeroes the
counter, and a counter-only check would resend the entire reasoning block.

Tool cards are **not emitted by the bridge**: the extension executes the tool
after receiving the `rpc` and emits its own `tool` / `tool_result`, so the
timings on the cards are real and no card is duplicated.

`done` carries `answer` (the visible text of the turn), `usage` (tokens summed
across steps) and `steps` / `budget` for the panel's step counter.

## Tool surface

### Native dsh tools (preferred)

When an agent is assembled, the plugin registers its own preset with the harness
preset registry (`mapus-host`, `order: 900`) and mounts it on that agent's
scope, so the model directly gets:

| Tool | Purpose |
| --- | --- |
| `bash` / `pwsh` | run commands (macOS/Linux / Windows) |
| `read` / `write` / `edit` / `read_image` | read and write files |
| `glob` / `grep` | find files, search contents |
| `job_list` / `job_output` / `job_kill` | background jobs |

Why the plugin has to register them itself: the `dsh-web-app` bundle **disables**
`tool-bash` / `tool-fs` / `tool-fs-search` / `tool-jobs` on the host plane — in
its own words, "base keeps them for the TUI, the Web surface lets every session
mount its own preset". A new Web UI session mounts `standard`, but the bridge
creates agents directly through `ctx.agents.create()` without going through any
preset, so without this step the model would only have `working_directory` and
could neither touch the disk nor run a command.

The narrowness is deliberate: persona, compaction, plan-mode, subagent and web
are not mounted — they either override UI the panel owns or need an approval UI
this bridge does not have.

**Sandbox**: commands are constrained by the session sandbox mode, defaulting to
the harness `workspace-write` (writes limited to the session cwd). But on macOS
the harness **never pre-checks** its seatbelt backend (`chainVerdict()` returns
the only candidate without probing), so failure only shows up when a command
actually spawns; and since macOS 27, `sandbox-exec` can no longer apply any
profile that contains a `deny` rule:

```
$ /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny file-write*)' -- true
sandbox-exec: sandbox_apply: Operation not permitted   # exit 71
$ /usr/bin/sandbox-exec -p '(version 1)(allow default)' -- true   # this one still works
```

So the plugin probes the kernel once at assembly time (with the same profile
shape) and, when the probe fails, pins **that session** to
`sandbox/mode = danger-full-access` and logs one warning. This only affects MAPUS
sessions: it does not touch sessions you open in the dsh Web UI and does not
change `DSH_PERMISSION_MODE`. The probe result is host-wide and computed once.
`sandboxMode` accepts `auto` (default), `inherit` (never touch),
`read-only`, `workspace-write` and `danger-full-access`.

**Approval**: `approvalPolicy` defaults to `never` and writes an
`approval/policy` event at the start of the session. A bridged session has no Web
UI attached, so once `ask` fires (the model asks for a relaxed sandbox) nobody
will ever answer and the turn hangs until the HTTP body times out. Rejecting by
default gives the model a clear reason and lets it pick another path.

### MAPUS extension tools

23 extension tools plus the catalog tool plus one universal forwarder (24 entries
in the `TOOLS` array):

- context and scanning: `mapus_page_context`, `mapus_scan_findings`,
  `mapus_fingerprints`, `mapus_anti_state`, `mapus_hook_state`,
  `mapus_collect_endpoints`, `mapus_run_scan`
- page reading: `mapus_page_text`, `mapus_dom_query`, `mapus_page_storage`
- browser control: `mapus_browser_snapshot` / `_click` / `_type` / `_key` /
  `_scroll` / `_navigate` / `_tabs` / `_screenshot` / `_eval` / `_network` /
  `_console`
- probing: `mapus_probe_http`
- discovery: `mapus_catalog` (lists every capability), `mapus_tool` (forwards
  `{name, args}` to an undeclared tool)

Tools are registered **inside each agent's scope** (`create({ setup })`), so they
never leak into other sessions of the same profile's Web UI: those sessions cannot
see them.

The `mapus_` prefix is uniform because a profile may also load DSH's own
`browser-use`; duplicate names would make registration fail outright.

A runtime skill named `mapus-browser` is registered as well: the model loads it on
demand, so it costs nothing in the resident context.

## Security boundary

- Binds `127.0.0.1` only; any other address requires an explicit `allowRemote: true`.
- A token is mandatory (unless you explicitly configure an empty one). Every
  route except `/v1/health` validates it and answers 401 on a mismatch.
- The bridge's capability equals "read pages + run local commands", so the token
  is equivalent to local credentials: never put it in public configuration and
  never forward it to a LAN.
- Local commands go through the native dsh `bash` / `pwsh` and run with the
  current user's permissions; the bridge only hands browser capabilities to the
  agent and offers no additional local execution relay.
- The tools still obey the MAPUS switches: with the master switch off or the
  hooks disabled, the corresponding tools return an honest error instead of
  bypassing the switch.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `model request failed (check the dsh provider and key)` | the shell that started the bridge has no model key, or the profile provider is unreachable. Export the key first, then `bin/start.sh --reset` |
| `listen EADDRINUSE 127.0.0.1:3080` | the previous dsh is still alive. `/v1/shutdown` **only closes the bridge, it does not end the dsh process**, so it still holds the Web UI port. Use `bin/start.sh --reset` or `kill $(cat ~/.dsh/mapus-bridge/bridge.pid)` |
| `ERR_DLOPEN_FAILED` / `Cannot find module pty.node` | node and the dsh CLI come from different builds (native modules are ABI-bound). `start.sh` picks the node next to dsh automatically; starting by hand needs `~/.nvm/versions/node/<same as dsh>/bin/node` |
| Test connection says "invalid token" | the bridge runs but the token does not match. Re-copy `cat ~/.dsh/mapus-bridge/token`; `/v1/health` needs no token, so a successful health check means only the token is wrong |
| Test connection says "cannot connect" | the bridge is not running, or the port is not 7355 (check the startup banner) |
| changed the port but the panel still uses the old one | *Bridge URL* in the panel is a separate setting and has to be changed too |
| `--port` has no effect once installed | when installed, the port comes from the profile bundle config; the overlay has to **override by id**, not insert again. `bin/start.sh --port` writes the right thing |
| `dsh plugin add` fails with `ENOENT ... .tgz` | another profile dependency points at a missing file and pnpm fails as a whole; unrelated to this plugin. Use *register by hand* |
| the model has only 28 tools and no `bash` / `write` | the preset did not mount. Check the startup log for `mounted native dsh tools`; if absent, look above for `failed to register the local-tool preset` / `timed out mounting the dsh native tools`, the reason follows. `enableHostTools: false` also produces this |
| `bash` reports `sandbox mode "workspace-write" ... no sandbox backend is usable` | the machine has no enforceable sandbox backend (macOS 27 `sandbox-exec` refuses `deny` profiles). `sandboxMode: auto` pins the session to `danger-full-access` and warns; if that warning is missing, an explicit `sandboxMode` overrode the probe |
| a turn hangs, the last log line is `approval/asked` | the model asked for a relaxed sandbox and `approvalPolicy: ask` has no client to answer. Go back to the default `never` (it writes `approval/policy` at session start and rejects escalation immediately) |
| the panel reports `session "mapus-…" already exists` | two registries disagree: `ctx.agents.get()` has nothing, but the session store used by `create()` does (a retry in the panel landing on a turn that has not finished, or two pools opening the same session after a hot reload). Current handling: back off and retry the write lock (150ms, doubling, 5 tries ≈ 4s) → adopt the existing agent → resume; only if all of that fails does it error, with the session id and current cwd included. The log line is `session already exists in the harness, reusing it instead of failing` |
| `failed to resume the session: … is already owned by an active write handle` | the write handle is held by another **live** turn (a dead process would have released the flock). Wait for it to finish; this error now only appears after the 4 second backoff still finds it held, and never degrades into `already exists` |

## Development

```bash
node --test tests/*.test.js   # 92 cases: config, event projection, live stream frames, session pool, tool preset, sandbox probe, HTTP bridge, real defineTool validation
```

(`node --test tests/` treats the directory as a file on some node versions and
fails with `Cannot find module`; use the glob.)

`tests/tools-harness.test.js` imports the real `@deepseek-ai/dsh-tools` and runs
every tool definition through the registrar (schema compilation plus argument
validation); it skips itself when the package cannot be resolved.

## Verified / not verified

Verified on a real local dsh (`0.2.1-rc.2`, node v26.2.0):

- `--profile headless`: the plugin loads, the bridge starts, a task completes;
- `--profile web`: the bridge lives at 127.0.0.1:7355, `/v1/health` and
  `/v1/catalog` answer correctly;
- the whole `bin/start.sh` flow: start → health check 200 → a second start is
  refused (pointing at `--reset`) → `--reset` kills the old pid and starts again;
- end-to-end event projection shape: `hello → start → step → done`;
- **the native dsh tool chain end to end**: the session log shows
  `tool/call name=bash` (`echo HOST_BASH_OK` returns the right body), `write`
  really drops `written-by-dsh` in the current directory and `read` returns the
  same content; the "28 tools, no bash" symptom disappears;
- **quarantine and rebuild**: a session rejected by the v0→v1 migration is moved
  to `$DSH_HOME/mapus-bridge/quarantine/<sessionId>-<timestamp>` (it **must not**
  stay inside the `./sessions` tree — dsh-workspace scans that tree at startup and
  a directory whose header id cannot be derived takes the `workspace` service down,
  leaving `session-controller` / `schedule` / `ui-deliverables` all pending).

**Not** verified locally: `bash` actually running under the `workspace-write`
sandbox — on this macOS 27 machine `sandbox-exec` cannot apply a restricted
profile any more (see "Sandbox" above), so the local path is the `auto` fallback
`danger-full-access`. The fallback path itself was verified on the real machine:
the startup log says `no sandbox backend is available on this machine, so local
commands run as danger-full-access`, and a `whoami` probe returns `your-user`
(the same command is refused outright under the default `workspace-write`).
