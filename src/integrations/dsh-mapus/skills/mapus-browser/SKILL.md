# MAPUS 浏览器作业手册

这份 skill 只在要做「在真实浏览器里读点什么 / 点一下 / 验一件事」时加载。
工具名都带 `mapus_` 前缀，实际执行发生在用户的 Chrome 扩展里。

## 什么时候用

- 需要看当前标签页的真实内容（URL、标题、可见文本、DOM、存储、Cookie）。
- 需要看 MAPUS 已经扫出来的东西（敏感信息、接口面、指纹、反蜜罐状态）。
- 需要真的操作页面（点击、输入、下拉、滚动、悬停）验证一个结论。
- 需要抓网络请求、控制台异常、截图，或者执行一段页面内 JS。

只需要读公开资料、算东西、写代码时，不要调这些工具。

## 起手式

1. `mapus_page_context` —— 先拿现场。URL、标题、扫描计数、指纹、防护状态。
2. 再决定方向：
   - 要业务语义 → `mapus_page_text`
   - 要结构 / 表单 / 隐藏元素 → `mapus_dom_query`
   - 要凭据与登录态 → `mapus_scan_findings`（credentials / cookies / jwts）、`mapus_page_storage`
   - 要接口面 → `mapus_collect_endpoints`，再配合 `mapus_browser_network`
   - 要指纹与后端 → `mapus_fingerprints`

## 操作页面

先 `mapus_browser_snapshot` 拿一份可交互元素清单（每个带 `ref`，如 `e3`），
然后按 `ref` 或 CSS 选择器操作：

- 点击 `mapus_browser_click`（真实鼠标事件，`isTrusted=true`）
- 输入 `mapus_browser_type`（`clear` 先清空，`submit` 回车）
- 键盘 `mapus_browser_key`（支持 `Control+A` 这类组合）
- 下拉 `mapus_browser_select`、悬停 `mapus_browser_hover`、滚动 `mapus_browser_scroll`
- 跳转 `mapus_browser_navigate`（`goto` / `back` / `forward` / `reload`）

每做完一个操作，**重新拍一次快照**再决定下一步。页面结构变了，旧的 `ref` 就作废。

## 硬规则

1. **一步一个动作。** 不要在一个回合里连点三个按钮然后才发现第一步就点错了。
2. **结论要有证据。** 说「存在未授权接口」之前，至少有一次 `mapus_probe_http`
   或 `mapus_browser_network` 的响应作为依据；说「页面报错」之前，先看
   `mapus_browser_console`。
3. **不认识的工具先查目录。** `mapus_catalog` 列出全部能力；清单里没有的，
   用 `mapus_tool` 转发：`{ name: "扩展侧工具名", args: {...} }`。
4. **本机命令用 dsh 原生工具，不要另找通道。** 跑 shell 用 `bash`（Windows 用
   `pwsh`），读写文件用 `read` / `write` / `edit`，找文件用 `glob` / `grep`。
   这些是唯一的本机执行入口，权限等于当前登录用户，动手前确认命令的破坏性。
5. **工具报错先判断类型**：参数错 → 改参数；页面状态错 → 先拿快照/上下文；
   能力未启用 → 告诉用户去哪个开关打开。别把同一条命令连发三次。

## 输出

给结论时区分「已验证」和「未验证」。已验证的，写清是哪一次调用给的证据；
未验证的，写清楚还缺什么，以及下一步打算怎么补。
