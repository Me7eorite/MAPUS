# dsh-mapus

MAPUS 的 DeepSeek Harness 插件：把 **MAPUS 侧边栏**接成 DSH 的一个客户端，把
**MAPUS 的浏览器能力**注册成 DSH 的工具。

装上之后，侧边栏里那场对话仍然是那场对话，但思考和编排交给了 Harness 的 agent
循环；工具执行仍然在浏览器里发生（只有扩展能操作页面）。切换的是"谁在思考"，
不是界面的样子。

```
MAPUS 侧边栏 (React) ──port──> background/dsh-core.js
                                    │  POST /v1/turn   (NDJSON 事件流)
                                    │  POST /v1/rpc    (工具结果回传)
                                    ▼
                     dsh-mapus 桥 (127.0.0.1:7355, 本插件)
                        ├─ 会话   ctx.agents.create / resume   ← 一轮对话一个 DSH 会话
                        ├─ 事件   ctx.on('session/event')      → 翻译成侧边栏事件
                        ├─ 流式   ctx.on('agent/assistant-stream') → 逐 token 的 delta
                        └─ 工具   mapus_* (agent 作用域)        → 回浏览器执行
```

## 快速开始（三步）

```bash
# 1. 起桥（要求已经装进 profile，见下方「安装到 profile」；当前 dsh 不认 --patch）
export DEEPSEEK_API_KEY=sk-...        # dsh 那边用什么模型就配哪个，见下方「模型」
bin/start.sh

# 2. 控制台会打印地址和 Token，抄下来
#    ┌─ dsh-mapus 已就绪 ──────────────
#    │ 地址   http://127.0.0.1:7355
#    │ Token  8ccb0a7d…
#    └─────────────────────────────────

# 3. MAPUS 控制大屏 → 设置 → 智能体模型：
#    执行后端 = DeepSeek Harness → 填地址和 Token → 测试连接（返回工具数量即通）→ 保存
```

之后在「智能体」面板里正常说话就行：界面、会话、工具卡都不变，变的是思考和编排
交给了 dsh 的 agent 循环。想换回自带后端，把「执行后端」切回内置即可，两套配置互不覆盖。

## 回看某一场对话

dsh 把每场会话存成 `$DSH_HOME/sessions/<cwd 转义>/<sessionId>/session*.jsonl.zstd`
（zstd 压的 JSON Lines 事件流，比侧边栏那份全，含工具调用与轮次结束原因）。
不用启 dsh 就能看：

```bash
bin/sessions.sh                 # 列出所有会话
bin/sessions.sh --mapus         # 只看 MAPUS 相关
bin/sessions.sh <会话 id 前缀>    # 打印轨迹
bin/sessions.sh <id> --reasoning  # 连思考过程
bin/sessions.sh <id> --json       # 原始逐行事件
```

文件是多帧拼接的 zstd，node 的 `zstdDecompressSync` 只解第一帧，
`bin/sessions.mjs` 按魔数切帧逐帧解（需要 node ≥ 22.15，`sessions.sh` 会自己挑）。

`bin/start.sh` 的常用开关：`--port 7356`（换桥端口）、`--ui-port 3090`（换 dsh 自己的
Web UI 端口）、`--profile headless`、`--reset`（先杀掉上一次再起）、`--open`（顺手开 UI）。

### 模型

桥不自带模型：provider、地址、Key 全在 dsh 的 profile 里（`~/.dsh/profiles/<name>/`）。
**用哪个模型**则由控制大屏 → 设置 → 智能体模型 → 「模型提供方 / 模型」两个下拉决定，
不需要改 profile 文件。

`error: 模型请求失败（检查 dsh 的 provider / Key）` 这个文案背后其实有两层原因，症状一模一样：

| 真实原因 | 怎么确认 | 怎么修 |
| --- | --- | --- |
| shell 里没有 Key | 启动时是否打印「已从 … 补上模型 Key」 | `bin/start.sh` 会自动从 `~/.dsh/.credentials.yaml` 的 `refs:` 补；也可手工 `export DEEPSEEK_API_KEY=sk-...` |
| 模型没选上 | 日志里 `prompt variable "{{model}}" has no value` | 设置页点「读取可选模型」，选一个 provider + 模型 |
| 选中的 provider 端点不通 | 日志里 `Connection error.` / `code: TRANSPORT` | 换一个 provider（有的自建网关只在特定网络可达） |

排查时用 `DSH_MAPUS_DEBUG=1 bin/start.sh` 起桥，它会把 harness 的原始会话事件打出来 ——
上面三种原因只能这样区分，客户端拿到的永远只有那一句笼统文案。

想知道当前 profile 到底有哪些 provider / 模型可用：

```bash
curl -s -H "X-MAPUS-Token: $(cat ~/.dsh/mapus-bridge/token)" \
  http://127.0.0.1:7355/v1/models
```

## 安装到 profile（常驻，推荐）

装好之后 `dsh --profile web` 就是带桥的，不需要 `--patch`，`bin/start.sh` 也会自动
认出"已安装"，不再叠覆盖层（否则同一个桥会被注册两次、端口直接撞车）。

**方式一：一条命令**（需要 `pnpm` 在 PATH 上；dsh 自带的那份在
`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm`）

```bash
dsh plugin --profile web add /path/to/MAPUS/integrations/dsh-mapus
```

**方式二：手工登记**（`dsh plugin add` 跑不起来时用，见下面「常见坑」）

dsh 认两样东西：**profile 的 `node_modules` 里能解析到包名**，以及
**`dsh.profile.bundles` 里列了这个包**（只放进 `dependencies` 是不会加载的，实测过）。

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

然后 `dsh --profile web`，横幅里出现 `dsh-mapus 已就绪` 就成了。

> **常见坑**：`dsh plugin add` 底层是 `pnpm add`，它会重装整个 profile 的依赖。
> 只要 profile 里有**任何一个依赖指向的文件已经不在了**（比如某个本地 `.tgz` 被删了），
> pnpm 就会以 `ENOENT` 整体失败，跟本插件无关。这时用方式二，别去动那个坏依赖。

**临时用（不动 profile）**：手写覆盖层。

```yaml
# /tmp/mapus.yml
- insert:
    - id: mapus-bridge
      name: '/绝对路径/MAPUS/integrations/dsh-mapus/index.js'
      config:
        port: 7355
```

```bash
dsh --profile web --patch /tmp/mapus.yml
```

已经装进 profile 时想临时改桥端口，覆盖层要写成**按 id 覆盖**而不是再 insert：

```yaml
- id: mapus-bridge
  config:
    port: 7356
```

> `--patch` 要放在 `--profile` 之后、app 自己的参数之前：
> `dsh --profile web --patch x.yml --no-open --port 7398`。
> 写成 `dsh --profile web --no-open --patch x.yml` 会报 `unknown option`。

插件里的裸导入（`@deepseek-ai/dsh-tools`）从插件目录向上找 `node_modules`。
本地开发时如果没有，`node_modules/@deepseek-ai` 软链到 profile 的那份即可
（`bin/start.sh` 会自动做这一步）：

```bash
mkdir -p node_modules
ln -sfn ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

启动成功会打印：

```
  ┌─ dsh-mapus 已就绪 ─────────────────────────────────────────
  │ 地址   http://127.0.0.1:7355
  │ Token  8ccb0a7df2e0cd6bc5909feb43eb1146   (沿用已保存, ~/.dsh/mapus-bridge/token)
  │ 后端   provider=(profile 默认) model=(profile 默认)
  │ 下一步 MAPUS 控制大屏 → 设置 → 智能体模型 → 执行后端选「DeepSeek Harness」
  └────────────────────────────────────────────────────────────
```

把这行地址和 Token 填到 **MAPUS 控制大屏 → 设置 → 智能体模型 → 执行后端 =
DeepSeek Harness**，点「测试连接」应返回工具数量。

## 配置

patch 行里的 `config` 全部可选：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `host` | `127.0.0.1` | 只绑回环；`allowRemote` 才允许其它地址 |
| `port` | `7355` | 桥自己的 HTTP 端口；`0` 表示由系统分配 |
| `token` | 空 | 空＝首次生成并写入 `$DSH_HOME/mapus-bridge/token`（0600） |
| `provider` / `model` | 空 | 空＝跟随 profile 默认；非空则逐轮固化到会话 |
| `reasoningEffort` | 空 | 适配器支持时生效 |
| `sessionPrefix` | `mapus` | DSH 会话 id 前缀，便于在会话列表里认出来 |
| `maxSteps` | `40` | 仅用于侧边栏步数计显示 |
| `rpcTimeoutMs` | `120000` | 单次浏览器工具调用上限 |
| `allowRemote` | `false` | 允许绑定非回环地址（不建议） |
| `systemPrompt` | 空 | 追加到 MAPUS 人格段之后 |
| `enableTools` | `true` | 关掉就只当桥用，不注册 `mapus_*` 工具 |
| `enableHostTools` | `true` | 给 agent 挂 dsh 原生的 `bash` / `read` / `write` / `glob` / `grep` / `job_*` |
| `approvalPolicy` | `never` | 沙箱升级请求直接拒（`ask` 在无 Web UI 时会挂死整轮） |
| `sandboxMode` | `auto` | 宿主没有可用沙箱后端时给本会话钉 `danger-full-access`；`inherit` 则完全不碰 |

## 协议

普通 HTTP + NDJSON，不用 WebSocket —— MV3 的 service worker 会在空闲时被挂起，
长连接反而要写重连；一轮一个 POST 更符合浏览器这边的心智模型。

| 路由 | 说明 |
| --- | --- |
| `GET /v1/health` | 健康检查，**不需要 token**（侧边栏靠它区分"没起"和"token 错"） |
| `GET /v1/catalog` | 已声明的工具面 |
| `POST /v1/turn` | 一轮对话，响应体是 NDJSON 事件流 |
| `POST /v1/rpc` | 浏览器侧把工具结果送回（按 rpc id 关联） |
| `POST /v1/cancel` | 停掉某一轮 |
| `POST /v1/shutdown` | 关桥（测试/排障用） |

一轮的事件顺序：

```
hello → start → step → (reasoning) → rpc ⇄ POST /v1/rpc → delta… → done
```

`delta…` 是真的一小块一小块来的，来源是 **`agent/assistant-stream`**：dsh 把
流式增量发在这条 **process-local、按 agent 作用域派发、且不写会话日志** 的通道上。
只听 `session/event` 的话，模型说完之前面板会一直静默，然后把整段正文当成一条
`delta` 一次性吐出来 —— 看起来就是"没有流式"。`assistant/message` 落定时只补
「流式还没发出去的那一截」，两条路不会重复；推理（reasoning）只要流过就不再补，
因为 dsh 会在正文 attempt 前再发一次 `start`，那时计数已清零，只按计数判断会把
整段思考重发一遍。

工具卡**不由桥发**：工具是扩展收到 `rpc` 之后自己执行、自己发的 `tool` /
`tool_result`，这样卡片上的耗时是真实的，也不会出现重复卡片。

`done` 的 `answer` 是这一轮的可见正文，`usage` 是各步 token 累加，
`steps` / `budget` 对应侧边栏的步数计。

## 工具面

### dsh 原生工具（首选）

每个 agent 装配时，本插件会向 harness 的 preset registry 注册一条自己的 preset
（`mapus-host`，`order: 900`）并挂到该 agent 的作用域上，于是模型直接拥有：

| 工具 | 作用 |
| --- | --- |
| `bash` / `pwsh` | 跑命令（macOS/Linux / Windows 各取其一） |
| `read` / `write` / `edit` / `read_image` | 读写文件 |
| `glob` / `grep` | 找文件、搜内容 |
| `job_list` / `job_output` / `job_kill` | 后台任务 |

为什么必须自己注册：`dsh-web-app` 这层 bundle 在 host plane 把 `tool-bash` /
`tool-fs` / `tool-fs-search` / `tool-jobs` 全 **disable** 了 —— 原文是「base 留给
TUI，Web 表面让每个会话自己挂 preset」。Web UI 新建会话会挂 `standard`，
而桥是用 `ctx.agents.create()` 直接建 agent、不经过任何 preset，所以不补这一步
就只剩一个 `working_directory`，碰不到磁盘也跑不了命令。

窄是有意的：persona / compaction / plan-mode / subagent / web 都没挂 ——
它们要么覆盖面板自己负责的界面，要么需要这个桥没有的审批 UI。

**沙箱**：命令受会话的 sandbox mode 约束，默认走 harness 的 `workspace-write`
（写入范围＝会话 cwd）。但 harness 在 macOS 上**从不预检**它的 seatbelt 后端
（`chainVerdict()` 对唯一候选直接返回、不 probe），失败要等到命令真的 spawn 才发现；
而 macOS 27 起 `sandbox-exec` 已经无法 apply 任何带 `deny` 规则的 profile：

```
$ /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny file-write*)' -- true
sandbox-exec: sandbox_apply: Operation not permitted   # exit 71
$ /usr/bin/sandbox-exec -p '(version 1)(allow default)' -- true   # 这条还能过
```

所以本插件在装配时自己探一次内核（同一个 profile 形状），探不通就给**这条会话**
钉 `sandbox/mode = danger-full-access` 并打一行警告 —— 这只影响 MAPUS 会话，
不碰你在 dsh Web UI 里开的会话，也不改 `DSH_PERMISSION_MODE`。探测结果是宿主级
的，只算一次。配置项 `sandboxMode`：`auto`（默认）/ `inherit`（完全不碰）/
`read-only` / `workspace-write` / `danger-full-access`（显式钉某个档）。

**审批**：`approvalPolicy` 默认 `never`，会在会话开头写一条 `approval/policy`。
桥接会话没有 Web UI 连着，`ask` 一旦触发（模型请求放宽沙箱）就永远不会有人回答，
整轮会一直挂着直到 HTTP body 超时。默认直接拒，模型会收到明确原因并换路径。

### MAPUS 扩展工具

23 个扩展工具 + 目录工具 + 一个万能转发（`TOOLS` 数组共 24 项）：

- 现场与扫描：`mapus_page_context`、`mapus_scan_findings`、`mapus_fingerprints`、
  `mapus_anti_state`、`mapus_hook_state`、`mapus_collect_endpoints`、`mapus_run_scan`
- 页面读取：`mapus_page_text`、`mapus_dom_query`、`mapus_page_storage`
- 浏览器控制：`mapus_browser_snapshot` / `_click` / `_type` / `_key` / `_scroll` /
  `_navigate` / `_tabs` / `_screenshot` / `_eval` / `_network` / `_console`
- 探测：`mapus_probe_http`
- 发现：`mapus_catalog`（列全部能力）、`mapus_tool`（`{name, args}` 转发到未声明的工具）

工具注册在**每个 agent 的作用域里**（`create({ setup })`），不会污染同一
profile 里 Web UI 的其它会话：别的会话看不到这些工具。

名字统一加 `mapus_` 前缀，因为 profile 可能同时挂着 DSH 自己的 `browser-use`，
重名会让注册直接失败。

同时注册一个运行时 skill `mapus-browser`，模型按需加载，常驻上下文零成本。

## 安全边界

- 只绑 `127.0.0.1`；非回环地址必须显式 `allowRemote: true`。
- Token 必填（除非你显式配空）。`/v1/health` 之外的接口一律校验，错 token 401。
- 桥的能力等于"读页面 + 在本机跑命令"，所以 Token 等同于本机凭据：
  不要写进公开配置，不要转发到局域网。
- 本机命令走 dsh 原生 `bash` / `pwsh`，权限等于当前登录用户；桥只把浏览器
  能力交给 agent，不再提供任何本机执行中转。
- 工具本身仍受 MAPUS 的开关约束：总开关关掉、Hook 未启用时，对应工具都会
  如实返回错误，而不是绕过。

## 排障

| 症状 | 原因 / 处理 |
| --- | --- |
| `error: 模型请求失败（检查 dsh 的 provider / Key）` | 起桥的 shell 没有模型 Key，或 profile 的 provider 连不上。先把 Key `export` 出来再 `bin/start.sh --reset` |
| `listen EADDRINUSE 127.0.0.1:3080` | 上一次的 dsh 还活着。`/v1/shutdown` **只关桥、不结束 dsh 进程**，所以它仍占着 Web UI 端口。用 `bin/start.sh --reset`，或 `kill $(cat ~/.dsh/mapus-bridge/bridge.pid)` |
| `ERR_DLOPEN_FAILED` / `Cannot find module pty.node` | node 和 dsh CLI 不同源（原生模块按 ABI 编的）。`start.sh` 会自动选 dsh 同目录的 node；手工起时用 `~/.nvm/versions/node/<和 dsh 同版本的>/bin/node` |
| 设置页测试连接报「Token 不对」 | 桥在跑但 token 不匹配。`cat ~/.dsh/mapus-bridge/token` 重新抄一份；`/v1/health` 不需要 token，能通说明只是 token 问题 |
| 测试连接报「连不上」 | 桥没起，或端口不是 7355（看启动横幅） |
| 改了端口但面板还连旧的 | 面板里的「桥地址」是独立配置，要一起改 |
| 已装进 profile 后用 `--port` 没生效 | 已安装时端口由 profile 的 bundle 配置决定；覆盖层要写成「按 id 覆盖」而不是再 insert。`bin/start.sh --port` 会自动写对 |
| `dsh plugin add` 报 `ENOENT ... .tgz` | profile 里别的依赖指向的文件已不存在，pnpm 整体失败，与本插件无关。改用「手工登记」 |
| 模型只有 28 个工具、没有 `bash` / `write` | preset 没挂上。看启动日志有没有 `[dsh-mapus] 已给 agent 挂上 dsh 原生工具`；没有就往上找 `注册本机工具 preset 失败` / `挂载 dsh 自带工具超时`，原因会写在后面。`enableHostTools` 被关掉也会这样 |
| `bash` 报 `sandbox mode "workspace-write" ... no sandbox backend is usable` | 这台机器上没有能 enforce 的沙箱后端（macOS 27 的 `sandbox-exec` 已拒绝 `deny` 类 profile）。`sandboxMode: auto` 会自动给会话钉 `danger-full-access` 并打警告；若日志里没有那行警告，说明探测被 `sandboxMode` 的显式值覆盖了 |
| 一轮对话卡住不动，日志最后是 `approval/asked` | 模型请求放宽沙箱，而 `approvalPolicy: ask` 下没有任何客户端能回答。改回默认 `never`（会在会话开头写 `approval/policy`，升级请求立即被拒） |
| 面板报 `session "mapus-…" already exists` | 两个注册表打架：`ctx.agents.get()` 没有，但 `create()` 用的 session store 里有（面板点「重试」撞上上一轮还没收尾，或热重载后新旧两个 pool 同时打开同一会话）。现在的处理：写锁退避重试（150ms 起、翻倍、5 次≈4s）→ 认领已存在的 agent → 再 resume；全都失败才报错，且错误里带会话 id 与当前 cwd。日志里能搜到 `会话已存在于 harness，改为复用而不是报错` |
| 报 `恢复会话失败：… is already owned by an active write handle` | 写句柄被另一个**还活着**的回合占着（进程死掉的话内核会放 flock，不会是这个）。等它收尾再发；这条错误现在只在退避 4 秒后仍被占时才出现，不会退化成 `already exists` |

## 开发

```bash
node --test tests/*.test.js   # 92 个用例：配置、事件翻译、实时流帧、会话池、工具预设、沙箱探测、HTTP 桥、真实 defineTool 校验
```

（`node --test tests/` 在部分 node 版本上会把目录当文件解析并报 `Cannot find
module`，用通配符。）

`tests/tools-harness.test.js` 会 import 真实的 `@deepseek-ai/dsh-tools` 把每个
工具定义过一遍注册器（schema 编译 + 参数校验）；解析不到时自动跳过。

## 已验证 / 未验证

已在本机真实 dsh（`0.2.1-rc.2`，node v26.2.0）上跑过：

- `--profile headless`，插件正常加载、桥正常启动、任务正常完成；
- `--profile web`，桥在 127.0.0.1:7355 长期存活，`/v1/health`、`/v1/catalog` 正常；
- `bin/start.sh` 全流程：起桥 → 健康检查 200 → 重复启动被拦下（提示 `--reset`）→
  `--reset` 杀掉旧 pid 后重新起得来；
- 事件投影端到端形态：`hello → start → step → done`；
- **dsh 原生工具链端到端**：会话日志里出现 `tool/call name=bash`（
  `echo HOST_BASH_OK` 返回正文正确）、`write` 真的在当前目录落下
  `written-by-dsh`、`read` 读回一致；`/v1/health` 之外只有 `mapus_*` 时那种
  「28 个工具、没有 bash」的现象消失；
- **隔离重建**：被 v0→v1 迁移链拒绝的会话会被移到
  `$DSH_HOME/mapus-bridge/quarantine/<sessionId>-<时间戳>`（**不能**留在
  `./sessions` 树里 —— dsh-workspace 启动时会扫那棵树，头部 id 推不出来的目录
  会让 `workspace` 服务直接挂掉，连带 `session-controller` / `schedule` /
  `ui-deliverables` 全部 pending）。

**未**在本机验证的：`workspace-write` 沙箱下 `bash` 的真实执行 —— 这台 macOS 27
上 `sandbox-exec` 已经 apply 不了受限 profile（见上文「沙箱」），所以本机走的是
`auto` 降级后的 `danger-full-access`。降级路径本身已按真机验证：
启动日志 `这台机器上没有可用的沙箱后端，本机命令按 danger-full-access 运行`，
探针 `whoami` 返回 `your-user`（默认 `workspace-write` 时同一条命令是被直接拒绝的）。
