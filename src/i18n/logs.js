(() => {
    'use strict';
    globalThis[Symbol.for('antidebug-breaker.i18n')]?.register({
    "log_anti_hook_parse_failed": {
        "zh_CN": "AntiAnti_Hook: 解析Hooks列表失败",
        "en": "AntiAnti_Hook: Failed to parse the Hooks list"
    },
    "log_vue_before_guard_removed": {
        "zh_CN": "%c存在全局前置路由守卫并已清除",
        "en": "%cGlobal beforeEach navigation guard detected and removed"
    },
    "log_vue_resolve_guard_removed": {
        "zh_CN": "%c存在全局解析守卫并已清除",
        "en": "%cGlobal beforeResolve navigation guard detected and removed"
    },
    "log_vue_devtools_enabled": {
        "zh_CN": "[AntiDebug Breaker] Vue Devtools已开启，Vue版本：{0}",
        "en": "[AntiDebug Breaker] Vue Devtools enabled; Vue version: {0}"
    },
    "log_react_already_running": {
        "zh_CN": "[AntiDebug] React 路由获取脚本已在运行，跳过本次执行",
        "en": "[AntiDebug] React route collector is already running; skipping this execution"
    },
    "log_react_lock_failed": {
        "zh_CN": "[AntiDebug] 无法设置执行锁，脚本可能已在运行",
        "en": "[AntiDebug] Could not acquire the execution lock; the script may already be running"
    },
    "log_react_routes_not_serializable": {
        "zh_CN": "[AntiDebug] 路由数据包含不可序列化的对象，无法传递给插件",
        "en": "[AntiDebug] Route data contains non-serializable objects and cannot be sent to the extension"
    },
    "log_react_routes_serialization_error": {
        "zh_CN": "路由数据包含不可序列化的对象，请查看控制台输出",
        "en": "Route data contains non-serializable objects; see the console output"
    },
    "log_post_message_failed": {
        "zh_CN": "[AntiDebug] postMessage 发送失败:",
        "en": "[AntiDebug] postMessage failed:"
    },
    "log_react_rescan": {
        "zh_CN": "[AntiDebug] 开始重新扫描 React Router...",
        "en": "[AntiDebug] Rescanning React Router..."
    },
    "log_react_mount_found": {
        "zh_CN": "[AntiDebug] 检测到 React 挂载节点：{0} on",
        "en": "[AntiDebug] React mount detected: {0} on"
    },
    "log_react_root_internal": {
        "zh_CN": "[AntiDebug] _reactRootContainer（方式 A: _internalRoot）startFiber:",
        "en": "[AntiDebug] _reactRootContainer (method A: _internalRoot) startFiber:"
    },
    "log_react_root_direct": {
        "zh_CN": "[AntiDebug] _reactRootContainer（方式 B: direct current）startFiber:",
        "en": "[AntiDebug] _reactRootContainer (method B: direct current) startFiber:"
    },
    "log_react_root_unknown": {
        "zh_CN": "[AntiDebug] _reactRootContainer 结构未识别:",
        "en": "[AntiDebug] Unrecognized _reactRootContainer structure:"
    },
    "log_react_start_fiber_failed": {
        "zh_CN": "[AntiDebug] getStartFiber 出错:",
        "en": "[AntiDebug] getStartFiber failed:"
    },
    "log_react_host_fibers_found": {
        "zh_CN": "[AntiDebug] 检测到 {0} 个 React Host Fiber 节点",
        "en": "[AntiDebug] Found {0} React Host Fiber node(s)"
    },
    "log_react_host_start_failed": {
        "zh_CN": "[AntiDebug] getStartFiberFromHostFiber 出错:",
        "en": "[AntiDebug] getStartFiberFromHostFiber failed:"
    },
    "log_react_instances": {
        "zh_CN": "[AntiDebug] React 实例列表（{0} 个）",
        "en": "[AntiDebug] React instances ({0})"
    },
    "log_react_instance_source": {
        "zh_CN": "[AntiDebug] React 实例 #{0} 来源={1} 入口组件={2}",
        "en": "[AntiDebug] React instance #{0} source={1} entry component={2}"
    },
    "log_react_raw_host_fiber": {
        "zh_CN": "[AntiDebug] React 实例 #{0} 原始 Host Fiber:",
        "en": "[AntiDebug] React instance #{0} raw Host Fiber:"
    },
    "log_vue_already_running": {
        "zh_CN": "⚠️ Vue获取脚本已在运行中，跳过本次执行",
        "en": "⚠️ Vue collector is already running; skipping this execution"
    },
    "log_vue_lock_failed": {
        "zh_CN": "⚠️ 无法设置执行锁，脚本可能已在运行",
        "en": "⚠️ Could not acquire the execution lock; the script may already be running"
    },
    "log_vue_routes_not_serializable": {
        "zh_CN": "[AntiDebug] 路由数据包含不可序列化的对象（如Symbol），无法传递给插件",
        "en": "[AntiDebug] Route data contains non-serializable objects (such as Symbol) and cannot be sent to the extension"
    },
    "log_routes_see_console": {
        "zh_CN": "[AntiDebug] 请查看控制台输出的路由列表",
        "en": "[AntiDebug] See the route list in the console"
    },
    "log_vue_routes_serialization_error": {
        "zh_CN": "路由数据包含不可序列化的对象（如Symbol），无法传递给插件，请查看控制台输出",
        "en": "Route data contains non-serializable objects (such as Symbol) and cannot be sent to the extension; see the console output"
    },
    "log_error_message_send_failed": {
        "zh_CN": "[AntiDebug] 发送错误消息也失败:",
        "en": "[AntiDebug] Sending the error message also failed:"
    },
    "log_vue_post_message_failed": {
        "zh_CN": "[AntiDebug] postMessage发送失败:",
        "en": "[AntiDebug] postMessage failed:"
    },
    "log_vue_rescan": {
        "zh_CN": "🔄 开始重新扫描Vue实例...",
        "en": "🔄 Rescanning Vue instances..."
    },
    "log_router_refresh_failed": {
        "zh_CN": "获取Router最新数据时出错:",
        "en": "Failed to retrieve the latest Router data:"
    },
    "log_router_mode_failed": {
        "zh_CN": "检测路由模式时出错:",
        "en": "Failed to detect the routing mode:"
    },
    "log_router_base_failed": {
        "zh_CN": "提取Router基础路径时出错:",
        "en": "Failed to extract the Router base path:"
    },
    "log_router_list_unavailable": {
        "zh_CN": "🚫 无法列出路由信息",
        "en": "🚫 Could not list routes"
    },
    "log_router_list_failed": {
        "zh_CN": "获取路由列表时出错:",
        "en": "Failed to retrieve the route list:"
    },
    "log_router_instance_failed": {
        "zh_CN": "获取Router实例时出错:",
        "en": "Failed to retrieve the Router instance:"
    },
    "log_vue_routes_title": {
        "zh_CN": "\n📋 Vue Router 路由列表 [实例 {0} - Vue {1} - {2} 模式]：",
        "en": "\n📋 Vue Router routes [instance {0} - Vue {1} - {2} mode]:"
    },
    "log_vue_instance_title": {
        "zh_CN": "\n🔗 Vue Router 实例 [{0}]：",
        "en": "\n🔗 Vue Router instance [{0}]:"
    },
    "log_vue_router_not_found": {
        "zh_CN": "❌ 未找到任何含Router的Vue实例",
        "en": "❌ No Vue instance with a Router was found"
    },
    "log_cookie_set": {
        "zh_CN": "设置cookie：\n",
        "en": "Setting cookie:\n"
    },
    "log_cookie_set_matched": {
        "zh_CN": "捕获到设置cookie ---> {0}\n值：{1}",
        "en": "Matched cookie write ---> {0}\nValue: {1}"
    },
    "log_unavailable": {
        "zh_CN": "未获取到",
        "en": "Unavailable"
    },
    "log_symmetric_encrypt_output": {
        "zh_CN": "对称加密后的密文：",
        "en": "Symmetric encryption ciphertext:"
    },
    "log_symmetric_encrypt_output_unavailable": {
        "zh_CN": "对称加密后的密文：由于toString方法并未获取到，请自行使用上方打印的对象进行toString调用输出密文。",
        "en": "Symmetric encryption ciphertext: toString was unavailable. Call toString on the object logged above to obtain the ciphertext."
    },
    "log_symmetric_encrypt_key": {
        "zh_CN": "对称加密Hex key：",
        "en": "Symmetric encryption key (Hex):"
    },
    "log_symmetric_encrypt_key_unavailable": {
        "zh_CN": "对称加密Hex key：由于toString方法并未获取到，请自行使用上方打印的对象进行toString调用输出key。",
        "en": "Symmetric encryption key (Hex): toString was unavailable. Call toString on the object logged above to obtain the key."
    },
    "log_symmetric_encrypt_iv": {
        "zh_CN": "对称加密Hex iv：",
        "en": "Symmetric encryption IV (Hex):"
    },
    "log_symmetric_encrypt_iv_unavailable": {
        "zh_CN": "对称加密Hex iv：由于toString方法并未获取到，请自行使用上方打印的对象进行toString调用输出iv。",
        "en": "Symmetric encryption IV (Hex): toString was unavailable. Call toString on the object logged above to obtain the IV."
    },
    "log_symmetric_encrypt_no_iv": {
        "zh_CN": "对称加密时未用到iv",
        "en": "Symmetric encryption did not use an IV"
    },
    "log_symmetric_encrypt_padding": {
        "zh_CN": "对称加密时的填充模式：",
        "en": "Symmetric encryption padding:"
    },
    "log_symmetric_encrypt_mode": {
        "zh_CN": "对称加密时的运算模式：",
        "en": "Symmetric encryption mode:"
    },
    "log_symmetric_encrypt_key_length": {
        "zh_CN": "对称加密时的密钥长度：",
        "en": "Symmetric encryption key length:"
    },
    "log_symmetric_parameters_fallback_title": {
        "zh_CN": "如果上方正常输出了对称加密的key、iv等加密参数可忽略本条信息。",
        "en": "Ignore this message if the key, IV and other encryption parameters were printed above."
    },
    "log_symmetric_parameters_fallback": {
        "zh_CN": "对称加密：由于一些必要因素导致未能输出key、iv等加密参数，请自行使用上方打印的对象进行toString调用输出key、iv等加密参数。",
        "en": "Symmetric encryption: the key, IV or other parameters could not be printed. Call toString on the objects logged above to inspect the parameters."
    },
    "log_symmetric_decrypt_key": {
        "zh_CN": "对称解密Hex key：",
        "en": "Symmetric decryption key (Hex):"
    },
    "log_symmetric_decrypt_key_unavailable": {
        "zh_CN": "对称解密Hex key：由于toString方法并未获取到，请自行使用上方打印的对象进行toString调用输出key。",
        "en": "Symmetric decryption key (Hex): toString was unavailable. Call toString on the object logged above to obtain the key."
    },
    "log_symmetric_decrypt_iv": {
        "zh_CN": "对称解密Hex iv：",
        "en": "Symmetric decryption IV (Hex):"
    },
    "log_symmetric_decrypt_iv_unavailable": {
        "zh_CN": "对称解密Hex iv：由于toString方法并未获取到，请自行使用上方打印的对象进行toString调用输出iv。",
        "en": "Symmetric decryption IV (Hex): toString was unavailable. Call toString on the object logged above to obtain the IV."
    },
    "log_symmetric_decrypt_no_iv": {
        "zh_CN": "对称解密时未用到iv",
        "en": "Symmetric decryption did not use an IV"
    },
    "log_symmetric_decrypt_padding": {
        "zh_CN": "对称解密时的填充模式：",
        "en": "Symmetric decryption padding:"
    },
    "log_symmetric_decrypt_mode": {
        "zh_CN": "对称解密时的运算模式：",
        "en": "Symmetric decryption mode:"
    },
    "log_crypto_fuzz_reference": {
        "zh_CN": "可使用我的脚本进行fuzz加解密参数（算法、模式、填充方式等）：https://github.com/0xsdeo/Fuzz_Crypto_Algorithms",
        "en": "A script for testing encryption/decryption parameters (algorithm, mode, padding, etc.): https://github.com/0xsdeo/Fuzz_Crypto_Algorithms"
    },
    "log_hash_input": {
        "zh_CN": "哈希/HMAC 加密 原始数据：",
        "en": "Hash/HMAC input:"
    },
    "log_hash_output": {
        "zh_CN": "哈希/HMAC 加密 密文：",
        "en": "Hash/HMAC output:"
    },
    "log_hash_output_length": {
        "zh_CN": "哈希/HMAC 加密 密文长度：",
        "en": "Hash/HMAC output length:"
    },
    "log_hmac_key_unavailable": {
        "zh_CN": "注：如果是HMAC加密，本脚本是hook不到密钥的，需自行查找。",
        "en": "Note: This Hook does not capture the HMAC key; locate the key separately."
    },
    "log_fetch_request": {
        "zh_CN": "捕获到fetch请求：\n",
        "en": "Captured fetch request:\n"
    },
    "log_rsa_public_key": {
        "zh_CN": "RSA 公钥：\n",
        "en": "RSA public key:\n"
    },
    "log_rsa_encrypt_input": {
        "zh_CN": "RSA加密 原始数据：",
        "en": "RSA encryption input:"
    },
    "log_rsa_encrypt_output": {
        "zh_CN": "RSA加密 Base64 密文：",
        "en": "RSA encryption ciphertext (Base64):"
    },
    "log_rsa_private_key": {
        "zh_CN": "RSA 私钥：\n",
        "en": "RSA private key:\n"
    },
    "log_rsa_decrypt_input": {
        "zh_CN": "RSA解密 Base64 原始数据：",
        "en": "RSA decryption input (Base64):"
    },
    "log_rsa_decrypt_output": {
        "zh_CN": "RSA解密 明文：",
        "en": "RSA decryption plaintext:"
    },
    "log_sm2_encrypt_input": {
        "zh_CN": "SM2 加密明文:",
        "en": "SM2 encryption plaintext:"
    },
    "log_sm2_encrypt_key": {
        "zh_CN": "SM2 加密公钥:",
        "en": "SM2 encryption public key:"
    },
    "log_sm2_encrypt_output": {
        "zh_CN": "SM2 加密密文:",
        "en": "SM2 encryption ciphertext:"
    },
    "log_sm2_decrypt_input": {
        "zh_CN": "SM2 解密密文:",
        "en": "SM2 decryption ciphertext:"
    },
    "log_sm2_decrypt_key": {
        "zh_CN": "SM2 解密私钥:",
        "en": "SM2 decryption private key:"
    },
    "log_sm2_decrypt_output": {
        "zh_CN": "SM2 解密明文:",
        "en": "SM2 decryption plaintext:"
    },
    "log_sm4_encrypt_input": {
        "zh_CN": "SM4 加密明文:",
        "en": "SM4 encryption plaintext:"
    },
    "log_sm4_encrypt_key": {
        "zh_CN": "SM4 加密key:",
        "en": "SM4 encryption key:"
    },
    "log_sm4_encrypt_format": {
        "zh_CN": "SM4 加密数据格式:",
        "en": "SM4 encryption data format:"
    },
    "log_sm4_encrypt_iv": {
        "zh_CN": "SM4 加密iv:",
        "en": "SM4 encryption IV:"
    },
    "log_sm4_encrypt_mode": {
        "zh_CN": "SM4 加密模式:",
        "en": "SM4 encryption mode:"
    },
    "log_sm4_encrypt_output": {
        "zh_CN": "SM4 加密密文：",
        "en": "SM4 encryption ciphertext:"
    },
    "log_sm4_decrypt_input": {
        "zh_CN": "SM4 解密密文:",
        "en": "SM4 decryption ciphertext:"
    },
    "log_sm4_decrypt_key": {
        "zh_CN": "SM4 解密key:",
        "en": "SM4 decryption key:"
    },
    "log_sm4_decrypt_format": {
        "zh_CN": "SM4 解密数据格式:",
        "en": "SM4 decryption data format:"
    },
    "log_sm4_decrypt_iv": {
        "zh_CN": "SM4 解密iv:",
        "en": "SM4 decryption IV:"
    },
    "log_sm4_decrypt_mode": {
        "zh_CN": "SM4 解密模式:",
        "en": "SM4 decryption mode:"
    },
    "log_sm4_decrypt_output": {
        "zh_CN": "SM4 解密明文：",
        "en": "SM4 decryption plaintext:"
    },
    "log_sm3_input": {
        "zh_CN": "SM3 加密明文：:",
        "en": "SM3 input:"
    },
    "log_sm3_output": {
        "zh_CN": "SM3 加密密文：:",
        "en": "SM3 output:"
    },
    "log_json_parse": {
        "zh_CN": "调用JSON.parse ---> ",
        "en": "JSON.parse called ---> "
    },
    "log_json_parse_matched": {
        "zh_CN": "捕获到调用JSON.parse指定字符串 ---> ",
        "en": "Matched JSON.parse input ---> "
    },
    "log_json_stringify": {
        "zh_CN": "调用JSON.stringify，参数：\n",
        "en": "JSON.stringify called with arguments:\n"
    },
    "log_local_storage_clear": {
        "zh_CN": "捕获到移除了localStorage中的所有键值对",
        "en": "Captured removal of all localStorage entries"
    },
    "log_local_storage_get": {
        "zh_CN": "获取了localStorage\n键： ",
        "en": "Read localStorage\nKey: "
    },
    "log_local_storage_get_matched": {
        "zh_CN": "捕获到获取了localStorage键 ---> {0}",
        "en": "Matched localStorage read ---> {0}"
    },
    "log_local_storage_remove": {
        "zh_CN": "移除了localStorage键\n键名 ---> ",
        "en": "Removed localStorage entry\nKey ---> "
    },
    "log_local_storage_remove_matched": {
        "zh_CN": "捕获到移除了localStorage键 ---> {0}",
        "en": "Matched localStorage removal ---> {0}"
    },
    "log_local_storage_set": {
        "zh_CN": "设置了localStorage，键值对为：\n{0}:{1}",
        "en": "Set localStorage entry:\n{0}:{1}"
    },
    "log_local_storage_set_matched": {
        "zh_CN": "捕获到设置了localStorage\n键 ---> {0} 值 ---> {1}",
        "en": "Matched localStorage write\nKey ---> {0} Value ---> {1}"
    },
    "log_console_method_overwrite_blocked": {
        "zh_CN": "%c有代码试图重写console.{0}方法，已阻止",
        "en": "%cBlocked an attempt to overwrite console.{0}"
    },
    "log_console_overwrite_blocked": {
        "zh_CN": "%c有代码试图重写console，已阻止",
        "en": "%cBlocked an attempt to overwrite console"
    },
    "log_session_storage_clear": {
        "zh_CN": "捕获到移除了sessionStorage中的所有键值对",
        "en": "Captured removal of all sessionStorage entries"
    },
    "log_session_storage_get": {
        "zh_CN": "获取了sessionStorage\n键：",
        "en": "Read sessionStorage\nKey: "
    },
    "log_session_storage_get_matched": {
        "zh_CN": "捕获到获取了sessionStorage键 ---> {0}",
        "en": "Matched sessionStorage read ---> {0}"
    },
    "log_session_storage_remove": {
        "zh_CN": "移除了sessionStorage键\n键名 ---> ",
        "en": "Removed sessionStorage entry\nKey ---> "
    },
    "log_session_storage_remove_matched": {
        "zh_CN": "捕获到移除了sessionStorage键 ---> {0}",
        "en": "Matched sessionStorage removal ---> {0}"
    },
    "log_session_storage_set": {
        "zh_CN": "设置了sessionStorage，键值对为：\n{0}:{1}",
        "en": "Set sessionStorage entry:\n{0}:{1}"
    },
    "log_session_storage_set_matched": {
        "zh_CN": "捕获到设置了sessionStorage\n键 ---> {0} 值 ---> {1}",
        "en": "Matched sessionStorage write\nKey ---> {0} Value ---> {1}"
    },
    "log_xhr_open": {
        "zh_CN": "初始化xhr请求：method ---> %s, url ---> %s",
        "en": "Initializing XHR request: method ---> %s, url ---> %s"
    },
    "log_xhr_open_matched": {
        "zh_CN": "捕获到初始化xhr请求设置 url ---> %s method ---> %s",
        "en": "Matched XHR request initialization: url ---> %s method ---> %s"
    },
    "log_xhr_set_header": {
        "zh_CN": "请求头设置：\n",
        "en": "Setting request header:\n"
    },
    "log_xhr_set_header_matched": {
        "zh_CN": "捕获到设置请求头 ---> ",
        "en": "Matched request header write ---> "
    },
    "log_react_scan_limit": {
        "zh_CN": "[AntiDebug] Fiber 树扫描达到 {0} 个节点，结果可能不完整",
        "en": "[AntiDebug] Fiber tree scan reached {0} nodes; result may be incomplete"
    },
    "log_react_scan_finished": {
        "zh_CN": "[AntiDebug] Fiber 树扫描完成，共访问 {0} 个节点，未发现 Router",
        "en": "[AntiDebug] Fiber tree scan finished, visited {0} nodes, no Router found"
    },
    "log_react_provider_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [RouterProvider - {0}]",
        "en": "\n[AntiDebug] React Router routes [RouterProvider - {0}]"
    },
    "log_react_router_instance": {
        "zh_CN": "\n[AntiDebug] Router 实例：",
        "en": "\n[AntiDebug] Router instance:"
    },
    "log_react_github_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [GitHubRoutes]",
        "en": "\n[AntiDebug] React Router routes [GitHubRoutes]"
    },
    "log_react_context_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [ContextRoutes]",
        "en": "\n[AntiDebug] React Router routes [ContextRoutes]"
    },
    "log_react_legacy_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [LegacyRoutes]",
        "en": "\n[AntiDebug] React Router routes [LegacyRoutes]"
    },
    "log_react_raw_routes": {
        "zh_CN": "\n[AntiDebug] 原始路由：",
        "en": "\n[AntiDebug] Raw routes:"
    },
    "log_react_menu_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [MenuRoutes 备用来源]",
        "en": "\n[AntiDebug] React Router routes [MenuRoutes fallback]"
    },
    "log_react_jsx_routes": {
        "zh_CN": "\n[AntiDebug] React Router 路由列表 [JSX Routes]",
        "en": "\n[AntiDebug] React Router routes [JSX Routes]"
    },
    "log_react_scan_updated": {
        "zh_CN": "[AntiDebug] React Router 扫描已更新：{0} 个实例，{1} 条路由",
        "en": "[AntiDebug] React Router scan updated: {0} instance(s), {1} route(s)"
    },
    "log_react_router_not_found": {
        "zh_CN": "[AntiDebug] 多次尝试后仍未找到 React Router 实例",
        "en": "[AntiDebug] React Router instance not found after retries"
    },
    "log_devtools_clipboard_unsupported": {
        "zh_CN": "当前浏览器不支持 Clipboard API",
        "en": "Your browser doesn't support the Clipboard API"
    },
    "log_devtools_emulate_focus": {
        "zh_CN": "请在开发者工具的“渲染”面板启用“模拟页面获得焦点”（Emulate a focused page）。",
        "en": "You need to activate the \"Emulate a focused page\" setting in the \"Rendering\" panel of devtools."
    },
    "log_devtools_state_copied": {
        "zh_CN": "全局状态已复制到剪贴板。",
        "en": "Global state copied to clipboard."
    },
    "log_devtools_state_copy_failed": {
        "zh_CN": "状态序列化失败，请查看控制台了解详情。",
        "en": "Failed to serialize the state. Check the console for more details."
    },
    "log_devtools_state_pasted": {
        "zh_CN": "已从剪贴板粘贴全局状态。",
        "en": "Global state pasted from clipboard."
    },
    "log_devtools_state_paste_failed": {
        "zh_CN": "无法反序列化剪贴板中的状态，请查看控制台了解详情。",
        "en": "Failed to deserialize the state from clipboard. Check the console for more details."
    },
    "log_devtools_state_export_failed": {
        "zh_CN": "无法将状态导出为 JSON，请查看控制台了解详情。",
        "en": "Failed to export the state as JSON. Check the console for more details."
    },
    "log_devtools_state_imported": {
        "zh_CN": "已从“{0}”导入全局状态。",
        "en": "Global state imported from \"{0}\"."
    },
    "log_devtools_state_import_failed": {
        "zh_CN": "无法从 JSON 导入状态，请查看控制台了解详情。",
        "en": "Failed to import the state from JSON. Check the console for more details."
    },
    "log_devtools_outdated": {
        "zh_CN": "当前 Vue Devtools 版本可能过旧。请确认是否使用稳定版，安装说明：https://devtools.vuejs.org/guide/installation.html。",
        "en": "You seem to be using an outdated version of Vue Devtools. Are you still using the Beta release instead of the stable one? You can find the links at https://devtools.vuejs.org/guide/installation.html."
    },
    "log_devtools_copy_state": {
        "zh_CN": "序列化并复制状态",
        "en": "Serialize and copy the state"
    },
    "log_devtools_paste_state": {
        "zh_CN": "用剪贴板内容替换状态",
        "en": "Replace the state with the content of your clipboard"
    },
    "log_devtools_save_state": {
        "zh_CN": "将状态保存为 JSON 文件",
        "en": "Save the state as a JSON file"
    },
    "log_devtools_import_state": {
        "zh_CN": "从 JSON 文件导入状态",
        "en": "Import the state from a JSON file"
    },
    "log_devtools_reset_state": {
        "zh_CN": "重置状态（调用 \"$reset\"）",
        "en": "Reset the state (with \"$reset\")"
    },
    "log_devtools_reset_not_found": {
        "zh_CN": "找不到 store“{0}”，无法重置。",
        "en": "Cannot reset \"{0}\" store because it wasn't found."
    },
    "log_devtools_reset_unsupported": {
        "zh_CN": "store“{0}”未实现 \"$reset\" 方法，无法重置。",
        "en": "Cannot reset \"{0}\" store because it doesn't have a \"$reset\" method implemented."
    },
    "log_devtools_store_reset": {
        "zh_CN": "store“{0}”已重置。",
        "en": "Store \"{0}\" reset."
    },
    "log_devtools_reset_store": {
        "zh_CN": "重置此 store 的状态",
        "en": "Reset the state of this store"
    },
    "log_devtools_store_not_found": {
        "zh_CN": "找不到 store“{0}”",
        "en": "store \"{0}\" not found"
    },
    "log_devtools_store_invalid_path": {
        "zh_CN": "store“{0}”的路径无效：\n{1}\n只能修改状态。",
        "en": "Invalid path for store \"{0}\":\n{1}\nOnly state can be modified."
    },
    "log_devtools_notify_stores": {
        "zh_CN": "通知新增或删除的 store",
        "en": "Notify about new/deleted stores"
    },
    "log_devtools_store_disposed": {
        "zh_CN": "已释放 store“{0}”🗑",
        "en": "Disposed \"{0}\" store 🗑"
    },
    "log_devtools_store_installed": {
        "zh_CN": "store“{0}”已安装 🆕",
        "en": "\"{0}\" store installed 🆕"
    },
    "log_devtools_download_failed": {
        "zh_CN": "无法下载文件",
        "en": "could not download file"
    },
    "log_devtools_downloading": {
        "zh_CN": "正在下载…",
        "en": "downloading..."
    },
    "log_route_name": {
        "zh_CN": "名称",
        "en": "Name"
    },
    "log_route_path": {
        "zh_CN": "路径",
        "en": "Path"
    },
    "log_route_unnamed": {
        "zh_CN": "（未命名）",
        "en": "(unnamed)"
    }
});
})();
