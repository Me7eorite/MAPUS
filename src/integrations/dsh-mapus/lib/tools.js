
export const PASSTHROUGH_TOOL = 'mapus_tool'

export const CATALOG_TOOL = 'mapus_catalog'

const OUTPUT = {
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    additionalProperties: true,
  },
  render(_args, value) {
    if (value && typeof value === 'object' && value.ok === false) {
      return [{ type: 'text', text: `调用失败：${value.error || '未知错误'}` }]
    }
    const payload = value && typeof value === 'object' && 'result' in value ? value.result : value
    let text
    try {
      text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1)
    } catch {
      text = String(payload)
    }
    if (typeof text === 'string' && text.length > 16_000) text = text.slice(0, 16_000) + '…[已截断]'
    return [{ type: 'text', text: text || '（无返回内容）' }]
  },
}

export const TOOLS = [
  {
    name: 'mapus_page_context',
    call: 'page_context',
    description:
      '读取当前标签页的整体现场：URL、标题、扫描进度、各类敏感数据数量、安全风险、技术栈、隐私防护统计、脚本状态。回答任何与当前站点有关的问题前先调用它。',
    parameters: {},
  },
  {
    name: 'mapus_scan_findings',
    call: 'scan_findings',
    description:
      '读取敏感数据扫描明细。keys 可指定类型（domains/apis/absoluteApis/urls/credentials/cookies/idKeys/phones/emails/idcards/ips/companies/jwts/jsFiles/vueFiles/docFiles/moduleFiles/githubUrls），keyword 做子串过滤。',
    parameters: {
      keys: { type: 'array', items: { type: 'string' }, description: '要读取的类型，省略为全部' },
      keyword: { type: 'string', description: '仅返回包含该子串的条目' },
      limit: { type: 'integer', description: '每种类型最多返回条数，默认 30，最大 200' },
    },
  },
  {
    name: 'mapus_fingerprints',
    call: 'fingerprints',
    description: '读取技术栈识别结果（服务器、框架、CDN、面板、分析工具等）。',
    parameters: {},
  },
  {
    name: 'mapus_anti_state',
    call: 'anti_state',
    description: '读取隐私防护状态：是否开启、UA 伪装、本站拦截次数、最近被拦截的目标、页面内命中的追踪与特征采集行为。',
    parameters: {},
  },
  {
    name: 'mapus_hook_state',
    call: 'hook_state',
    description: '读取调试防护与脚本状态、脚本库。includeCatalog=true 时同时返回全部可用脚本 id。',
    parameters: {
      includeCatalog: { type: 'boolean', description: '是否返回完整脚本目录' },
    },
  },
  {
    name: 'mapus_page_text',
    call: 'page_text',
    description: '读取页面可见文本（已剔除 script/style），用于理解业务与提示信息。',
    parameters: {
      maxChars: { type: 'integer', description: '最多返回多少字符，默认 4000，最大 20000' },
    },
  },
  {
    name: 'mapus_dom_query',
    call: 'dom_query',
    description: '用 CSS 选择器查询元素，返回数量、文本片段与指定属性。用于确认页面结构、表单、隐藏元素。',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS 选择器，例如 input[type=password]' },
      limit: { type: 'integer', description: '最多返回多少个元素，默认 20' },
      attributes: { type: 'array', items: { type: 'string' }, description: '要读取的属性名，例如 ["href","name"]' },
    },
  },
  {
    name: 'mapus_page_storage',
    call: 'page_storage',
    description: '读取 localStorage / sessionStorage 条目（键名与长度；includeValues=true 时附带截断后的值），或读取 Cookie。',
    parameters: {
      storage: { type: 'string', enum: ['local', 'session', 'cookie'], description: '存储类型，默认 local' },
      includeValues: { type: 'boolean', description: '是否返回值内容，默认 false' },
      limit: { type: 'integer', description: '最多返回条数，默认 40' },
    },
  },
  {
    name: 'mapus_collect_endpoints',
    call: 'collect_endpoints',
    description: '收集页面里的脚本地址、资源链接与疑似接口路径（DOM 与内联脚本正则提取），用于梳理接口面。',
    parameters: {},
  },
  {
    name: 'mapus_run_scan',
    call: 'run_scan',
    description: '让当前页面重新执行一次敏感数据扫描（会清空旧结果）。调用后等几秒再用 mapus_page_context 读结果。',
    parameters: {},
  },
  {
    name: 'mapus_probe_http',
    call: 'probe_http',
    description: '从后台直接向目标发 HTTP 请求（等价 curl）：自定义方法、路径、头、Body，自动带浏览器 Cookie，不受页面 CSP 与同源限制。返回状态码、响应头与响应体片段。用于验证未授权访问、越权、注入与接口结构。',
    parameters: {
      method: { type: 'string', description: 'HTTP 方法，默认 GET' },
      path: { type: 'string', description: '路径或完整 URL；相对路径会自动拼到当前标签页的源站' },
      headers: { type: 'object', additionalProperties: true, description: '自定义请求头' },
      cookies: { type: 'object', additionalProperties: true, description: '要写入的 Cookie，如 {"security":"low"}' },
      body: { type: 'string', description: '请求体（POST/PUT 用）' },
      timeoutMs: { type: 'integer', description: '超时毫秒，默认 15000，最大 60000' },
    },
  },
  {
    name: 'mapus_browser_tabs',
    call: 'browser_tabs',
    description: '管理标签页：list 列出（拿 tabId）、activate 切换、open 新开、close 关闭、detach 断开调试器。要操作其他标签页时先 list。',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'activate', 'open', 'close', 'detach'], description: '默认 list' },
      targetTabId: { type: 'integer', description: 'activate / close / detach 的目标标签页 id' },
      url: { type: 'string', description: 'open 的目标地址' },
      active: { type: 'boolean', description: 'open 时是否立即切过去，默认 true' },
    },
  },
  {
    name: 'mapus_browser_navigate',
    call: 'browser_navigate',
    description: '真正驱动浏览器导航：goto 打开 url、back / forward 走历史、reload 刷新（hard=true 忽略缓存）。',
    parameters: {
      action: { type: 'string', enum: ['goto', 'back', 'forward', 'reload'] },
      url: { type: 'string', description: 'goto 的目标地址' },
      hard: { type: 'boolean', description: 'reload 时忽略缓存' },
      settleMs: { type: 'integer', description: '导航后等待毫秒数，默认 500' },
    },
  },
  {
    name: 'mapus_browser_snapshot',
    call: 'browser_snapshot',
    description:
      '拍摄页面结构快照：返回全部可交互元素（链接、按钮、输入框、下拉、可编辑区、带 role 的控件），每个带 ref（如 e3）、selector、可见性与坐标。点击/输入前先拍一次。',
    parameters: {
      limit: { type: 'integer', description: '最多返回多少元素，默认 120，最大 300' },
    },
  },
  {
    name: 'mapus_browser_click',
    call: 'browser_click',
    description: '用真实鼠标事件（CDP，isTrusted=true）点击元素。selector 或 ref 二选一，ref 来自 mapus_browser_snapshot。',
    parameters: {
      selector: { type: 'string', description: 'CSS 选择器' },
      ref: { type: 'string', description: '快照里的 ref，如 e3' },
      button: { type: 'string', enum: ['left', 'right'], description: '默认 left' },
      clickCount: { type: 'integer', description: '2 表示双击' },
    },
  },
  {
    name: 'mapus_browser_type',
    call: 'browser_type',
    description: '往输入框真实打字（CDP insertText，React/Vue 受控组件也能收到）。clear=true 先清空，submit=true 打完回车。',
    parameters: {
      selector: { type: 'string' },
      ref: { type: 'string' },
      text: { type: 'string', description: '要输入的内容' },
      clear: { type: 'boolean', description: '是否先清空' },
      submit: { type: 'boolean', description: '是否输入后回车' },
    },
  },
  {
    name: 'mapus_browser_key',
    call: 'browser_key',
    description: '发送键盘事件，支持组合键（Enter / Tab / Escape / Control+A / Meta+Enter）。给 selector 或 ref 会先点击再按键。',
    parameters: {
      key: { type: 'string', required: true, description: '键名或组合' },
      selector: { type: 'string' },
      ref: { type: 'string' },
    },
  },
  {
    name: 'mapus_browser_scroll',
    call: 'browser_scroll',
    description: '滚动页面：to=top/bottom、deltaY 滚指定像素（负值向上）、给 selector/ref 则把元素滚到视口中间（懒加载列表常用）。',
    parameters: {
      to: { type: 'string', enum: ['top', 'bottom'] },
      deltaY: { type: 'integer', description: '滚动像素，默认 600' },
      x: { type: 'number' },
      y: { type: 'number' },
      selector: { type: 'string' },
      ref: { type: 'string' },
    },
  },
  {
    name: 'mapus_browser_screenshot',
    call: 'browser_screenshot',
    description: '截图并显示在侧边栏供用户查看，fullPage=true 截整页。注意：模型自己读不到图片内容。',
    parameters: {
      fullPage: { type: 'boolean', description: '是否截整页' },
    },
  },
  {
    name: 'mapus_browser_eval',
    call: 'browser_eval',
    description: '在页面主世界（MAIN world）执行任意 JavaScript 并返回结果。用于验证 DOM XSS、读取框架内部状态、调用页面自带函数。',
    parameters: {
      expression: { type: 'string', required: true, description: '要执行的表达式或 IIFE，可用 return' },
      awaitPromise: { type: 'boolean', description: '是否等待 Promise 结果' },
    },
  },
  {
    name: 'mapus_browser_network',
    call: 'browser_network',
    description: '读取 CDP 层抓到的网络请求与响应体。用于分析接口、越权、参数与返回结构。',
    parameters: {
      limit: { type: 'integer', description: '最多返回多少条，默认 30' },
      keyword: { type: 'string', description: '按 URL 或 method 过滤，例如 api 或 POST' },
      includeBody: { type: 'boolean', description: '是否附带响应体片段' },
    },
  },
  {
    name: 'mapus_browser_console',
    call: 'browser_console',
    description: '读取控制台日志与页面异常（含未捕获错误）。用于发现前端报错、调试防护提示与数据泄露。',
    parameters: {
      limit: { type: 'integer', description: '最多返回多少条，默认 50' },
      level: { type: 'string', enum: ['all', 'error', 'warn', 'log'], description: '默认 all' },
    },
  },
  {
    name: CATALOG_TOOL,
    call: CATALOG_TOOL,
    description: '列出 MAPUS 扩展当前提供的全部能力（扩展侧工具名 + 说明）。要调用清单里没有列出的工具时，先查这里，再用 mapus_tool 转发。',
    parameters: {},
  },
  {
    name: PASSTHROUGH_TOOL,
    passthrough: true,
    description:
      '调用任一 MAPUS 扩展能力。name 传扩展侧工具名（先用 mapus_catalog 查），args 传该工具的参数对象。用于本清单未列出的工具。',
    parameters: {
      name: { type: 'string', required: true, description: '扩展侧工具名' },
      args: { type: 'object', additionalProperties: true, description: '该工具的参数对象' },
    },
  },
]

const RESERVED = new Set(TOOLS.map(tool => tool.name))

export function describeCatalog() {
  return {
    tools: TOOLS.map(tool => ({ name: tool.name, call: tool.call || tool.name, description: tool.description })),
    passthrough: PASSTHROUGH_TOOL,
  }
}

export function isDeclared(name) {
  return RESERVED.has(name)
}

export function buildToolDefinition(spec, invoke, resolve) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: OUTPUT,
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {}
      try {
        let call
        let params
        if (spec.passthrough) {
          const target = String(input.name || '').trim()
          if (!target) return { ok: false, error: 'name 不能为空：先用 mapus_catalog 查可用工具' }
          call = resolve(target)
          params = input.args && typeof input.args === 'object' ? input.args : {}
        } else {
          call = spec.call
          params = input
        }
        const value = await invoke(call, params, exec && exec.signal)
        return { ok: true, result: value }
      } catch (error) {
        return { ok: false, error: error && error.message ? error.message : String(error) }
      }
    },
  }
}
