#!/usr/bin/env bash
# Start a dsh whose profile already has the dsh-mapus bridge installed.
#
#   bin/start.sh                        # web profile, bridge 127.0.0.1:7355, dsh Web UI 3080
#   bin/start.sh --ui-port 3090         # change the dsh Web UI port (two instances side by side)
#   bin/start.sh --profile headless     # change the profile
#   bin/start.sh --open                 # open the dsh Web UI afterwards
#   bin/start.sh --reset                # stop the previous run from the pid file first
#   bin/start.sh -- <dsh args>          # everything after -- goes to dsh untouched
#
# The bridge port is fixed at 7355: the current dsh CLI has no --patch, so the
# port lives in the profile's cordis.patch.yml. Model keys are filled in from
# $DSH_HOME/.credentials.yaml automatically, no manual export needed.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
STATE_DIR="$DSH_HOME/mapus-bridge"
PID_FILE="$STATE_DIR/bridge.pid"

PROFILE="web"
BRIDGE_PORT="7355"
UI_PORT="3080"
OPEN_UI=0
RESET=0
EXTRA=()

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --port) BRIDGE_PORT="$2"; shift 2 ;;
    --ui-port) UI_PORT="$2"; shift 2 ;;
    --open) OPEN_UI=1; shift ;;
    --reset) RESET=1; shift ;;
    --) shift; EXTRA=(${@+"$@"}); break ;;
    -h|--help) sed -n '2,13{/^#/!d;s/^# \{0,1\}//;p}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

port_busy() { nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1; }

if [ "$RESET" -eq 1 ] && [ -f "$PID_FILE" ]; then
  old="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    echo "stopping previous run (pid ${old})"
    kill "$old" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$old" 2>/dev/null || break
      sleep 0.5
    done
  fi
  rm -f "$PID_FILE"
fi

# The old dsh may still be alive: /v1/shutdown only closes the bridge, the
# process keeps holding the Web UI port.
if port_busy "$BRIDGE_PORT"; then
  echo "bridge port 127.0.0.1:$BRIDGE_PORT is already in use" >&2
  echo "  restart: bin/start.sh --reset      other port: bin/start.sh --port 7356" >&2
  exit 1
fi
if port_busy "$UI_PORT"; then
  echo "dsh Web UI port $UI_PORT is already in use (likely a dsh that never exited)" >&2
  echo "  kill it: kill \$(cat $PID_FILE)      other port: bin/start.sh --ui-port 3090" >&2
  echo "  note: the bridge /v1/shutdown only closes the bridge, it does not end the dsh process" >&2
  exit 1
fi

# ---- node must match the dsh CLI build (native modules are ABI-bound) ----
NODE_BIN="${NODE_BIN:-}"
DSH_CLI="${DSH_CLI:-}"

if [ -z "$DSH_CLI" ]; then
  DSH_LAUNCHER=""
  if [ -n "$(command -v dsh 2>/dev/null || true)" ]; then
    DSH_LAUNCHER="$(command -v dsh)"
  else
    while IFS= read -r cand; do
      [ -n "$cand" ] && { DSH_LAUNCHER="$cand"; break; }
    done < <(ls -1d "$HOME"/.nvm/versions/node/*/bin/dsh 2>/dev/null | sort -rV)
  fi
  if [ -n "$DSH_LAUNCHER" ]; then
    DSH_CLI="$DSH_LAUNCHER"
    [ -z "$NODE_BIN" ] && NODE_BIN="$(dirname "$DSH_LAUNCHER")/node"
  fi
fi

if [ -z "$DSH_CLI" ]; then
  if [ -f "$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js" ]; then
    DSH_CLI="$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js"
  else
    echo "dsh CLI not found: no dsh on PATH and nothing under $DSH_HOME/profiles" >&2
    echo "  run the DSH desktop app once, or install @deepseek-ai/dsh with pnpm" >&2
    exit 1
  fi
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node"
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
[ -n "$NODE_BIN" ] || { echo "node not found" >&2; exit 1; }

# ---- the plugin imports @deepseek-ai/dsh-tools bare, so it must resolve ----
if [ ! -e "$PLUGIN_DIR/node_modules/@deepseek-ai" ]; then
  mkdir -p "$PLUGIN_DIR/node_modules"
  ln -sfn "$DSH_HOME/profiles/node_modules/@deepseek-ai" "$PLUGIN_DIR/node_modules/@deepseek-ai"
  echo "linked @deepseek-ai -> $DSH_HOME/profiles/node_modules/@deepseek-ai"
fi

# ---- installed into the profile already? do not stack a second overlay ----
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
INSTALLED=0
if [ -e "$PROFILE_DIR/node_modules/dsh-mapus" ] && [ -f "$PROFILE_DIR/package.json" ] \
   && "$NODE_BIN" -e "
     const fs=require('fs');
     const p=process.argv[1];
     try{
       const j=JSON.parse(fs.readFileSync(p,'utf8'));
       const b=(j.dsh&&j.dsh.profile&&j.dsh.profile.bundles)||[];
       process.exit(b.includes('dsh-mapus')?0:1);
     }catch(e){process.exit(1);}
   " "$PROFILE_DIR/package.json"; then
  INSTALLED=1
fi

if [ "$INSTALLED" -eq 1 ]; then
  echo "dsh-mapus is installed in profile '$PROFILE', not stacking a second copy"
  if [ "$BRIDGE_PORT" != "7355" ]; then
    # dsh CLI rejects --patch outright, so a port change has to go into the
    # profile's own patch file.
    echo "only port 7355 works in installed mode: this dsh does not support the --patch overlay" >&2
    echo "  to change it, add this to $PROFILE_DIR/cordis.patch.yml:" >&2
    echo "     - id: mapus-bridge" >&2
    echo "       config:" >&2
    echo "         port: $BRIDGE_PORT" >&2
    exit 1
  fi
  ARGS=(--profile "$PROFILE" --port "$UI_PORT")
else
  echo "profile '$PROFILE' has no dsh-mapus installed, and this dsh does not support the --patch overlay" >&2
  echo "  install it first:" >&2
  echo "     dsh plugin --profile $PROFILE add $(printf '%q' "$PLUGIN_DIR")" >&2
  echo "  then add \"dsh-mapus\" to dsh.profile.bundles in $PROFILE_DIR/package.json" >&2
  echo "  see the 'install into a profile' section of $PLUGIN_DIR/README.md" >&2
  exit 1
fi

# ---- model keys: fill from the dsh credentials file when the shell has none ----
# dsh providers read keys through `apiKeyEnv: DEEPSEEK_API_KEY`; the desktop app
# stores them under refs: in $DSH_HOME/.credentials.yaml. Starting a profile
# from the CLI leaves those variables unset, so every turn fails at the model
# request with a generic message. Export the *_KEY / *_TOKEN refs up front.
CRED_FILE="$DSH_HOME/.credentials.yaml"
if [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -f "$CRED_FILE" ]; then
  IN_REFS=0
  while IFS= read -r line; do
    case "$line" in
      refs:*) IN_REFS=1; continue ;;
      records:*) IN_REFS=0; continue ;;
    esac
    [ "$IN_REFS" = "1" ] || continue
    ckey="${line%%:*}"
    cval="${line#*:}"
    ckey="$(printf '%s' "$ckey" | tr -d '[:space:]')"
    cval="$(printf '%s' "$cval" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"
    [ -n "$ckey" ] && [ -n "$cval" ] || continue
    case "$ckey" in
      *_API_KEY|*_TOKEN|*_KEY) ;;
      *) continue ;;
    esac
    eval "export ${ckey}=\"\${cval}\""
  done <"$CRED_FILE"
  if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
    echo "model key loaded from $CRED_FILE"
  fi
fi

if [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${DEEPBLUE_API_KEY:-}" ] && [ -z "${VENUS_API_KEY:-}" ]; then
  echo "no model key in this shell (DEEPSEEK_API_KEY / DEEPBLUE_API_KEY / VENUS_API_KEY)" >&2
  echo "  $CRED_FILE has no usable refs either; the bridge will start and tools will" >&2
  echo "  register, but a turn fails at the model request. export DEEPSEEK_API_KEY=... first." >&2
fi

mkdir -p "$STATE_DIR"
echo $$ >"$PID_FILE"

[ "$OPEN_UI" -eq 1 ] || ARGS+=(--no-open)
ARGS+=(${EXTRA[@]+"${EXTRA[@]}"})

echo "starting dsh: profile=${PROFILE}  bridge=${BRIDGE_PORT}  ui=${UI_PORT}  (pid $$)"
exec "$NODE_BIN" "$DSH_CLI" "${ARGS[@]}"
