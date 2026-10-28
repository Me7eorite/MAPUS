(function (root) {
    const I = typeof module === 'object' && module.exports ? require('./core.js') : root.ADB_I18N;
    const messages = {
    "error_f4cb172250c9": {
        "zh_CN": "changes 必须是脚本设置数组。",
        "en": "changes must be an array of script settings."
    },
    "error_c1dfcc36876c": {
        "zh_CN": "每项修改都必须包含 id 和布尔值 enabled。",
        "en": "Each change requires id and boolean enabled."
    },
    "error_e1646587f4f8": {
        "zh_CN": "未知的脚本 ID。",
        "en": "Unknown script ID."
    },
    "error_ff9e031dc8d6": {
        "zh_CN": "请分别设置各脚本 ID；扩展会自动合并注册。",
        "en": "Set the individual script IDs; their registration is combined automatically."
    },
    "error_eecd50326cab": {
        "zh_CN": "此脚本没有可配置的 Hook 参数。",
        "en": "This script has no Hook parameters."
    },
    "error_7955adb00d40": {
        "zh_CN": "patch 必须是对象。",
        "en": "patch must be an object."
    },
    "error_e7ff95776e1b": {
        "zh_CN": "已保存的 Hook 配置必须是对象。",
        "en": "Saved Hook configuration must be an object."
    },
    "error_a9f4d5881d7f": {
        "zh_CN": "不支持此 Hook 配置字段。",
        "en": "Unsupported Hook configuration field."
    },
    "error_9cdf4dd899a5": {
        "zh_CN": "value 必须是有限数值或字符串。",
        "en": "value must be a finite number or a string."
    },
    "error_121304037ac4": {
        "zh_CN": "新 value 字符串不得超过 65536 字符；已有的超长值可以保留或缩短。",
        "en": "New value strings must have at most 65536 characters; longer saved values may be retained or shortened."
    },
    "error_f50a6f76b537": {
        "zh_CN": "param 必须是字符串数组。",
        "en": "param must be an array of strings."
    },
    "error_8791d0b816d8": {
        "zh_CN": "新关键词不得超过 4096 字符，总数不得超过 200 个；已有超限内容可以保留或移除，但不能继续增加。",
        "en": "New keywords must have at most 4096 characters and at most 200 entries; oversized saved entries may be retained or removed without growing the list."
    },
    "error_1e3894b312fe": {
        "zh_CN": "keyword_filter_enabled 必须是布尔值。",
        "en": "keyword_filter_enabled must be boolean."
    },
    "error_d0c3a182689b": {
        "zh_CN": "Hook 开关值必须为 0 或 1。",
        "en": "Hook switches must be 0 or 1."
    },
    "error_1dfcb1208ad2": {
        "zh_CN": "请提供非负整数 tabId。",
        "en": "A nonnegative integer tabId is required."
    },
    "error_2409d21cc3f9": {
        "zh_CN": "目标标签页已不存在。",
        "en": "The requested tab no longer exists."
    },
    "error_5dfe0aba286b": {
        "zh_CN": "只能准备扩展内置脚本。",
        "en": "Only packaged catalog scripts can be prepared."
    },
    "error_82191793d3c4": {
        "zh_CN": "无法读取内置脚本。",
        "en": "Could not read a packaged script."
    },
    "error_fa487ac318e2": {
        "zh_CN": "URL 类型无效",
        "en": "Invalid URL type"
    },
    "error_290c4e799a8c": {
        "zh_CN": "url 必须是完整的 HTTP(S) 地址。",
        "en": "url must be an absolute HTTP(S) URL."
    },
    "error_e44d1e59f60e": {
        "zh_CN": "脚本准备需要 HTTP(S) 目标地址。",
        "en": "Script preparation requires an HTTP(S) target URL."
    },
    "error_61725a133c97": {
        "zh_CN": "请先修正无效的 Hook 配置，再准备导航脚本。",
        "en": "Correct the invalid Hook settings before preparing navigation scripts."
    },
    "error_ee694456daf5": {
        "zh_CN": "配置已改变，请重新读取后再试。",
        "en": "Configuration changed; read state and retry."
    },
    "error_d7e77decdaf6": {
        "zh_CN": "apply 必须为 next_navigation 或 reload。",
        "en": "apply must be next_navigation or reload."
    },
    "error_c7ea21c6c51f": {
        "zh_CN": "脚本注册失败，已保存的配置将在重试时重新同步。",
        "en": "Script registration failed; the saved configuration will be retried."
    },
    "error_cd4042420b8e": {
        "zh_CN": "配置已保存，但无法刷新目标页面。",
        "en": "Configuration was saved, but the target could not be reloaded."
    },
    "error_757d4e7f5c30": {
        "zh_CN": "scope 必须为 hostname 或 global。",
        "en": "scope must be hostname or global."
    },
    "error_f12de98cdfaf": {
        "zh_CN": "按网站设置脚本需要 HTTP(S) 页面；文件网址请使用全局模式。",
        "en": "Hostname script settings require an HTTP(S) page; use global scope for file URLs."
    },
    "error_499bc74ba59b": {
        "zh_CN": "apply=reload 时必须提供 tabId。",
        "en": "tabId is required for apply=reload."
    },
    "error_d72f99101b3f": {
        "zh_CN": "mode 必须为 standard 或 global。",
        "en": "mode must be standard or global."
    },
    "error_444e2811f3dd": {
        "zh_CN": "扩展无法检查此页面。启用扩展后，请刷新普通网页再试。",
        "en": "The extension cannot inspect this page. Reload an ordinary web page after enabling the extension."
    },
    "error_0750dbbc1c7d": {
        "zh_CN": "浏览器未提供文档标识。",
        "en": "The browser did not provide a document identity."
    },
    "error_067aaeca7569": {
        "zh_CN": "仅支持浏览器标签页的顶层页面。",
        "en": "Only the top frame of a browser tab is supported."
    },
    "error_b45375754e2a": {
        "zh_CN": "需要浏览器提供的 documentId。",
        "en": "A browser-supplied documentId is required."
    },
    "error_5bf65b4a3430": {
        "zh_CN": "此文档已被导航替换。",
        "en": "This document was replaced by navigation."
    },
    "error_c1ff9d0ae25e": {
        "zh_CN": "收到来自旧文档的消息。",
        "en": "A message came from an old document."
    },
    "error_71e9f13ffcd6": {
        "zh_CN": "验证消息时，有更新的文档完成了初始化。",
        "en": "A newer document became ready while this message was being verified."
    },
    "error_ddb76c1c400e": {
        "zh_CN": "路由数据无效。",
        "en": "Invalid route data."
    },
    "error_3c822f04e171": {
        "zh_CN": "路由数据超过 2 MiB。",
        "en": "Route data exceeds 2 MiB."
    },
    "error_437b59d96a58": {
        "zh_CN": "配置应用确认数据无效。",
        "en": "Invalid applied-config acknowledgement."
    },
    "error_ebfc907f3ef1": {
        "zh_CN": "Hook 事件无效或超过 256 KiB。",
        "en": "Hook event is invalid or exceeds 256 KiB."
    },
    "error_40a4fee700ca": {
        "zh_CN": "等待路由数据时，页面发生了变化。",
        "en": "The page changed while waiting for route data."
    },
    "error_154b918579a3": {
        "zh_CN": "等待路由数据时，页面地址发生了变化。",
        "en": "The page URL changed while waiting for route data."
    },
    "error_5b00243cce5f": {
        "zh_CN": "timeoutMs 必须介于 100 和 30000 之间。",
        "en": "timeoutMs must be between 100 and 30000."
    },
    "error_99a0989568c2": {
        "zh_CN": "请刷新页面以加载扩展内容桥接脚本。",
        "en": "Reload the page to load the extension content bridge."
    },
    "error_42f4b619183c": {
        "zh_CN": "framework 必须为 vue、react 或 all。",
        "en": "framework must be vue, react, or all."
    },
    "error_d18cb2e147a8": {
        "zh_CN": "nonce 必须为 null 或 8–256 个字符的字符串。",
        "en": "nonce must be null or a string of 8–256 characters."
    },
    "error_76321ad7830b": {
        "zh_CN": "无法为浏览器连接标记此页面。",
        "en": "Could not mark this page for the browser connection."
    },
    "error_32fd1ae482c0": {
        "zh_CN": "params 必须为对象。",
        "en": "params must be an object."
    },
    "error_9a55d76ef4d7": {
        "zh_CN": "此扩展不支持浏览器控制。",
        "en": "This extension does not support browser control."
    },
    "error_6b052106aebd": {
        "zh_CN": "脚本库列表不接受额外参数。",
        "en": "The script list does not accept additional parameters."
    },
    "error_3cceddb75ebe": {
        "zh_CN": "查看和编辑脚本仅接受扩展页面的操作。",
        "en": "Viewing and editing scripts requires an extension page."
    },
    "error_a14fc07448ff": {
        "zh_CN": "请提供脚本 id、当前脚本库 expectedRevision，以及 code、name、matches 中至少一项，不接受其他参数。",
        "en": "Provide id, the current library expectedRevision, and at least one of code, name or matches; no other parameters are accepted."
    },
    "error_122487c85048": {
        "zh_CN": "查看脚本仅接受 id 参数。",
        "en": "Viewing a script accepts only id."
    },
    "error_ebfb49c7c2de": {
        "zh_CN": "脚本库已改变，请读取后重试。",
        "en": "The script library changed. Read it again and retry."
    },
    "error_2092762a5a91": {
        "zh_CN": "删除脚本仅接受扩展页面的操作。",
        "en": "Deleting scripts requires an extension page."
    },
    "error_094faa13dd04": {
        "zh_CN": "请提供脚本 id 和当前脚本库 expectedRevision，不接受额外参数。",
        "en": "Provide id and the current library expectedRevision; no additional parameters are accepted."
    },
    "error_06a5150feaff": {
        "zh_CN": "此开关仅接受扩展页面的操作。",
        "en": "This switch can only be changed from an extension page."
    },
    "error_a3fbe3a731b7": {
        "zh_CN": "请提供脚本 id、布尔值 enabled 和当前脚本库 expectedRevision，不接受额外参数。",
        "en": "Provide id, a boolean enabled and the current library expectedRevision; no additional parameters are accepted."
    },
    "error_77c8ebc40866": {
        "zh_CN": "脚本库仅接受已配对 Agent 的 MCP 操作。",
        "en": "Script library management requires a paired Agent MCP connection."
    },
    "error_80e16ff9f182": {
        "zh_CN": "MCP 连接已停止或配对已改变，本次脚本库修改已取消。",
        "en": "The MCP connection stopped or pairing changed. This library modification was canceled."
    },
    "error_e80fc5b94fb9": {
        "zh_CN": "请先在扩展 MCP 页面启用或重新启用浏览器控制，再修改脚本库。",
        "en": "Enable or re-enable browser control in the extension MCP panel before modifying the script library."
    },
    "error_83c2b1a718e5": {
        "zh_CN": "未知的扩展命令。",
        "en": "Unknown extension command."
    },
    "error_46245f775d45": {
        "zh_CN": "请打开 chrome://extensions，在 AntiDebug Breaker 的“详情”中开启“允许用户脚本”（Chrome 138 及以上）；Chrome 120–137 请开启扩展页的“开发者模式”。开关开启后重试；必要时重新加载扩展。",
        "en": "Open chrome://extensions, open AntiDebug Breaker Details and enable Allow User Scripts (Chrome 138+). On Chrome 120–137, enable Developer mode. Retry after enabling access; reload the extension if needed."
    },
    "error_aa2ac71dd5b9": {
        "zh_CN": "脚本 id 必须为 1–100 位字母、数字、下划线或连字符。",
        "en": "Script id must contain 1–100 letters, digits, underscores or hyphens."
    },
    "error_f257a5437775": {
        "zh_CN": "matches 必须包含 1–20 个指定网站的 HTTP(S) 匹配模式。",
        "en": "matches must contain 1–20 HTTP(S) match patterns for specific websites."
    },
    "error_bf1264932ea8": {
        "zh_CN": "仅支持指定主机的 HTTP(S) 模式，例如 https://example.com/* 或 *://*.example.com/*；不支持全站通配。",
        "en": "Use HTTP(S) patterns for specific hosts, such as https://example.com/* or *://*.example.com/*. All-site wildcards are not supported."
    },
    "error_2a1f371f637d": {
        "zh_CN": "首版仅执行普通 JavaScript，固定 document_start，不提供 @require、GM_* 授权或其他运行时机。",
        "en": "Only plain JavaScript at document_start is supported. @require, GM_* grants and other run times are not supported."
    },
    "error_7fe751502d61": {
        "zh_CN": "脚本名称必须为 1–200 个字符。",
        "en": "Script name must contain 1–200 characters."
    },
    "error_9082d1764fc0": {
        "zh_CN": "脚本源码不能为空，且不得超过 131072 字符或 128 KiB UTF-8。",
        "en": "Script source must not be empty or exceed 131072 characters or 128 KiB in UTF-8."
    },
    "error_78c37bc7972d": {
        "zh_CN": "enabled 必须为布尔值。",
        "en": "enabled must be a boolean."
    },
    "error_4dba46ffdf27": {
        "zh_CN": "已保存的脚本库格式无效，未覆盖原数据。",
        "en": "The saved script library format is invalid. The original data was not overwritten."
    },
    "error_718389a38b9f": {
        "zh_CN": "脚本库最多保存 50 个脚本，总大小不得超过 2 MiB。",
        "en": "The library supports up to 50 scripts and 2 MiB in total."
    },
    "error_aa1f3ed55379": {
        "zh_CN": "脚本库包含重复 id 或无效版本。",
        "en": "The library contains duplicate ids or invalid revisions."
    },
    "error_25ccb2dfda67": {
        "zh_CN": "chrome.userScripts 不可用。",
        "en": "chrome.userScripts is unavailable."
    },
    "error_52148b46309a": {
        "zh_CN": "action 必须为 list、get、save、enable、disable 或 delete。",
        "en": "action must be list, get, save, enable, disable or delete."
    },
    "error_e4de94c5fa88": {
        "zh_CN": "tabId 必须为非负整数。",
        "en": "tabId must be a nonnegative integer."
    },
    "error_813048ed1d43": {
        "zh_CN": "脚本库仅在下一次页面加载时应用；需要立即应用时请通过 MCP 受控刷新。",
        "en": "Library changes apply on the next page load. Use an MCP controlled reload to apply them now."
    },
    "error_7c1507c083fa": {
        "zh_CN": "expectedRevision 必须为非负整数。",
        "en": "expectedRevision must be a nonnegative integer."
    },
    "error_12518e8b87c2": {
        "zh_CN": "脚本库保存失败，注册未改变。",
        "en": "The script library could not be saved. Registrations were not changed."
    },
    "error_20b8f7b6d07a": {
        "zh_CN": "timeoutMs 必须是 1–30000 之间的整数。",
        "en": "timeoutMs must be an integer between 1 and 30000."
    },
    "error_b840a156b453": {
        "zh_CN": "Chrome 调试操作超时。",
        "en": "The Chrome debugger operation timed out."
    },
    "error_d7ddbc25b4c7": {
        "zh_CN": "被调试的标签页已关闭。",
        "en": "The debugged tab was closed."
    },
    "error_936e15a2e5c1": {
        "zh_CN": "需要已认证的 MCP 桥接连接。",
        "en": "An authenticated MCP bridge connection is required."
    },
    "error_766edf530d2d": {
        "zh_CN": "扩展缺少 manifest 中的 debugger 权限。请重新加载当前版本扩展。",
        "en": "The extension needs the debugger manifest permission. Reload the current extension build."
    },
    "error_ac6cfd0cf299": {
        "zh_CN": "请打开扩展 MCP 面板，点击“重新启用浏览器控制”；如 MCP 已停止，请点击“启用 MCP 并允许 Agent 控制浏览器”。",
        "en": "Open the extension MCP panel and click \"Re-enable browser control\", or \"Enable MCP and allow browser control\" if MCP is stopped."
    },
    "error_ee3ac01a0571": {
        "zh_CN": "Chrome debugger API 不可用。",
        "en": "The Chrome debugger API is unavailable."
    },
    "error_07c8bef2779e": {
        "zh_CN": "此标签页的地址不受支持。",
        "en": "The tab does not have a supported URL."
    },
    "error_18bbc90cf220": {
        "zh_CN": "无法调试 Chrome 应用商店页面。",
        "en": "Chrome Web Store pages cannot be debugged."
    },
    "error_b3f72695d95c": {
        "zh_CN": "调试本地文件前，请在扩展详情中开启“允许访问文件网址”。",
        "en": "Enable access to file URLs in the extension details before debugging a local file."
    },
    "error_f01e9724e1e5": {
        "zh_CN": "仅支持 HTTP、HTTPS、已授权的文件网址和 about:blank 标签页。",
        "en": "Only HTTP, HTTPS, allowed file URLs and about:blank tabs can be debugged."
    },
    "error_d76b9a2876e1": {
        "zh_CN": "Cookie 操作需要当前页面使用 HTTP(S)。",
        "en": "Cookie operations require a current HTTP(S) page."
    },
    "error_ea12d3de5146": {
        "zh_CN": "Storage.getCookies 不接受参数。",
        "en": "Storage.getCookies does not accept parameters."
    },
    "error_c6a85e61128d": {
        "zh_CN": "Network.getCookies 需要 1–1000 个与当前页面同源的 URL。",
        "en": "Network.getCookies requires between 1 and 1000 current-origin URLs."
    },
    "error_ca52d2065ca5": {
        "zh_CN": "Cookie URL 必须是完整地址，且不含登录凭据或片段。",
        "en": "Cookie URLs must be absolute URLs without credentials or fragments."
    },
    "error_eef0cba15735": {
        "zh_CN": "Cookie URL 必须与当前页面同源。",
        "en": "Cookie URLs must use the current page origin."
    },
    "error_9e1758d43a2e": {
        "zh_CN": "为避免影响其他 Cookie 分区，清理 Cookie 需要 Chrome 138 或更高版本。",
        "en": "Cookie clearing requires Chrome 138 or newer to preserve other cookie partitions."
    },
    "error_388281b3f31c": {
        "zh_CN": "删除 Cookie 需要准确的 name、domain 和 path，可选提供 partitionKey。",
        "en": "Cookie deletion requires an exact name, domain and path, with an optional partitionKey."
    },
    "error_11b8f1def80a": {
        "zh_CN": "Cookie domain 必须是准确的主机名，可带前导点。",
        "en": "The cookie domain must be an exact hostname, optionally prefixed with a dot."
    },
    "error_9cd4fe788a7b": {
        "zh_CN": "只能删除与当前页面主机名匹配的 Cookie。",
        "en": "Only cookies matching the current page hostname can be deleted."
    },
    "error_15028637d4d0": {
        "zh_CN": "partitionKey 需要 topLevelSite 和 hasCrossSiteAncestor: false。",
        "en": "partitionKey requires topLevelSite and hasCrossSiteAncestor: false."
    },
    "error_c9e1f7eb5398": {
        "zh_CN": "partitionKey.topLevelSite 必须是 HTTP(S) 站点，且不含凭据、端口或路径。",
        "en": "partitionKey.topLevelSite must be an HTTP(S) site without credentials, port or path."
    },
    "error_0b9fd4b3d463": {
        "zh_CN": "只能删除当前顶层站点分区中的 Cookie。",
        "en": "Only the current top-level site cookie partition can be deleted."
    },
    "error_9d7e036a8671": {
        "zh_CN": "Chrome 没有返回 Cookie 列表。",
        "en": "Chrome did not return a cookie list."
    },
    "error_3d5ab9300c93": {
        "zh_CN": "调试会话已改变，请重新附加目标标签页。",
        "en": "The debugger session changed. Attach the tab again."
    },
    "error_f45ae20f4de1": {
        "zh_CN": "请使用当前调试附加返回的 sessionId。",
        "en": "Use the sessionId returned by the current debugger attach."
    },
    "error_8a5bd2493a78": {
        "zh_CN": "新建标签页需要完整 url，可选提供布尔值 active。",
        "en": "New tabs require an absolute url and an optional boolean active."
    },
    "error_e36f5f0b54f8": {
        "zh_CN": "创建标签页时浏览器控制状态发生了变化。",
        "en": "Browser control changed while creating the tab."
    },
    "error_d5782ab09d4f": {
        "zh_CN": "Chrome 未返回新标签页标识。重试前请检查标签页列表。",
        "en": "Chrome did not return the new tab identity. Check the tab list before retrying."
    },
    "error_0fdb541a2361": {
        "zh_CN": "创建标签页超时。重试前请检查标签页列表。",
        "en": "Tab creation timed out. Check the tab list before retrying."
    },
    "error_977e35eabf29": {
        "zh_CN": "上一次调试附加仍在释放，请稍后重试。",
        "en": "The previous debugger attachment is still being released. Retry shortly."
    },
    "error_3ce73d0b4347": {
        "zh_CN": "扩展通道不支持此 CDP 方法。",
        "en": "This CDP method is not available through the extension transport."
    },
    "error_562283c622c3": {
        "zh_CN": "CDP params 必须为对象。",
        "en": "CDP params must be an object."
    },
    "error_8e9133370b44": {
        "zh_CN": "仅附加标签页的根会话可以接收命令。",
        "en": "Only the attached tab root session can receive commands."
    },
    "error_43b03edfec4a": {
        "zh_CN": "命令在发送到 Chrome 前已超时。",
        "en": "The command expired before it could be sent to Chrome."
    },
    "error_2677b71834b8": {
        "zh_CN": "命令在完成 Cookie 分区验证前已超时。",
        "en": "The command expired before cookie partition verification finished."
    },
    "error_8b225b07bc75": {
        "zh_CN": "Chrome 无法验证此 Cookie 属于当前页面分区。",
        "en": "Chrome could not verify this cookie belongs to the current page partition."
    },
    "error_0e83331635a3": {
        "zh_CN": "验证 Cookie 分区时页面发生了变化。",
        "en": "The page changed while verifying the cookie partition."
    },
    "error_442c5eecb244": {
        "zh_CN": "命令在删除 Cookie 前已超时。",
        "en": "The command expired before the cookie could be deleted."
    },
    "error_b9302bfb67c8": {
        "zh_CN": "MCP 调试会话已断开。",
        "en": "The MCP debugger session was detached."
    },
    "error_71667923e1b5": {
        "zh_CN": "MCP 桥接地址无效。",
        "en": "MCP bridge URL is invalid."
    },
    "error_7f64a3f165b0": {
        "zh_CN": "MCP 桥接必须使用本机回环 WebSocket 地址，且不含登录凭据、查询参数或片段。",
        "en": "MCP bridge must use a loopback WebSocket URL without credentials, query, or fragment."
    },
    "error_9a2057ed28a1": {
        "zh_CN": "MCP 配对密钥必须包含 32–256 个字符。",
        "en": "An MCP pairing token of 32–256 characters is required."
    },
    "error_6d4e0333c875": {
        "zh_CN": "扩展结果超过了桥接消息大小限制。",
        "en": "The extension result exceeds the bridge message limit."
    },
    "error_8ee33d0d8792": {
        "zh_CN": "同一请求 ID 不能用于不同的命令。",
        "en": "A request ID cannot identify different commands."
    },
    "error_395190ba26b4": {
        "zh_CN": "此大型结果已交付。请先检查状态，再发起新请求。",
        "en": "This large result was already delivered. Inspect state before issuing a new request."
    },
    "error_de2f65701e7f": {
        "zh_CN": "无法加载扩展脚本目录。",
        "en": "Could not load the extension script catalog."
    },
    "error_069f91b95b96": {
        "zh_CN": "控制命令仅接受扩展页面调用。",
        "en": "Control commands are accepted only from extension pages."
    },
    "error_283a991ad921": {
        "zh_CN": "需要可信的扩展内容脚本发送者。",
        "en": "A trusted extension content sender is required."
    },
    "error_dc5ac430189a": {
        "zh_CN": "[AntiDebug] 配置更新失败：",
        "en": "[AntiDebug] Configuration update failed:"
    },
    "error_e49a96952fa1": {
        "zh_CN": "[AntiDebug] 脚本库恢复失败：",
        "en": "[AntiDebug] Script library restore failed:"
    },
    "error_703774fec2dd": {
        "zh_CN": "[AntiDebug] 欢迎页打开失败：",
        "en": "[AntiDebug] Welcome redirect failed:"
    },
    "error_60775bbe5bc3": {
        "zh_CN": "[AntiDebug] 后台初始化失败：",
        "en": "[AntiDebug] Background initialization failed:"
    },
    "error_library_entry": {
        "zh_CN": "脚本条目格式无效。",
        "en": "Invalid script entry format."
    },
    "error_library_read": {
        "zh_CN": "无法读取已保存的脚本库。",
        "en": "Could not read the saved script library."
    },
    "error_library_field": {
        "zh_CN": "此操作不支持该参数。",
        "en": "This operation does not support that parameter."
    },
    "error_library_missing": {
        "zh_CN": "脚本库中没有该 id。",
        "en": "The script library does not contain this id."
    },
    "error_library_revision_limit": {
        "zh_CN": "脚本库版本号已达到上限。",
        "en": "The script library revision limit has been reached."
    }
};
    I.register(messages);
    if (typeof module === 'object' && module.exports) module.exports = messages;
})(globalThis);
