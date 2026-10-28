(function (root) {
    const commonjs = typeof module === 'object' && module.exports && root.window !== root;
    const I = commonjs ? require('./core.js') : root.ADB_I18N;
    const messages = {
  "catalog_Bypass_Debugger_name": {
    "zh_CN": "解除无限断点",
    "en": "Bypass Debugger"
  },
  "catalog_Bypass_Debugger_description": {
    "zh_CN": "解除页面的无限断点， 如绕不过去或报错请使用火狐浏览器忽略断点。",
    "en": "Bypasses repeated debugger statements. If it fails or causes errors, try Firefox's option to ignore breakpoints."
  },
  "catalog_hook_log_name": {
    "zh_CN": "保留控制台日志",
    "en": "hook log"
  },
  "catalog_hook_log_description": {
    "zh_CN": "防止js重写console.log等方法，以此来避免控制台无法打印内容，可配合「脚本」分组里的所有脚本，以及「监控 CryptoJS 加密」「监控 JSEncrypt RSA」两个脚本一起使用。",
    "en": "Prevents pages from replacing console.log and related methods so console output remains visible. Can be used with the Hook panel and the CryptoJS and JSEncrypt RSA Hooks."
  },
  "catalog_hook_table_name": {
    "zh_CN": "保留表格输出",
    "en": "Hook table"
  },
  "catalog_hook_table_description": {
    "zh_CN": "网站通过 console.table 输出的内容照常保留，同时抵消用运行耗时差检测开发者工具的手法。",
    "en": "Hooks console.table to counter timing-based anti-debugging checks."
  },
  "catalog_hook_clear_name": {
    "zh_CN": "保留控制台清屏",
    "en": "hook clear"
  },
  "catalog_hook_clear_description": {
    "zh_CN": "禁止js清除控制台数据",
    "en": "Prevents page scripts from clearing console output."
  },
  "catalog_hook_close_name": {
    "zh_CN": "阻止页面自动关闭",
    "en": "hook close"
  },
  "catalog_hook_close_description": {
    "zh_CN": "重写close方法，避免网站为阻止调试而关闭当前页面",
    "en": "Overrides window.close to stop anti-debugging code from closing the current page."
  },
  "catalog_hook_history_name": {
    "zh_CN": "阻止返回上一页",
    "en": "hook history"
  },
  "catalog_hook_history_description": {
    "zh_CN": "避免网站为阻止调试而退回上一页或某个特定历史页面",
    "en": "Blocks history.go and history.back used by anti-debugging code to leave the page."
  },
  "catalog_Hook_CryptoJS_name": {
    "zh_CN": "监控 CryptoJS 加密",
    "en": "Hook CryptoJS"
  },
  "catalog_Hook_CryptoJS_description": {
    "zh_CN": "监控 CryptoJS 中所有 对称&哈希&HMAC算法，例如AES、DES、MD5、SHA等。如果未打印请自查目标站点是否清除了console.log或是否使用的是CryptoJS的加密算法，如果清除了 console.log，可以开启「保留控制台日志」脚本防止 js 重写日志方法，如果确认使用的是CryptoJS库进行的加密而无法打印可联系我。",
    "en": "Logs CryptoJS symmetric encryption, hashes, and HMAC operations, including AES, DES, MD5, and SHA. If nothing appears, confirm that the page uses CryptoJS and has not replaced console.log; try hook log. Report confirmed unsupported cases through GitHub Issues."
  },
  "catalog_Hook_JSEncrypt_name": {
    "zh_CN": "监控 JSEncrypt RSA",
    "en": "Hook JSEncrypt RSA"
  },
  "catalog_Hook_JSEncrypt_description": {
    "zh_CN": "监控 JSEncrypt 加密库中的 RSA 算法，加密时将在控制台打印公钥、原始数据、加密后的密文。解密时将在控制台打印私钥、原始数据、解密后的明文。如果未打印请自查目标站点是否清除了console.log或是否使用的是JSEncrypt的RSA算法，如果清除了 console.log，可以开启「保留控制台日志」脚本防止 js 重写日志方法，如果确认使用的是JSEncrypt库进行的RSA加密而无法打印可联系我。",
    "en": "Logs RSA operations from JSEncrypt: public key, input, and ciphertext for encryption; private key, input, and plaintext for decryption. If nothing appears, confirm the library and try hook log to preserve console output. Report confirmed unsupported cases through GitHub Issues."
  },
  "catalog_Hook_SMcrypto_name": {
    "zh_CN": "监控 SM-crypto 国密",
    "en": "Hook SM-crypto"
  },
  "catalog_Hook_SMcrypto_description": {
    "zh_CN": "监控 SM-crypto 加密库中的 SM2、SM3、SM4算法。如果未打印请自查目标站点是否清除了console.log或是否使用的是sm-crypto的加密算法，如果清除了 console.log，可以开启「保留控制台日志」脚本防止 js 重写日志方法，如果确认使用的是sm-crypto库进行的加密而无法打印可联系我。",
    "en": "Logs SM2, SM3, and SM4 operations from SM-crypto. If nothing appears, confirm the library and try hook log to preserve console output. Report confirmed unsupported cases through GitHub Issues."
  },
  "catalog_Fixed_window_size_name": {
    "zh_CN": "固定窗口尺寸",
    "en": "Fixed window size"
  },
  "catalog_Fixed_window_size_description": {
    "zh_CN": "固定浏览器窗口尺寸，避免页面检测到控制台已打开",
    "en": "Fixes reported browser width and height values to counter DevTools detection based on window dimensions."
  },
  "catalog_location_href_name": {
    "zh_CN": "定位页面跳转代码",
    "en": "Locate navigation code"
  },
  "catalog_location_href_description": {
    "zh_CN": "网站发生跳转时会在此处触发断点，从而可以快速定位到跳转的JS代码位置，进而实现手动替换绕过跳转。注：1.使用本脚本时必须开启F12。2.开启本脚本不代表可以清除跳转代码，只是起一个定位的作用。",
    "en": "Pauses when navigation occurs to help locate the triggering JavaScript for manual replacement. Keep DevTools open. This is a diagnostic aid; enabling it does not remove the navigation logic."
  },
  "catalog_Get_Vue_0_name": {
    "zh_CN": "获取路由",
    "en": "Collect routes"
  },
  "catalog_Get_Vue_0_description": {
    "zh_CN": "获取已加载的路由并显示在下方的表格中，注意未加载的路由不会被获取到，如果长时间未获取到可能是由于目标站点未使用vue router，也可能是因为目标站点未加载完毕。",
    "en": "Collects loaded Vue Router routes and shows them below. Routes not yet loaded cannot be collected. If no results appear, the page may not use Vue Router or may still be loading."
  },
  "catalog_Get_Vue_1_name": {
    "zh_CN": "清除跳转",
    "en": "Block navigation"
  },
  "catalog_Get_Vue_1_description": {
    "zh_CN": "本脚本将清除vue router的跳转方法，如果清除后依然会跳转，一方面可能是由于注入的脚本还未清除跳转方法，网站就调用了方法进行跳转，此时可以考虑手动替换js清除跳转方法。另一方面可能是由于在代码中调用的不是vue router的跳转方法，此时可以开启「调试防护」分组里的「阻止页面自动关闭」或「阻止返回上一页」脚本，再或者打开「定位页面跳转代码」脚本，定位到跳转的函数并替换清除。",
    "en": "Disables Vue Router navigation methods. Navigation can still occur if the page calls them before injection, or uses another mechanism. Consider replacing the triggering JavaScript, using hook close or hook history, or locating the trigger with Locate navigation code."
  },
  "catalog_Clear_vue_Navigation_Guards_name": {
    "zh_CN": "清除路由守卫",
    "en": "Clear navigation guards"
  },
  "catalog_Clear_vue_Navigation_Guards_description": {
    "zh_CN": "仅清除全局前置守卫(beforeEach)和全局解析守卫(beforeResolve)，如果清除后网站控制台显示报错，可能是由于在路由守卫中做了动态加载等其他操作，此时可以考虑关闭本脚本并亲自替换js逻辑实现绕过。",
    "en": "Removes only global beforeEach and beforeResolve guards. If this causes errors, a guard may also perform dynamic loading or other required work. Disable this script and modify the relevant logic instead."
  },
  "catalog_detectorExec_name": {
    "zh_CN": "激活Vue Devtools",
    "en": "Enable Vue Devtools"
  },
  "catalog_detectorExec_description": {
    "zh_CN": "开启后将激活Vue Devtools。Vue2.x版本需开启Vue.js devtools(v5)，Vue3.x版本需开启Vue.js devtools，可自行去谷歌插件商店安装上述两个插件。注：1.两个插件不能同时开。2.当下方没有检测到Vue Router时并不能代表网站不是Vue框架，只能说明网站并没有使用Vue Router。",
    "en": "Enables Vue Devtools integration. Install Vue.js devtools (v5) for Vue 2.x or Vue.js devtools for Vue 3.x; do not enable both extensions at once. Failure to detect Vue Router does not mean the page does not use Vue."
  },
  "catalog_Get_React_0_name": {
    "zh_CN": "获取路由",
    "en": "Collect routes"
  },
  "catalog_Get_React_0_description": {
    "zh_CN": "获取已加载的路由并显示在下方的表格中，注意未加载的路由不会被获取到，如果长时间未获取到可能是由于目标站点未使用react router，也可能是因为目标站点未加载完毕。",
    "en": "Collects loaded React Router routes and shows them below. Routes not yet loaded cannot be collected. If no results appear, the page may not use React Router or may still be loading."
  },
  "catalog_Hook_cookie_name": {
    "zh_CN": "document.cookie",
    "en": "document.cookie"
  },
  "catalog_Hook_cookie_description": {
    "zh_CN": "开启后将在控制台打印设置的cookie，如果需要打印特定cookie请在下方输入框中输入cookie名称，脚本将会捕获这些特定cookie名。",
    "en": "Logs cookie assignments. Enter cookie names in the keyword field to capture only matching assignments."
  },
  "catalog_hook_xhr_setRequestHeader_name": {
    "zh_CN": "XMLHttpRequest.setRequestHeader",
    "en": "XMLHttpRequest.setRequestHeader"
  },
  "catalog_hook_xhr_setRequestHeader_description": {
    "zh_CN": "开启后将在控制台打印设置的请求头，如果需要打印特定请求头请在下方输入框中输入请求头名称，脚本将会捕获这些特定请求头名。",
    "en": "Logs request headers being set. Enter header names to capture only matching headers."
  },
  "catalog_hook_xhr_open_name": {
    "zh_CN": "XMLHttpRequest.open",
    "en": "XMLHttpRequest.open"
  },
  "catalog_hook_xhr_open_description": {
    "zh_CN": "开启后将在控制台打印初始化xhr请求配置(url,method)，如果需要捕获特定url请在下方输入框中输入url名称，脚本将会捕获这些特定url名称。",
    "en": "Logs XHR initialization arguments, including URL and method. Enter URL keywords to capture only matching requests."
  },
  "catalog_hook_localStorage_setItem_name": {
    "zh_CN": "localStorage.setItem",
    "en": "localStorage.setItem"
  },
  "catalog_hook_localStorage_setItem_description": {
    "zh_CN": "开启后将在控制台打印设置的localStorage键值，如果需要捕获特定键请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs localStorage keys and values being written. Enter key names to capture only matching writes."
  },
  "catalog_hook_localStorage_getItem_name": {
    "zh_CN": "localStorage.getItem",
    "en": "localStorage.getItem"
  },
  "catalog_hook_localStorage_getItem_description": {
    "zh_CN": "开启后将在控制台打印站点读取的localStorage键名，如果需要捕获特定键名请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs localStorage keys being read. Enter key names to capture only matching reads."
  },
  "catalog_hook_localStorage_removeItem_name": {
    "zh_CN": "localStorage.removeItem",
    "en": "localStorage.removeItem"
  },
  "catalog_hook_localStorage_removeItem_description": {
    "zh_CN": "开启后将在控制台打印移除的localStorage键名，如果需要捕获特定键名请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs localStorage keys being removed. Enter key names to capture only matching removals."
  },
  "catalog_hook_localStorage_clear_name": {
    "zh_CN": "localStorage.clear",
    "en": "localStorage.clear"
  },
  "catalog_hook_localStorage_clear_description": {
    "zh_CN": "开启后，如果站点进行了清空localStorage动作，默认会在控制台打印消息。",
    "en": "Logs when the page clears localStorage."
  },
  "catalog_hook_sessionStorage_setItem_name": {
    "zh_CN": "sessionStorage.setItem",
    "en": "sessionStorage.setItem"
  },
  "catalog_hook_sessionStorage_setItem_description": {
    "zh_CN": "开启后将在控制台打印设置的sessionStorage键值，如果需要捕获特定键请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs sessionStorage keys and values being written. Enter key names to capture only matching writes."
  },
  "catalog_hook_sessionStorage_getItem_name": {
    "zh_CN": "sessionStorage.getItem",
    "en": "sessionStorage.getItem"
  },
  "catalog_hook_sessionStorage_getItem_description": {
    "zh_CN": "开启后将在控制台打印站点读取的sessionStorage键名，如果需要捕获特定键名请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs sessionStorage keys being read. Enter key names to capture only matching reads."
  },
  "catalog_hook_sessionStorage_removeItem_name": {
    "zh_CN": "sessionStorage.removeItem",
    "en": "sessionStorage.removeItem"
  },
  "catalog_hook_sessionStorage_removeItem_description": {
    "zh_CN": "开启后将在控制台打印移除的sessionStorage键名，如果需要捕获特定键名请在下方输入框中输入键名，脚本将会捕获这些特定键名。",
    "en": "Logs sessionStorage keys being removed. Enter key names to capture only matching removals."
  },
  "catalog_hook_sessionStorage_clear_name": {
    "zh_CN": "sessionStorage.clear",
    "en": "sessionStorage.clear"
  },
  "catalog_hook_sessionStorage_clear_description": {
    "zh_CN": "开启后，如果站点进行了清空sessionStorage动作，默认会在控制台打印消息。",
    "en": "Logs when the page clears sessionStorage."
  },
  "catalog_hook_fetch_name": {
    "zh_CN": "fetch",
    "en": "fetch"
  },
  "catalog_hook_fetch_description": {
    "zh_CN": "开启后将在控制台打印fetch请求设置。",
    "en": "Logs fetch request arguments."
  },
  "catalog_hook_json_parse_name": {
    "zh_CN": "JSON.parse",
    "en": "JSON.parse"
  },
  "catalog_hook_json_parse_description": {
    "zh_CN": "开启后将在控制台打印传入的JSON，如果需要捕获特定JSON请在下方输入框中输入JSON，脚本将会捕获这些特定JSON字符串。",
    "en": "Logs JSON strings passed to JSON.parse. Enter keywords to capture only matching JSON strings."
  },
  "catalog_hook_json_stringify_name": {
    "zh_CN": "JSON.stringify",
    "en": "JSON.stringify"
  },
  "catalog_hook_json_stringify_description": {
    "zh_CN": "开启后将在控制台打印传入JSON.stringify的值。",
    "en": "Logs values passed to JSON.stringify."
  },
  "catalog_hook_Promise_name": {
    "zh_CN": "Promise",
    "en": "Promise"
  },
  "catalog_hook_Promise_description": {
    "zh_CN": "将在控制台打印Promise的resolve参数，可快速定位异步回调位置。",
    "en": "Logs Promise resolve arguments to help locate asynchronous callbacks."
  },
  "catalog_hook_random_name": {
    "zh_CN": "Math.random",
    "en": "Math.random"
  },
  "catalog_hook_random_description": {
    "zh_CN": "固定Math.random返回值",
    "en": "Replaces the return value of Math.random with a fixed value."
  },
  "catalog_Hook_Date_now_name": {
    "zh_CN": "Date.now",
    "en": "Date.now"
  },
  "catalog_Hook_Date_now_description": {
    "zh_CN": "固定Date.now返回值",
    "en": "Replaces the return value of Date.now with a fixed value."
  },
  "catalog_hook_performance_now_name": {
    "zh_CN": "performance.now",
    "en": "performance.now"
  },
  "catalog_hook_performance_now_description": {
    "zh_CN": "固定performance.now返回值",
    "en": "Replaces the return value of performance.now with a fixed value."
  },
  "catalog_Hook_JSEncrypt_SMcrypto_name": {
    "zh_CN": "监控 JSEncrypt + SM-crypto",
    "en": "Hook JSEncrypt SM-crypto"
  },
  "catalog_Hook_JSEncrypt_SMcrypto_description": {
    "zh_CN": "同时监控 JSEncrypt 和 SM-crypto 两个加密库，两者都启用时自动使用这个合并版本，开销更小。",
    "en": "Combined JSEncrypt and SM-crypto Hook, used automatically when both scripts are enabled to reduce overhead."
  },
  "catalog_AntiAnti_Hook_name": {
    "zh_CN": "绕过注入检测",
    "en": "AntiAnti Hook"
  },
  "catalog_AntiAnti_Hook_description": {
    "zh_CN": "绕过页面对脚本注入的检测。某个脚本开了却不生效时，打开这个试试。",
    "en": "Counteracts common Hook detection techniques."
  }
};
    I.register(messages);
    if (commonjs) module.exports = messages;
})(globalThis);
