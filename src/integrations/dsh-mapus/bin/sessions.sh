#!/usr/bin/env bash
# 看 dsh 保存的会话记录（不启动 dsh）。
#
#   bin/sessions.sh                    列出所有会话
#   bin/sessions.sh --mapus            只看 MAPUS 相关
#   bin/sessions.sh <会话 id 前缀>      打印这一场的可读轨迹
#   bin/sessions.sh <id> --reasoning   连思考过程一起看
#   bin/sessions.sh --help             全部用法
#
# 只是挑一个带 zstd 的 node（>= 22.15）再转给 bin/sessions.mjs，逻辑都在那边。
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

# zstd 解压需要 node >= 22.15，优先用 dsh 自己的运行时（一定配得上它的会话格式）。
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
  echo "找不到支持 zstd 的 node（需要 >= 22.15）。" >&2
  echo "指定一个：NODE_BIN=/path/to/node bin/sessions.sh" >&2
  exit 1
fi

exec "$NODE" "$PLUGIN_DIR/bin/sessions.mjs" "$@"
