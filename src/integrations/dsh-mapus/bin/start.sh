#!/usr/bin/env bash
# 启动一个已经把 dsh-mapus 桥装进去的 dsh（插件必须已常驻装进 profile）。
#
#   bin/start.sh                        # web profile，桥 127.0.0.1:7355，dsh Web UI 3080
#   bin/start.sh --ui-port 3090         # 换 dsh 自己的 Web UI 端口（两个实例并存时用）
#   bin/start.sh --profile headless     # 换 profile
#   bin/start.sh --open                 # 顺手把 dsh 的 Web UI 打开
#   bin/start.sh --reset                # 先杀掉上一次（pid 文件里那个）再启动
#   bin/start.sh -- <其它 dsh 参数>      # -- 之后的参数原样交给 dsh
#
# 桥端口固定 7355：当前 dsh CLI 不认 --patch，改端口得改 profile 的 cordis.patch.yml。
# 模型 Key 会自动从 $DSH_HOME/.credentials.yaml 的 refs 补，不用手工 export。
#
# 启动后控制台会打印桥地址和 Token，把它们填进 MAPUS 控制大屏 → 设置 → 智能体模型。
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
    -h|--help) sed -n '2,16{/^#/!d;s/^# \{0,1\}//;p}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1（--help 看用法）" >&2; exit 2 ;;
  esac
done

port_busy() { nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1; }

if [ "$RESET" -eq 1 ] && [ -f "$PID_FILE" ]; then
  old="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    echo "关掉上一次 (pid ${old}) …"
    kill "$old" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$old" 2>/dev/null || break
      sleep 0.5
    done
  fi
  rm -f "$PID_FILE"
fi

# 上一次的 dsh 可能还在（桥被 /v1/shutdown 关掉，但进程自己没退，仍占着 Web UI 端口）
if port_busy "$BRIDGE_PORT"; then
  echo "❌ 已经有桥在 127.0.0.1:$BRIDGE_PORT 上跑着了。" >&2
  echo "   重启：bin/start.sh --reset      换个端口：bin/start.sh --port 7356" >&2
  exit 1
fi
if port_busy "$UI_PORT"; then
  echo "❌ dsh 自己的 Web UI 端口 $UI_PORT 被占用（很可能是上一次没退干净的 dsh）。" >&2
  echo "   杀掉它：kill \$(cat $PID_FILE)      或换个端口：bin/start.sh --ui-port 3090" >&2
  echo "   注意：桥的 /v1/shutdown 只关桥，不会结束 dsh 进程。" >&2
  exit 1
fi

# ---- node：必须和 dsh CLI 同源（原生模块按 ABI 编的，版本错了会 ERR_DLOPEN_FAILED）----
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
    echo "找不到 dsh CLI：PATH 里没有 dsh，$DSH_HOME/profiles 下也没有。" >&2
    echo "先在 DSH 桌面版里跑过一次，或用 pnpm 装一份 @deepseek-ai/dsh。" >&2
    exit 1
  fi
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node"
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
[ -n "$NODE_BIN" ] || { echo "找不到 node" >&2; exit 1; }

# ---- 插件里的裸导入（@deepseek-ai/dsh-tools）要能找到 ----
if [ ! -e "$PLUGIN_DIR/node_modules/@deepseek-ai" ]; then
  mkdir -p "$PLUGIN_DIR/node_modules"
  ln -sfn "$DSH_HOME/profiles/node_modules/@deepseek-ai" "$PLUGIN_DIR/node_modules/@deepseek-ai"
  echo "已软链 @deepseek-ai -> $DSH_HOME/profiles/node_modules/@deepseek-ai"
fi

# ---- 已经装进 profile 了吗？装了就不要再叠覆盖层，否则同一个桥会被注册两次 ----
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
  echo "检测到 profile 里已常驻安装 dsh-mapus，不再插入第二份。"
  if [ "$BRIDGE_PORT" != "7355" ]; then
    # dsh CLI 不认 --patch（会直接 exit：error: unknown option '--patch'），
    # 所以换端口只能改 profile 自己的 patch，不能在命令行上叠覆盖层。
    echo "❌ 已安装模式下只能跑 7355：当前 dsh 不支持 --patch 覆盖层。" >&2
    echo "   换端口请改 $PROFILE_DIR/cordis.patch.yml，给它加一段：" >&2
    echo "     - id: mapus-bridge" >&2
    echo "       config:" >&2
    echo "         port: $BRIDGE_PORT" >&2
    exit 1
  fi
  ARGS=(--profile "$PROFILE" --port "$UI_PORT")
else
  echo "❌ profile $PROFILE 里没有常驻安装 dsh-mapus，而当前 dsh 不支持 --patch 覆盖层。" >&2
  echo "   先装进 profile：" >&2
  echo "     dsh plugin --profile $PROFILE add $(printf '%q' "$PLUGIN_DIR")" >&2
  echo "   装完后把 \"dsh-mapus\" 写进 $PROFILE_DIR/package.json 的 dsh.profile.bundles，" >&2
  echo "   再回来跑这个脚本。细节见 $PLUGIN_DIR/README.md 的「安装到 profile」。" >&2
  exit 1
fi

# ---- 模型 Key：shell 里没有就从 dsh 的凭据文件补 ----
# dsh 的 provider 用 `apiKeyEnv: DEEPSEEK_API_KEY` 这种方式取 Key；桌面版把 Key 存在
# $DSH_HOME/.credentials.yaml 的 refs 里。CLI 直接起 profile 时环境里没有这些变量，
# 结果每一轮都在模型请求处失败（客户端只能看到"模型请求失败"这种笼统文案）。
# 这里在启动前把 refs 里的 *_KEY / *_TOKEN 导成环境变量，等价于用户手工 export。
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
    echo "已从 $CRED_FILE 补上模型 Key（无需手工 export）。"
  fi
fi

if [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${DEEPBLUE_API_KEY:-}" ] && [ -z "${VENUS_API_KEY:-}" ]; then
  echo "⚠️  当前 shell 没有任何模型 Key（DEEPSEEK_API_KEY / DEEPBLUE_API_KEY / VENUS_API_KEY）。" >&2
  echo "    $CRED_FILE 里也没有可用的 refs，桥能起来、工具能注册，" >&2
  echo "    但一轮对话会在模型请求处失败。先 export DEEPSEEK_API_KEY=... 再跑。" >&2
fi

mkdir -p "$STATE_DIR"
echo $$ >"$PID_FILE"

[ "$OPEN_UI" -eq 1 ] || ARGS+=(--no-open)
ARGS+=(${EXTRA[@]+"${EXTRA[@]}"})

echo "启动 dsh：profile=${PROFILE}  桥端口=${BRIDGE_PORT}  UI端口=${UI_PORT}  (pid $$)"
exec "$NODE_BIN" "$DSH_CLI" "${ARGS[@]}"
