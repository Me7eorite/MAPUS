#!/usr/bin/env bash
# Read the session logs dsh keeps (without starting dsh).
#
#   bin/sessions.sh                    list every session
#   bin/sessions.sh --mapus            MAPUS-related sessions only
#   bin/sessions.sh <id prefix>        print a readable trace of one session
#   bin/sessions.sh <id> --reasoning   include the reasoning stream
#   bin/sessions.sh --help             full usage
#
# This only picks a node with zstd (>= 22.15) and hands over to bin/sessions.mjs.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

# zstd needs node >= 22.15; prefer the dsh runtime, which always matches its session format.
CANDIDATES=(
  "${NODE_BIN:-}"
  "$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node"
  "$(ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -rV | head -1 || true)"
  "$(command -v node 2>/dev/null || true)"
)

NODE=""
for cand in "${CANDIDATES[@]}"; do
  [ -n "$cand" ] || continue
  [ -x "$cand" ] || continue
  if "$cand" -e 'process.exit(typeof require("zlib").zstdDecompressSync==="function"?0:1)' 2>/dev/null; then
    NODE="$cand"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "no node with zstd support found (need >= 22.15)" >&2
  echo "  pick one: NODE_BIN=/path/to/node bin/sessions.sh" >&2
  exit 1
fi

exec "$NODE" "$PLUGIN_DIR/bin/sessions.mjs" "$@"
