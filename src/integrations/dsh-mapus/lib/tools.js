
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
      return [{ type: 'text', text: `Call failed: ${value.error || 'unknown error'}` }]
    }
    const payload = value && typeof value === 'object' && 'result' in value ? value.result : value
    let text
    try {
      text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1)
    } catch {
      text = String(payload)
    }
    if (typeof text === 'string' && text.length > 16_000) text = text.slice(0, 16_000) + '…[truncated]'
    return [{ type: 'text', text: text || '(no output)' }]
  },
}

export const TOOLS = [
  {
    name: 'mapus_page_context',
    call: 'page_context',
    description:
      'Read the current tab as a whole: URL, title, scan progress, counts per sensitive-data class, security findings, tech stack, privacy-protection stats and script state. Call this first before answering anything about the current site.',
    parameters: {},
  },
  {
    name: 'mapus_scan_findings',
    call: 'scan_findings',
    description:
      'Read sensitive-data scan details. keys picks classes (domains/apis/absoluteApis/urls/credentials/cookies/idKeys/phones/emails/idcards/ips/companies/jwts/jsFiles/vueFiles/docFiles/moduleFiles/githubUrls); keyword filters by substring.',
    parameters: {
      keys: { type: 'array', items: { type: 'string' }, description: 'Classes to read; omit for all' },
      keyword: { type: 'string', description: 'Only return entries containing this substring' },
      limit: { type: 'integer', description: 'Max entries per class (default 30, cap 200)' },
    },
  },
  {
    name: 'mapus_fingerprints',
    call: 'fingerprints',
    description: 'Read tech-stack detection results (server, framework, CDN, panel, analytics and so on).',
    parameters: {},
  },
  {
    name: 'mapus_anti_state',
    call: 'anti_state',
    description: 'Read privacy-protection state: whether it is on, UA spoofing, blocked count for this site, recently blocked targets, and tracking or fingerprinting hits on the page.',
    parameters: {},
  },
  {
    name: 'mapus_hook_state',
    call: 'hook_state',
    description: 'Read debugger-protection and script state plus the script library. With includeCatalog=true the full list of available script ids is returned too.',
    parameters: {
      includeCatalog: { type: 'boolean', description: 'Return the full script catalog' },
    },
  },
  {
    name: 'mapus_page_text',
    call: 'page_text',
    description: 'Read the visible text of the page (script/style stripped) to understand the business and on-screen messages.',
    parameters: {
      maxChars: { type: 'integer', description: 'Max characters to return (default 4000, cap 20000)' },
    },
  },
  {
    name: 'mapus_dom_query',
    call: 'dom_query',
    description: 'Query elements with a CSS selector; returns the count, text snippets and requested attributes. Use it to confirm page structure, forms and hidden elements.',
    parameters: {
      selector: { type: 'string', required: true, description: 'CSS selector, for example input[type=password]' },
      limit: { type: 'integer', description: 'Max elements to return (default 20)' },
      attributes: { type: 'array', items: { type: 'string' }, description: 'Attribute names to read, for example ["href","name"]' },
    },
  },
  {
    name: 'mapus_page_storage',
    call: 'page_storage',
    description: 'Read localStorage / sessionStorage entries (keys and lengths; includeValues=true adds truncated values), or read cookies.',
    parameters: {
      storage: { type: 'string', enum: ['local', 'session', 'cookie'], description: 'Storage kind (default local)' },
      includeValues: { type: 'boolean', description: 'Include values (default false)' },
      limit: { type: 'integer', description: 'Max entries to return (default 40)' },
    },
  },
  {
    name: 'mapus_collect_endpoints',
    call: 'collect_endpoints',
    description: 'Collect script URLs, asset links and likely API paths from the page (DOM plus regex over inline scripts) to map the endpoint surface.',
    parameters: {},
  },
  {
    name: 'mapus_run_scan',
    call: 'run_scan',
    description: 'Re-run the sensitive-data scan on the current page (previous results are cleared). Wait a few seconds, then read the outcome with mapus_page_context.',
    parameters: {},
  },
  {
    name: 'mapus_probe_http',
    call: 'probe_http',
    description: 'Send an HTTP request from the background exactly like curl: custom method, path, headers and body, with browser cookies attached, bypassing page CSP and same-origin limits. Returns status, headers and a body snippet. Use it to verify unauthenticated access, privilege escalation, injection and response shape.',
    parameters: {
      method: { type: 'string', description: 'HTTP method (default GET)' },
      path: { type: 'string', description: 'Path or full URL; a relative path is resolved against the origin of the current tab' },
      headers: { type: 'object', additionalProperties: true, description: 'Extra request headers' },
      cookies: { type: 'object', additionalProperties: true, description: 'Cookies to set, for example {"security":"low"}' },
      body: { type: 'string', description: 'Request body (for POST/PUT)' },
      timeoutMs: { type: 'integer', description: 'Timeout in ms (default 15000, cap 60000)' },
    },
  },
  {
    name: 'mapus_browser_tabs',
    call: 'browser_tabs',
    description: 'Manage tabs: list (to get tabId), activate, open, close, detach (release the debugger). Call list first to work on another tab.',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'activate', 'open', 'close', 'detach'], description: 'Default list' },
      targetTabId: { type: 'integer', description: 'Target tab id for activate / close / detach' },
      url: { type: 'string', description: 'URL for open' },
      active: { type: 'boolean', description: 'Switch to the tab right after open (default true)' },
    },
  },
  {
    name: 'mapus_browser_navigate',
    call: 'browser_navigate',
    description: 'Actually drive browser navigation: goto a url, back / forward through history, reload (hard=true skips the cache).',
    parameters: {
      action: { type: 'string', enum: ['goto', 'back', 'forward', 'reload'] },
      url: { type: 'string', description: 'URL for goto' },
      hard: { type: 'boolean', description: 'Ignore the cache on reload' },
      settleMs: { type: 'integer', description: 'Ms to wait after navigating (default 500)' },
    },
  },
  {
    name: 'mapus_browser_snapshot',
    call: 'browser_snapshot',
    description:
      'Take a structure snapshot of the page: every interactive element (links, buttons, inputs, selects, editable areas, anything with a role), each with a ref (for example e3), a selector, visibility and coordinates. Take one before clicking or typing.',
    parameters: {
      limit: { type: 'integer', description: 'Max elements to return (default 120, cap 300)' },
    },
  },
  {
    name: 'mapus_browser_click',
    call: 'browser_click',
    description: 'Click an element with real mouse events (CDP, isTrusted=true). Pass either selector or ref; ref comes from mapus_browser_snapshot.',
    parameters: {
      selector: { type: 'string', description: 'CSS selector' },
      ref: { type: 'string', description: 'Ref from a snapshot, for example e3' },
      button: { type: 'string', enum: ['left', 'right'], description: 'Default left' },
      clickCount: { type: 'integer', description: '2 means double click' },
    },
  },
  {
    name: 'mapus_browser_type',
    call: 'browser_type',
    description: 'Type into a field with real keystrokes (CDP insertText, so React/Vue controlled inputs receive it too). clear=true empties it first, submit=true presses Enter afterwards.',
    parameters: {
      selector: { type: 'string' },
      ref: { type: 'string' },
      text: { type: 'string', description: 'Text to type' },
      clear: { type: 'boolean', description: 'Clear the field first' },
      submit: { type: 'boolean', description: 'Press Enter after typing' },
    },
  },
  {
    name: 'mapus_browser_key',
    call: 'browser_key',
    description: 'Send key events, combos included (Enter / Tab / Escape / Control+A / Meta+Enter). Passing a selector or ref clicks the element first.',
    parameters: {
      key: { type: 'string', required: true, description: 'Key name or combo' },
      selector: { type: 'string' },
      ref: { type: 'string' },
    },
  },
  {
    name: 'mapus_browser_scroll',
    call: 'browser_scroll',
    description: 'Scroll the page: to=top/bottom, deltaY scrolls that many pixels (negative goes up), or pass selector/ref to bring an element into view (handy for lazy lists).',
    parameters: {
      to: { type: 'string', enum: ['top', 'bottom'] },
      deltaY: { type: 'integer', description: 'Pixels to scroll (default 600)' },
      x: { type: 'number' },
      y: { type: 'number' },
      selector: { type: 'string' },
      ref: { type: 'string' },
    },
  },
  {
    name: 'mapus_browser_screenshot',
    call: 'browser_screenshot',
    description: 'Take a screenshot and show it in the side panel for the user; fullPage=true captures the whole page. Note: the model cannot read the image itself.',
    parameters: {
      fullPage: { type: 'boolean', description: 'Capture the whole page' },
    },
  },
  {
    name: 'mapus_browser_eval',
    call: 'browser_eval',
    description: 'Run arbitrary JavaScript in the page MAIN world and return the result. Use it to verify DOM XSS, read framework internals, or call functions the page provides.',
    parameters: {
      expression: { type: 'string', required: true, description: 'Expression or IIFE to run; return is allowed' },
      awaitPromise: { type: 'boolean', description: 'Await a Promise result' },
    },
  },
  {
    name: 'mapus_browser_network',
    call: 'browser_network',
    description: 'Read network requests and response bodies captured at the CDP layer. Use it to analyse endpoints, privilege escalation, parameters and response shape.',
    parameters: {
      limit: { type: 'integer', description: 'Max entries to return (default 30)' },
      keyword: { type: 'string', description: 'Filter by URL or method, for example api or POST' },
      includeBody: { type: 'boolean', description: 'Include a response body snippet' },
    },
  },
  {
    name: 'mapus_browser_console',
    call: 'browser_console',
    description: 'Read console logs and page exceptions (uncaught errors included) to spot front-end errors, anti-debug notices and data leaks.',
    parameters: {
      limit: { type: 'integer', description: 'Max entries to return (default 50)' },
      level: { type: 'string', enum: ['all', 'error', 'warn', 'log'], description: 'Default all' },
    },
  },
  {
    name: CATALOG_TOOL,
    call: CATALOG_TOOL,
    description: 'List every capability the MAPUS extension currently offers (extension-side tool name plus description). To call something not listed here, look it up first, then forward it with mapus_tool.',
    parameters: {},
  },
  {
    name: PASSTHROUGH_TOOL,
    passthrough: true,
    description:
      'Call any MAPUS extension capability. name is the extension-side tool name (look it up with mapus_catalog first), args is the argument object for that tool. Use it for tools not listed here.',
    parameters: {
      name: { type: 'string', required: true, description: 'Extension-side tool name' },
      args: { type: 'object', additionalProperties: true, description: 'Argument object for that tool' },
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
          if (!target) return { ok: false, error: 'name is empty: look up available tools with mapus_catalog first' }
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
