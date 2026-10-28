(function () {
  'use strict';
  if (self.MAPUS_AGENT) return;

  const CONFIG_KEY = 'mapus_agent';
  const LEGACY_CONFIG_KEY = 'nxe_agent';
  const SESSIONS_KEY = 'mapus_agent_sessions';
  const PORT_NAME = 'mapus-agent';
  const MAX_SESSIONS = 50;
  const MAX_MESSAGES = 80;
  const MAX_STORE_BYTES = 4_400_000;

  const DEFAULT_CONFIG = {
    enabled: true,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 2000,
    streaming: true,
    toolRounds: 40,
    roundsVersion: 3,
    autoContext: true,
    backend: 'builtin',
    dshUrl: 'http://127.0.0.1:7355',
    dshToken: '',
    dshProvider: '',
    dshModel: ''
  };

  const PROVIDERS = {};

  function agentRules() {
    return (self.MAPUS_RULES && self.MAPUS_RULES.getSync() && self.MAPUS_RULES.getSync().agent) || null;
  }

  function providers() {
    const conf = agentRules();
    const list = conf && Array.isArray(conf.providers) ? conf.providers : [];
    const map = {};
    for (const item of list) map[item.id] = { label: item.label, baseUrl: item.baseUrl, model: item.model };
    return map;
  }

  async function ensureAgentRules() {
    if (!self.MAPUS_RULES) return;
    try { await self.MAPUS_RULES.get(); } catch (_) {  }
  }

  const blocked = { current: null };

  async function readConfig() {
    await ensureAgentRules();
    const data = await chrome.storage.local.get([CONFIG_KEY, LEGACY_CONFIG_KEY]);
    const stored = (data && data[CONFIG_KEY]) || (data && data[LEGACY_CONFIG_KEY]) || {};
    if (data && !data[CONFIG_KEY] && data[LEGACY_CONFIG_KEY]) {
      await chrome.storage.local.set({ [CONFIG_KEY]: data[LEGACY_CONFIG_KEY] });
      await chrome.storage.local.remove(LEGACY_CONFIG_KEY);
    }
    const conf = agentRules();
    const config = {
      ...DEFAULT_CONFIG,
      toolRounds: conf ? conf.maxToolRounds : DEFAULT_CONFIG.toolRounds,
      ...stored
    };
    const map = providers();
    if (!config.baseUrl && map[config.provider]) config.baseUrl = map[config.provider].baseUrl;
    if (!config.model && map[config.provider]) config.model = map[config.provider].model;
    config.backend = config.backend === 'dsh' ? 'dsh' : 'builtin';
    config.dshUrl = String(config.dshUrl || '').trim().replace(/\/+$/, '') || DEFAULT_CONFIG.dshUrl;
    config.dshToken = typeof config.dshToken === 'string' ? config.dshToken : '';
    if (Number(stored.roundsVersion) !== DEFAULT_CONFIG.roundsVersion) {
      config.toolRounds = conf ? conf.maxToolRounds : DEFAULT_CONFIG.toolRounds;
      config.roundsVersion = DEFAULT_CONFIG.roundsVersion;
      try { await chrome.storage.local.set({ [CONFIG_KEY]: { ...stored, toolRounds: config.toolRounds, roundsVersion: config.roundsVersion } }); } catch (_) {  }
    }
    return config;
  }

  function publicConfig(config) {
    const key = typeof config.apiKey === 'string' ? config.apiKey : '';
    const dshToken = typeof config.dshToken === 'string' ? config.dshToken : '';
    return {
      ...config,
      apiKey: '',
      hasKey: key.length > 0,
      keyHint: key.length > 8 ? `${key.slice(0, 3)}***${key.slice(-4)}` : key ? '***' : '',
      dshToken: '',
      hasDshToken: dshToken.length > 0,
      dshTokenHint: dshToken.length > 8 ? `${dshToken.slice(0, 4)}***${dshToken.slice(-4)}` : dshToken ? '***' : '',
      providers: providers()
    };
  }

  async function writeConfig(patch) {
    const current = await readConfig();
    const next = { ...current };
    const allowed = Object.keys(DEFAULT_CONFIG);
    for (const [key, value] of Object.entries(patch || {})) {
      if (!allowed.includes(key)) continue;
      next[key] = value;
    }
    if (patch && patch.clearKey === true) next.apiKey = '';
    else if (patch && typeof patch.apiKey === 'string' && patch.apiKey === '') next.apiKey = current.apiKey;
    if (patch && patch.clearDshToken === true) next.dshToken = '';
    else if (patch && typeof patch.dshToken === 'string' && patch.dshToken === '') next.dshToken = current.dshToken;
    next.backend = next.backend === 'dsh' ? 'dsh' : 'builtin';
    next.dshUrl = String(next.dshUrl || '').trim().replace(/\/+$/, '') || DEFAULT_CONFIG.dshUrl;
    next.dshToken = String(next.dshToken || '').trim();
    next.dshProvider = String(next.dshProvider || '').trim();
    next.dshModel = String(next.dshModel || '').trim();
    next.baseUrl = String(next.baseUrl || '').trim().replace(/\/+$/, '');
    next.model = String(next.model || '').trim();
    next.temperature = Math.max(0, Math.min(2, Number(next.temperature) || 0));
    next.maxTokens = Math.max(256, Math.min(32000, Number(next.maxTokens) || 2000));
    next.toolRounds = Math.max(1, Math.min(200, Number(next.toolRounds) || 40));
    next.streaming = next.streaming !== false;
    next.enabled = next.enabled !== false;
    next.autoContext = next.autoContext !== false;
    next.provider = providers()[next.provider] ? next.provider : 'custom';
    await chrome.storage.local.set({ [CONFIG_KEY]: next });
    return next;
  }

  async function resolveTab(tabId) {
    if (tabId !== undefined && tabId !== null) {
      try { return await chrome.tabs.get(Number(tabId)); } catch (_) {  }
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  function inspectable(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  async function scanResults(tabId) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, { type: 'GET_RESULTS', tabId, from: 'agent' });
      return reply && typeof reply === 'object' ? reply : null;
    } catch (_) { return null; }
  }

  const COUNT_LABELS = {
    domains: '域名', absoluteApis: '绝对路径接口', apis: '接口', moduleFiles: '模块路径', docFiles: '文档文件',
    credentials: '用户名密码', cookies: 'Cookie', idKeys: 'ID/密钥', phones: '手机号', emails: '邮箱',
    idcards: '身份证', ips: 'IP', companies: '公司名', jwts: 'JWT', imageFiles: '图片资源',
    githubUrls: 'GitHub 地址', vueFiles: 'Vue 文件', jsFiles: 'JS 文件', urls: 'URL'
  };

  function summarizeCounts(results) {
    const counts = {};
    if (!results) return counts;
    for (const key of Object.keys(COUNT_LABELS)) {
      if (Array.isArray(results[key])) counts[key] = results[key].length;
    }
    return counts;
  }

  async function buildContext(tabId) {
    const tab = await resolveTab(tabId);
    if (!tab) return { error: '没有可用的标签页' };
    const url = tab.url || '';
    const context = {
      tabId: tab.id,
      url,
      title: tab.title || '',
      host: (() => { try { return new URL(url).hostname; } catch (_) { return ''; } })(),
      inspectable: inspectable(url),
      counts: {},
      total: 0,
      progress: null,
      securityFindings: [],
      fingerprints: [],
      anti: null,
      hooks: null
    };
    if (!context.inspectable) {
      context.note = '当前页面不是普通网页（chrome:// 等内部页面），无法读取页面数据。';
      return context;
    }

    const results = await scanResults(tab.id);
    if (results) {
      context.counts = summarizeCounts(results);
      context.total = Object.values(context.counts).reduce((sum, n) => sum + n, 0);
      const progress = results.progress;
      if (Array.isArray(progress) && progress[0]) {
        const raw = Array.isArray(progress[0]) ? progress[0][1] : progress[0];
        const value = Number(raw);
        if (Number.isFinite(value)) context.progress = Math.round(value);
      }
      if (Array.isArray(results.securityFindings)) {
        context.securityFindings = results.securityFindings
          .filter(item => item && item.text)
          .slice(0, 12)
          .map(item => ({ text: String(item.text).slice(0, 200), level: item.level || 'info' }));
      }
    } else {
      context.scanMissing = true;
    }

    try {
      const list = self.MAPUS && self.MAPUS.flattenFingerprints ? self.MAPUS.flattenFingerprints(tab.id) : [];
      context.fingerprints = (list || []).slice(0, 30).map(item => ({
        type: item.type, name: item.name, value: item.value || '', header: item.header || ''
      }));
    } catch (_) {  }

    try {
      if (self.MAPUS_ANTI) {
        const config = await self.MAPUS_ANTI.readConfig();
        const status = await self.MAPUS_ANTI.siteStatus(url);
        context.anti = {
          isEnabled: config.isEnabled !== false,
          uaRotation: config.uaRotationEnabled !== false,
          notifyOnBlock: config.notifyOnBlock === true,
          autoClean: config.autoCleanPrevDomain === true,
          blocks: status.blocks || 0,
          findings: (status.findings || []).map(item => ({ name: item.name, detail: item.detail, level: item.level })),
          recentBlocks: (status.recent || []).slice(0, 6).map(item => item.rule || item.host)
        };
      }
    } catch (_) {  }

    try {
      if (self.MAPUS_ADB && self.MAPUS_ADB.ready) {
        const service = await self.MAPUS_ADB.ready;
        const state = await service.execute('state.get', { tabId: tab.id }, { source: 'extension' });
        context.hooks = {
          mode: state.mode,
          enabled: state.enabledScripts || [],
          applied: state.appliedScripts || [],
          requiresReload: state.requiresReload === true
        };
      }
    } catch (_) {  }

    return context;
  }

  function fail(message) {
    return { error: message };
  }

  async function currentTab(tabId) {
    const tab = await resolveTab(tabId);
    if (!tab || tab.id === undefined) throw new Error('没有可用的标签页');
    return tab;
  }

  function browserBlocked() {
    if (!self.MAPUS_BROWSER) return '浏览器控制模块未就绪，请重新加载扩展';
    if (self.MAPUS_GATE && !self.MAPUS_GATE.isEnabled()) return 'MAPUS 已停用，请先在侧边栏重新启用';
    return '';
  }

  async function withBrowser(fn) {
    const blockedReason = browserBlocked();
    if (blockedReason) return fail(blockedReason);
    try {
      return await fn();
    } catch (error) {
      return fail((error && error.message) || String(error));
    }
  }

  async function pageTab(tabId) {
    const tab = await resolveTab(tabId);
    if (!tab) return { error: '没有可用的标签页' };
    if (!inspectable(tab.url)) return { error: '当前页面不支持脚本注入（内部页面）' };
    return { tab };
  }

  async function inPage(name, tabId, args) {
    const ready = await pageTab(tabId);
    if (ready.error) return ready;
    const func = self.MAPUS_PAGEFN && self.MAPUS_PAGEFN[name];
    if (typeof func !== 'function') return { error: '页面侧函数未就绪，请重新加载扩展' };
    try {
      const [entry] = await chrome.scripting.executeScript({
        target: { tabId: ready.tab.id },
        world: 'ISOLATED',
        func,
        args: args || []
      });
      return entry && entry.result !== undefined ? entry.result : { error: '页面没有返回数据' };
    } catch (error) {
      return { error: `页面执行失败：${error.message}` };
    }
  }

  const TOOL_SPECS = [
    {
      name: 'page_context',
      description: '获取当前标签页的整体上下文：URL、标题、扫描进度、各类敏感数据数量、安全风险条目、技术栈、隐私防护统计、脚本状态。回答站点的任何问题前应先调用它。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => buildContext(params && params.tabId)
    },
    {
      name: 'scan_findings',
      description: '读取敏感数据扫描明细。keys 可指定类型（domains/apis/absoluteApis/urls/credentials/cookies/idKeys/phones/emails/idcards/ips/companies/jwts/jsFiles/vueFiles/docFiles/moduleFiles/githubUrls），keyword 做子串过滤，limit 默认 30。',
      parameters: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string' }, description: '要读取的类型，缺省为全部' },
          keyword: { type: 'string', description: '仅返回包含该子串的条目' },
          limit: { type: 'number', description: '每种类型最多返回条数，默认 30，最大 200' }
        },
        additionalProperties: false
      },
      run: async params => {
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        const results = await scanResults(tab.id);
        if (!results) return fail('页面扫描数据不可用，请先点击“扫描”或刷新页面');
        const limit = Math.max(1, Math.min(200, Number(params.limit) || 30));
        const keyword = typeof params.keyword === 'string' ? params.keyword.toLowerCase() : '';
        const keys = Array.isArray(params.keys) && params.keys.length
          ? params.keys.filter(key => key in COUNT_LABELS)
          : Object.keys(COUNT_LABELS);
        const out = {};
        for (const key of keys) {
          const list = results[key];
          if (!Array.isArray(list)) continue;
          let items = list.map(item => (typeof item === 'string' ? item : JSON.stringify(item)));
          if (keyword) items = items.filter(item => item.toLowerCase().includes(keyword));
          if (!items.length) continue;
          out[COUNT_LABELS[key]] = { count: items.length, sample: items.slice(0, limit) };
        }
        if (!Object.keys(out).length) return { note: '没有匹配的扫描数据', availableTypes: Object.keys(COUNT_LABELS) };
        return { tabId: tab.id, types: out };
      }
    },
    {
      name: 'fingerprints',
      description: '读取技术栈识别结果（服务器、框架、CDN、面板、分析工具等）。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => {
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        if (!self.MAPUS || !self.MAPUS.flattenFingerprints) return fail('特征模块未就绪');
        const list = self.MAPUS.flattenFingerprints(tab.id) || [];
        return { count: list.length, items: list.map(item => ({ type: item.type, name: item.name, value: item.value, header: item.header })) };
      }
    },
    {
      name: 'anti_state',
      description: '读取隐私防护状态：是否开启、UA 伪装、本站拦截次数、最近的拦截目标、页面内命中的追踪与特征采集行为。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => {
        if (!self.MAPUS_ANTI) return fail('隐私防护模块未就绪');
        const tab = await resolveTab(params && params.tabId);
        const url = (tab && tab.url) || '';
        const config = await self.MAPUS_ANTI.readConfig();
        const status = await self.MAPUS_ANTI.siteStatus(url);
        return {
          config: {
            isEnabled: config.isEnabled, fingerprintEnabled: config.fingerprintEnabled,
            webrtcEnabled: config.webrtcEnabled, uaRotationEnabled: config.uaRotationEnabled,
            notifyOnBlock: config.notifyOnBlock, autoCleanPrevDomain: config.autoCleanPrevDomain
          },
          site: status.site,
          blocks: status.blocks,
          recentBlocks: (status.recent || []).map(item => ({ rule: item.rule, url: item.url })),
          findings: (status.findings || []).map(item => ({ name: item.name, detail: item.detail, level: item.level })),
          currentUA: (status.ua && status.ua.ua) || ''
        };
      }
    },
    {
      name: 'hook_state',
      description: '读取脚本注入状态：生效范围（standard/global）、已启用脚本、已生效脚本，以及全部可配置脚本清单。',
      parameters: {
        type: 'object',
        properties: { includeCatalog: { type: 'boolean', description: '是否返回全部脚本清单' } },
        additionalProperties: false
      },
      run: async params => {
        if (!self.MAPUS_ADB || !self.MAPUS_ADB.ready) return fail('脚本模块未就绪');
        const service = await self.MAPUS_ADB.ready;
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        const state = await service.execute('state.get', { tabId: tab.id }, { source: 'extension' });
        const out = {
          mode: state.mode,
          enabledScripts: state.enabledScripts || [],
          appliedScripts: state.appliedScripts || [],
          requiresReload: state.requiresReload === true
        };
        if (params && params.includeCatalog) {
          const catalog = await service.execute('scripts.list', {}, { source: 'extension' });
          out.catalog = (catalog.scripts || []).filter(item => !item.hidden)
            .map(item => ({ id: item.id, name: item.name, category: item.category, description: item.description }));
        }
        return out;
      }
    },
    {
      name: 'dom_query',
      description: '用 CSS 选择器在页面里查询元素，返回数量、文本片段与指定属性。用于确认页面结构、表单、按钮、隐藏元素。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器，例如 input[type=password]' },
          limit: { type: 'number', description: '最多返回多少个元素，默认 20' },
          attributes: { type: 'array', items: { type: 'string' }, description: '要读取的属性名，例如 ["href","name"]' }
        },
        required: ['selector'],
        additionalProperties: false
      },
      run: async params => {
        const selector = String((params && params.selector) || '').trim();
        if (!selector) return fail('selector 不能为空');
        const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
        const attributes = Array.isArray(params.attributes) ? params.attributes.slice(0, 8).map(String) : [];
        return await inPage('domQuery', params && params.tabId, [selector, limit, attributes]);
      }
    },
    {
      name: 'page_text',
      description: '读取页面可见文本（已剔除 script/style），用于理解页面业务与提示信息。maxChars 默认 4000，最大 20000。',
      parameters: {
        type: 'object',
        properties: { maxChars: { type: 'number', description: '最多返回多少字符' } },
        additionalProperties: false
      },
      run: async params => {
        const maxChars = Math.max(200, Math.min(20000, Number(params && params.maxChars) || 4000));
        return await inPage('pageText', params && params.tabId, [maxChars]);
      }
    },
    {
      name: 'page_storage',
      description: '读取页面的 localStorage / sessionStorage 条目（键名与长度；includeValues 为 true 时附带截断后的值），或读取 Cookie。用于分析登录态与本地缓存。',
      parameters: {
        type: 'object',
        properties: {
          storage: { type: 'string', enum: ['local', 'session', 'cookie'], description: '要读取的存储类型' },
          includeValues: { type: 'boolean', description: '是否返回值内容（默认 false，只返回键名和长度）' },
          limit: { type: 'number', description: '最多返回条数，默认 40' }
        },
        additionalProperties: false
      },
      run: async params => {
        const which = ['local', 'session', 'cookie'].includes(params && params.storage) ? params.storage : 'local';
        const includeValues = params && params.includeValues === true;
        const limit = Math.max(1, Math.min(200, Number(params.limit) || 40));
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        if (which === 'cookie') {
          try {
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            return {
              type: 'cookie',
              count: cookies.length,
              items: cookies.slice(0, limit).map(cookie => ({
                name: cookie.name,
                domain: cookie.domain,
                httpOnly: cookie.httpOnly,
                secure: cookie.secure,
                sameSite: cookie.sameSite,
                value: includeValues ? String(cookie.value || '').slice(0, 120) : undefined,
                length: String(cookie.value || '').length
              }))
            };
          } catch (error) { return fail('读取 Cookie 失败：' + error.message); }
        }
        return await inPage('pageStorage', tab.id, [which, includeValues, limit]);
      }
    },
    {
      name: 'collect_endpoints',
      description: '收集页面里出现的脚本地址、样式/资源链接和疑似接口路径（从 DOM 与内联脚本正则提取）。用于梳理站点接口面。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => await inPage('collectEndpoints', params && params.tabId, [])
    },
    {
      name: 'run_scan',
      description: '让当前页面重新执行一次敏感数据扫描（会清空旧的扫描结果并重新分析）。调用后需要等待几秒才能读到新结果。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => {
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        if (!inspectable(tab.url)) return fail('当前页面不支持扫描');
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'RUN_SCAN', tabId: tab.id, from: 'agent' });
          return { started: true, tabId: tab.id, hint: '扫描已开始，约 2–5 秒后可调用 page_context 查看结果' };
        } catch (error) { return fail('触发扫描失败：' + error.message); }
      }
    },
    {
      name: 'set_anti_setting',
      description: '修改隐私防护开关。key 可选：isEnabled（总开关）、fingerprintEnabled（特征保护）、webrtcEnabled（WebRTC 防护）、uaRotationEnabled（UA 伪装）、notifyOnBlock（拦截通知）、autoCleanPrevDomain（切换主域自动清理）。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: ['isEnabled', 'fingerprintEnabled', 'webrtcEnabled', 'uaRotationEnabled', 'notifyOnBlock', 'autoCleanPrevDomain'] },
          value: { type: 'boolean' }
        },
        required: ['key', 'value'],
        additionalProperties: false
      },
      run: async params => {
        const allowed = ['isEnabled', 'fingerprintEnabled', 'webrtcEnabled', 'uaRotationEnabled', 'notifyOnBlock', 'autoCleanPrevDomain'];
        if (!allowed.includes(params && params.key)) return fail('不支持的设置项');
        await chrome.storage.local.set({ [params.key]: params.value === true });
        const config = self.MAPUS_ANTI ? await self.MAPUS_ANTI.readConfig() : null;
        return { ok: true, config };
      }
    },
    {
      name: 'set_hook_script',
      description: '启用或停用某个脚本（含调试防护脚本）。脚本 id 可通过 hook_state（includeCatalog=true）获取，例如 Bypass_Debugger、Hook_cookie、hook_fetch。改动后需要刷新页面才生效。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '脚本 id' },
          enabled: { type: 'boolean' }
        },
        required: ['id', 'enabled'],
        additionalProperties: false
      },
      run: async params => {
        if (!self.MAPUS_ADB || !self.MAPUS_ADB.ready) return fail('脚本模块未就绪');
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        const service = await self.MAPUS_ADB.ready;
        try {
          const result = await service.execute('scripts.set', {
            tabId: tab.id,
            scope: 'hostname',
            changes: [{ id: String(params.id), enabled: params.enabled === true }],
            apply: 'next_navigation'
          }, { source: 'extension' });
          return { ok: true, enabledScripts: result.enabledScripts, requiresReload: true };
        } catch (error) {
          return fail(`${error.message}${error.details && error.details.scriptId ? '（' + error.details.scriptId + '）' : ''}`);
        }
      }
    },
    {
      name: 'clear_site_data',
      description: '清除当前站点的 Cookie、localStorage、IndexedDB、缓存等数据（不可撤销，仅用户明确要求时调用）。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => {
        if (!self.MAPUS_ANTI) return fail('隐私防护模块未就绪');
        const tab = await resolveTab(params && params.tabId);
        if (!tab) return fail('没有可用的标签页');
        try {
          const result = await self.MAPUS_ANTI.clearSiteData(tab.url);
          return { ok: true, ...result };
        } catch (error) { return fail('清理失败：' + error.message); }
      }
    },
    {
      name: 'open_page_tool',
      description: '在当前页面右下角打开一个取证面板。tool 可选：endpoint-finder（JS 端点发现）、sensitive-dir-finder（敏感目录探测）、dom-xss-detector（DOM XSS 检测）、prototype-pollution（原型污染检测）。',
      parameters: {
        type: 'object',
        properties: { tool: { type: 'string', enum: ['endpoint-finder', 'sensitive-dir-finder', 'dom-xss-detector', 'prototype-pollution'] } },
        required: ['tool'],
        additionalProperties: false
      },
      run: async params => {
        const tool = String((params && params.tool) || '');
        if (!['endpoint-finder', 'sensitive-dir-finder', 'dom-xss-detector', 'prototype-pollution'].includes(tool)) return fail('不支持的工具');
        const ready = await pageTab(params && params.tabId);
        if (ready.error) return ready;
        try {
          const rules = self.MAPUS_RULES ? await self.MAPUS_RULES.runtime() : null;
          if (!rules) return fail('规则配置读取失败');
          const applyConfig = self.MAPUS_PAGEFN && self.MAPUS_PAGEFN.applyConfig;
          if (typeof applyConfig !== 'function') return fail('页面侧函数未就绪');
          await chrome.scripting.executeScript({
            target: { tabId: ready.tab.id },
            world: 'MAIN',
            func: applyConfig,
            args: [rules]
          });
          await chrome.scripting.executeScript({ target: { tabId: ready.tab.id }, world: 'MAIN', files: ['content/modules/toolkit.js'] });
          await chrome.scripting.executeScript({ target: { tabId: ready.tab.id }, world: 'MAIN', files: [`content/modules/${tool}.js`] });
          return { ok: true, tool, hint: '取证面板已在页面右下角打开，结果不会回传到对话里' };
        } catch (error) { return fail('注入失败：' + error.message); }
      }
    },



    {
      name: 'browser_tabs',
      description: '管理浏览器标签页。action=list 列出所有标签页（含 tabId、标题、URL）；activate 切到某个标签页；open 新开一个；close 关掉；detach 断开调试器（页面顶部黄条会消失）。要操作别的标签页时先 list 拿 tabId，再在后续工具里传 tabId。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'activate', 'open', 'close', 'detach'] },
          targetTabId: { type: 'number', description: 'activate / close / detach 的目标标签页 id' },
          url: { type: 'string', description: 'open 时要打开的地址' },
          active: { type: 'boolean', description: 'open 时是否立即切过去，默认 true' }
        },
        required: ['action'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const action = params.action || 'list';
        if (action === 'open') {
          return await self.MAPUS_BROWSER.tabs(null, { action, url: params.url, active: params.active !== false });
        }
        if (action === 'list') {
          const tab = await resolveTab(params.tabId);
          return await self.MAPUS_BROWSER.tabs(tab ? tab.id : null, { action });
        }
        return await self.MAPUS_BROWSER.tabs(params.tabId, { action, targetTabId: params.targetTabId });
      })
    },
    {
      name: 'browser_navigate',
      description: '让页面跳转：action=goto 打开 url；back / forward 走历史；reload 刷新（hard=true 忽略缓存）。这是真正驱动浏览器导航，会触发完整的加载流程与 Cookie 变化。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['goto', 'back', 'forward', 'reload'], description: '默认 goto（给了 url 时）或 reload' },
          url: { type: 'string', description: 'goto 的目标地址，可省略协议' },
          hard: { type: 'boolean', description: 'reload 时忽略缓存' },
          settleMs: { type: 'number', description: '导航后等待多少毫秒再返回，默认 500' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.go(tab.id, {
          action: params.action, url: params.url, hard: params.hard === true, settleMs: params.settleMs
        });
      })
    },
    {
      name: 'browser_snapshot',
      description: '拍一份页面结构快照：返回当前页所有可交互元素（链接、按钮、输入框、下拉、可编辑区、带 role 的控件），每个带 ref（如 e3）、CSS selector、可见性和坐标。这是你在页面上操作的眼睛，点击/输入前先拍一次。比 dom_query 更适合"我要操作这个页面"。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '最多返回多少元素，默认 120，最大 300' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.snapshot(tab.id, params.limit);
      })
    },
    {
      name: 'browser_click',
      description: '用真实鼠标事件点击页面元素（走 CDP Input，isTrusted=true，能触发站点里对真实交互的校验，也能过掉只认真实点击的按钮）。selector 或 ref 二选一，ref 来自 browser_snapshot。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          ref: { type: 'string', description: 'browser_snapshot 返回的 ref，如 e3' },
          button: { type: 'string', enum: ['left', 'right'], description: '默认 left' },
          clickCount: { type: 'number', description: '2 表示双击' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.click(tab.id, params.selector || params.ref, {
          button: params.button, clickCount: params.clickCount
        });
      })
    },
    {
      name: 'browser_type',
      description: '往输入框真实打字（CDP Input.insertText，会触发 input 事件，React/Vue 受控组件也能收到）。clear=true 先清空原值，submit=true 打完回车。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          ref: { type: 'string' },
          text: { type: 'string', description: '要输入的内容' },
          clear: { type: 'boolean', description: '是否先清空' },
          submit: { type: 'boolean', description: '是否在输入后回车' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        if (!params.selector && !params.ref) return fail('需要 selector 或 ref');
        return await self.MAPUS_BROWSER.type(tab.id, params);
      })
    },
    {
      name: 'browser_key',
      description: '发送键盘事件，支持组合键（"Enter"、"Tab"、"Escape"、"Control+A"、"Meta+Enter"）。给 selector/ref 会先点一下再按键。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '键名或组合，例如 Enter / Tab / Control+A' },
          selector: { type: 'string' },
          ref: { type: 'string' }
        },
        required: ['key'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.key(tab.id, params);
      })
    },
    {
      name: 'browser_scroll',
      description: '滚动页面。to=bottom/top 滚到底或顶；deltaY 滚指定像素（负值向上）；给 selector/ref 则把该元素滚到视口中间（懒加载列表常用）。',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', enum: ['top', 'bottom'] },
          deltaY: { type: 'number', description: '滚动像素，默认 600' },
          x: { type: 'number' },
          y: { type: 'number' },
          selector: { type: 'string' },
          ref: { type: 'string' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.scroll(tab.id, params);
      })
    },
    {
      name: 'browser_hover',
      description: '把鼠标移到元素上并悬停，用于触发 hover 才出现菜单/提示的场景。悬停后建议再 browser_snapshot 看新出现的元素。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' }, ref: { type: 'string' } },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        if (!params.selector && !params.ref) return fail('需要 selector 或 ref');
        return await self.MAPUS_BROWSER.hover(tab.id, params.selector || params.ref);
      })
    },
    {
      name: 'browser_select',
      description: '选择下拉框（select）的选项，value 可以给 option 的 value 或可见文本。会触发 input/change 事件。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          ref: { type: 'string' },
          value: { type: 'string', description: 'option 的 value 或显示文本' }
        },
        required: ['value'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.select(tab.id, params);
      })
    },
    {
      name: 'browser_screenshot',
      description: '截图并直接显示在侧边栏对话里（用户能看到）。fullPage=true 截整页。注意：你自己读不到图片内容，别指望用截图代替 browser_snapshot 或 page_text。',
      parameters: {
        type: 'object',
        properties: { fullPage: { type: 'boolean', description: '是否截整页' } },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.screenshot(tab.id, { fullPage: params.fullPage === true });
      })
    },
    {
      name: 'browser_network',
      description: '读取真实网络流量（CDP Network 域，比页面内 hook 更底层、不受页面改写影响）：method、URL、状态码、类型、耗时、大小、POST 体。keyword 过滤，includeBody=true 拉响应体（前 2000 字）。找接口、验越权、看回包都靠它。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '按 URL 或 method 过滤，例如 api 或 POST' },
          limit: { type: 'number', description: '最多返回多少条，默认 40' },
          includeBody: { type: 'boolean', description: '是否拉取响应体（会慢一些）' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.network(tab.id, params);
      })
    },
    {
      name: 'browser_console',
      description: '读取页面的控制台输出与未捕获异常（CDP 捕获，包括页面自己 console.log 的内容和被 try/catch 之外抛出的错误）。level 可过滤 error/warning/log。排查页面为什么不动、JS 报什么错时用。',
      parameters: {
        type: 'object',
        properties: {
          level: { type: 'string', description: 'all / error / warning / log 等' },
          limit: { type: 'number', description: '最多返回多少条，默认 40' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.console(tab.id, params);
      })
    },
    {
      name: 'browser_wait',
      description: '等页面到位再继续：selector 出现（或 text 出现）、state=hidden 等它消失、networkIdle=true 等网络安静下来、或干脆 ms 固定等待。默认超时 8 秒。点完按钮等异步渲染时必备。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          text: { type: 'string', description: '等某段文字出现在页面上' },
          state: { type: 'string', enum: ['visible', 'hidden'], description: '期望的状态，默认 visible' },
          networkIdle: { type: 'boolean', description: '等网络安静' },
          idleMs: { type: 'number', description: '网络安静判定阈值，默认 600' },
          ms: { type: 'number', description: '固定等待毫秒数' },
          timeoutMs: { type: 'number', description: '超时，默认 8000，最大 30000' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.waitFor(tab.id, params);
      })
    },
    {
      name: 'browser_eval',
      description: '在页面主世界（MAIN world）执行任意 JS 并拿回结果，不受页面 CSP 限制，能直接读写页面的全局变量、框架实例、加密函数。这是最深的一层控制：绕不过去的验证就在这儿解，比如直接调页面自己的加密函数生成签名。返回值必须可 JSON 序列化。',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '要执行的表达式或 IIFE，可用 return' },
          awaitPromise: { type: 'boolean', description: '结果是 Promise 时是否等它，默认 true' }
        },
        required: ['expression'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        const value = await self.MAPUS_BROWSER.evaluate(tab.id, params.expression, {
          awaitPromise: params.awaitPromise !== false
        });
        let text;
        try { text = JSON.stringify(value); } catch (_) { text = String(value); }
        return {
          ok: true,
          type: value === null ? 'null' : typeof value,
          value: text && text.length > 6000 ? text.slice(0, 6000) + '…' : value
        };
      })
    },
    {
      name: 'browser_upload',
      description: '给文件输入框设置本地文件（CDP DOM.setFileInputFiles）。files 是绝对路径数组。用于测上传功能、绕不过去的文件校验场景。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          ref: { type: 'string' },
          files: { type: 'array', items: { type: 'string' }, description: '本地文件的绝对路径' }
        },
        required: ['files'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.upload(tab.id, params);
      })
    },
    {
      name: 'browser_dialog',
      description: '处理 alert/confirm/prompt。默认策略是自动接受并记录；policy=dismiss 改成自动取消，policy=accept 恢复。resolve=true 立刻处理当前挂起的那个对话框。',
      parameters: {
        type: 'object',
        properties: {
          policy: { type: 'string', enum: ['accept', 'dismiss'] },
          resolve: { type: 'boolean', description: '立即处理当前挂起的对话框' },
          accept: { type: 'boolean' },
          promptText: { type: 'string', description: 'prompt 要填的内容' }
        },
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.dialog(tab.id, params);
      })
    },
    {
      name: 'browser_emulate',
      description: '改浏览器环境骗过页面：action=viewport 改视口与移动端标识（width/height/mobile）；ua 换 UA；geo 改地理位置；timezone 改时区；network 改网络（offline/latency/限速）；reset 全部还原。测响应式、绕设备限制、伪造来源都用它。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['viewport', 'ua', 'geo', 'timezone', 'network', 'reset'] },
          width: { type: 'number' },
          height: { type: 'number' },
          mobile: { type: 'boolean' },
          userAgent: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          timezoneId: { type: 'string' },
          offline: { type: 'boolean' },
          latency: { type: 'number' },
          downloadKbps: { type: 'number' },
          uploadKbps: { type: 'number' }
        },
        required: ['action'],
        additionalProperties: false
      },
      run: params => withBrowser(async () => {
        const tab = await currentTab(params.tabId);
        return await self.MAPUS_BROWSER.emulation(tab.id, params);
      })
    },
    {
      name: 'probe_http',
      description: '从后台直接向目标发任意 HTTP 请求（等价 curl）：可自定义方法、路径、头、Body，携带浏览器 Cookie，无视页面 CSP 与同源限制。SQL 注入、命令注入、越权、未授权访问、爆破等服务器端问题全靠它验证。返回完整状态码、响应头、响应体（截断）。相对路径会自动拼到当前站点。',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP 方法，默认 GET' },
          path: { type: 'string', description: '路径或完整 URL；相对路径（如 /vulnerabilities/sqli/?id=1）自动拼接当前标签页的源站' },
          headers: { type: 'object', description: '额外请求头，如 {"Content-Type":"application/x-www-form-urlencoded"}' },
          cookies: { type: 'object', description: '要写入的 Cookie，如 {"security":"low"}，写入后随请求自动携带' },
          body: { type: 'string', description: '请求体（POST/PUT 用）' },
          timeoutMs: { type: 'number', description: '超时毫秒，默认 15000，最大 60000' }
        },
        additionalProperties: false
      },
      run: async params => {
        let url = String(params.path || '/');
        if (!/^https?:\/\//i.test(url)) {
          const tab = await currentTab(params.tabId);
          if (!tab || !tab.url) return { error: '拿不到当前站点源站，请给完整 URL' };
          const origin = new URL(tab.url).origin;
          url = origin + (url.startsWith('/') ? url : '/' + url);
        }
        const method = String(params.method || 'GET').toUpperCase();
        const controller = new AbortController();
        const timeout = Math.max(2000, Math.min(60000, Number(params.timeoutMs) || 15000));
        const timer = setTimeout(() => controller.abort(), timeout);
        const started = Date.now();
        try {
          if (params.cookies && typeof params.cookies === 'object') {
            const target = new URL(url);
            for (const [name, val] of Object.entries(params.cookies)) {
              await chrome.cookies.set({ url: target.origin, name: String(name), value: String(val), path: '/' });
            }
          }
          const headers = {};
          for (const [key, value] of Object.entries(params.headers && typeof params.headers === 'object' ? params.headers : {})) {
            if (!/^(cookie|host|content-length|origin|referer)$/i.test(key)) headers[key] = String(value);
          }
          const init = { method, headers, signal: controller.signal, credentials: 'include' };
          if (params.body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = String(params.body);
          const response = await fetch(url, init);
          const text = await response.text();
          const respHeaders = [...response.headers.entries()].map(([key, value]) => `${key}: ${value}`).join('\n');
          return {
            ok: true,
            request: { method, url, headers: Object.keys(headers).length ? JSON.stringify(headers) : '', body: String(params.body || '') },
            status: response.status,
            statusText: response.statusText,
            responseHeaders: respHeaders,
            contentType: response.headers.get('content-type') || '',
            ms: Date.now() - started,
            body: text.length > 16000 ? text.slice(0, 16000) + `…[共 ${text.length} 字符]` : text
          };
        } catch (error) {
          return { error: `${method} ${url} 失败：${error.message}`, ms: Date.now() - started };
        } finally {
          clearTimeout(timer);
        }
      }
    },
    {
      name: 'report_vulnerability',
      description: '确认风险后立即上报。必须给 title、severity、url、evidence.request、evidence.response（用 probe_http 的真实返回填，不要编造）。可选 cwe、param、description、reproduction、remediation、evidence.screenshot(dataURL，来自 browser_screenshot 的 data 字段)。返回值会列出该站点已上报的全部风险，用于避免重复上报。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '风险标题，如「接口未鉴权可读取全部用户数据」' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          cwe: { type: 'string', description: '如 CWE-89' },
          url: { type: 'string', description: '风险所在 URL' },
          param: { type: 'string', description: '参数名，如 id' },
          description: { type: 'string', description: '风险原理与影响，2~5 句' },
          reproduction: { type: 'string', description: '复现步骤' },
          remediation: { type: 'string', description: '修复建议' },
          confidence: { type: 'string', enum: ['confirmed', 'probable', 'possible'] },
          evidence: {
            type: 'object',
            properties: {
              request: {
                type: 'object',
                properties: {
                  method: { type: 'string' }, url: { type: 'string' },
                  headers: { type: 'string' }, body: { type: 'string' }
                },
                additionalProperties: false
              },
              response: {
                type: 'object',
                properties: {
                  status: { type: 'number' }, statusText: { type: 'string' },
                  headers: { type: 'string' }, body: { type: 'string' }
                },
                additionalProperties: false
              },
              screenshot: { type: 'string', description: 'dataURL 截图，选填' },
              shotId: { type: 'string', description: 'browser_screenshot 返回的 shotId，会自动转成截图放进报告' }
            },
            additionalProperties: false
          }
        },
        required: ['title', 'severity', 'url', 'evidence'],
        additionalProperties: false
      },
      run: async params => {
        const tab = await currentTab(params.tabId);
        const input = { ...params };
        if (input.evidence && input.evidence.shotId && !input.evidence.screenshot) {
          const shot = await self.MAPUS_BROWSER.getShot(String(input.evidence.shotId));
          if (shot && shot.dataUrl) input.evidence = { ...input.evidence, screenshot: shot.dataUrl };
        }
        const result = await self.MAPUS_FINDINGS.add({
          ...input,
          taskId: taskContext && taskContext.taskId ? taskContext.taskId : '',
          host: tab && tab.url ? new URL(tab.url).host : ''
        });
        if (result.error) return result;
        if (!result.duplicate) {
          activeEmit({ type: 'finding', findingId: result.findingId, title: params.title, severity: params.severity });
        }
        return result;
      }
    },
    {
      name: 'findings_list',
      description: '查看当前站点已上报的全部风险（标题/等级/CWE），上报前先看一眼避免重复。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async params => {
        const tab = await currentTab(params.tabId);
        const host = tab && tab.url ? new URL(tab.url).host : '';
        const list = await self.MAPUS_FINDINGS.listBySite(host);
        return { ok: true, total: list.length, findings: list.map(item => ({ id: item.id, title: item.title, severity: item.severity, cwe: item.cwe, url: item.url })) };
      }
    }
  ];

  let activeEmit = () => { };
  let taskContext = null;

  const TOOL_MAP = new Map(TOOL_SPECS.map(spec => [spec.name, spec]));

  function toolSchema() {
    return TOOL_SPECS.map(spec => ({
      type: 'function',
      function: { name: spec.name, description: spec.description, parameters: spec.parameters }
    }));
  }

  function toolList() {
    return TOOL_SPECS.map(spec => ({
      name: spec.name,
      description: spec.description.split('。')[0] + '。',
      parameters: spec.parameters
    }));
  }

  async function runTool(name, args, tabId) {
    const spec = TOOL_MAP.get(name);
    if (!spec) return { error: `未知工具：${name}` };
    let params = args && typeof args === 'object' ? { ...args } : {};
    if (params.tabId !== undefined) {
      const numeric = Number(params.tabId);
      if (Number.isFinite(numeric)) params.tabId = numeric;
      else delete params.tabId;
    }
    if (params.tabId === undefined) params.tabId = tabId;
    try {
      const result = await spec.run(params);
      return result === undefined ? { ok: true } : result;
    } catch (error) {
      return { error: error.message || String(error) };
    }
  }

  function systemPrompt(context, budget) {
    const conf = agentRules();
    const base = (conf && conf.systemPrompt) || '你是 MAPUS 的安全测试智能体。';
    const lines = [base];
    if (context) {
      lines.push('', '【当前现场】', `标签页：${context.title || '(无标题)'}`, `URL：${context.url || '(未知)'}`);
      if (context.counts && Object.keys(context.counts).length) {
        const summary = Object.entries(context.counts)
          .filter(([, count]) => count > 0)
          .map(([key, count]) => `${COUNT_LABELS[key]} ${count}`)
          .join('、');
        lines.push(`已扫描到：${summary}（合计 ${context.total} 条，进度 ${context.progress === null ? '未知' : context.progress + '%'}）`);
      } else if (context.scanMissing) {
        lines.push('注意：当前页面还没有扫描数据，需要时可调用 run_scan 后再读取。');
      }
      if (context.anti) lines.push(`隐私防护：${context.anti.isEnabled ? '已开启' : '已关闭'}，本站拦截 ${context.anti.blocks} 次，页面特征 ${(context.anti.findings || []).length} 条`);
      if (context.hooks) lines.push(`脚本：模式 ${context.hooks.mode}，已启用 ${(context.hooks.enabled || []).join('、') || '无'}`);
      if (context.fingerprints && context.fingerprints.length) {
        lines.push(`浏览器特征：${context.fingerprints.slice(0, 8).map(item => item.name).join('、')}`);
      }
      if (context.note) lines.push(context.note);
    }
    if (budget) {
      const total = Math.max(1, budget.total);
      const used = Math.max(0, Math.min(total, budget.used));
      const index = Math.min(used + 1, total);
      const left = Math.max(0, total - used);
      lines.push('', `【步数预算】现在是第 ${index} / ${total} 步，本步之后还剩 ${Math.max(0, left - 1)} 次工具调用。`);
      lines.push('每步只允许一个动作：这一轮只能给出一个 function call，必须等它的观察结果回来再决定下一步。多给的系统只执行第一个，其余作废。');
      if (left <= 1) lines.push('这是最后一步：这一步拿到数据后必须收口，下一轮不再有工具，直接按输出模板给结论，未验证的标成盲区。');
      else if (left <= 3) lines.push('只剩几步了：优先补最关键的证据，别再铺开新的方向。');
      else if (total > 12) lines.push('预算充足：可以把主线挖透（取证 → 验证 → 交叉印证），但每一步都要有明确目的，别原地打转或重复同一个动作。');
      else lines.push('够用就收口，不要为了调用而调用。');
    }
    return lines.join('\n');
  }

  function historyMessages(history) {
    const out = [];
    for (const item of history) {
      if (!item || !item.role) continue;
      if (item.role === 'user') {
        if (item.content) out.push({ role: 'user', content: String(item.content) });
        continue;
      }
      if (item.role !== 'assistant') continue;
      const text = item.content ? String(item.content) : '';
      const tools = Array.isArray(item.tools) ? item.tools.filter(tool => tool && tool.name) : [];
      if (!tools.length) {
        if (text) out.push({ role: 'assistant', content: text });
        continue;
      }
      const calls = tools.map((tool, index) => ({
        id: String(tool.id || `hist_${out.length}_${index}`),
        type: 'function',
        function: { name: String(tool.name), arguments: JSON.stringify(tool.args || {}) }
      }));
      out.push({ role: 'assistant', content: text, tool_calls: calls });
      for (let index = 0; index < calls.length; index++) {
        const tool = tools[index];
        const preview = typeof tool.preview === 'string' && tool.preview ? tool.preview : '{"note":"历史观察无内容"}';
        out.push({
          role: 'tool',
          tool_call_id: calls[index].id,
          content: `[历史观察${tool.ok === false ? '·失败' : ''}] ${preview}`.slice(0, 4000)
        });
      }
    }
    const limit = 40;
    if (out.length <= limit) return out;
    let start = out.length - limit;
    while (start < out.length && out[start] && out[start].role === 'tool') start += 1;
    return start >= out.length ? out.slice(-1) : out.slice(start);
  }

  function sanitizeMessages(messages) {
    const start = messages[0] && messages[0].role === 'system' ? 1 : 0;
    const pending = [];
    const drop = [];
    for (let index = start; index < messages.length; index++) {
      const item = messages[index];
      if (!item) { drop.push(index); continue; }
      if (item.role === 'assistant') {
        const calls = Array.isArray(item.tool_calls)
          ? item.tool_calls.filter(call => call && call.function && call.function.name)
          : [];
        if (!calls.length) {
          if (item.tool_calls) delete item.tool_calls;
          pending.length = 0;
          continue;
        }
        item.tool_calls = calls;
        pending.length = 0;
        for (const call of calls) if (call.id) pending.push(String(call.id));
        continue;
      }
      if (item.role === 'tool') {
        const id = String(item.tool_call_id || '');
        const slot = id ? pending.indexOf(id) : -1;
        if (slot >= 0) { pending.splice(slot, 1); continue; }
        messages[index] = { role: 'user', content: `[工具观察] ${String(item.content || '').slice(0, 8000)}` };
      }
    }
    for (let index = drop.length - 1; index >= 0; index--) messages.splice(drop[index], 1);
    for (const id of pending) {
      messages.push({ role: 'tool', tool_call_id: id, content: '{"note":"该动作没有留下观察结果，请直接继续"}' });
    }
    return messages;
  }

  function repairToolHistory(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const item = messages[index];
      if (!item || item.role !== 'tool') continue;
      messages.splice(index, 1);
    }
    for (let index = messages.length - 1; index >= 0; index--) {
      const item = messages[index];
      if (!item || item.role !== 'assistant' || !item.tool_calls) continue;
      delete item.tool_calls;
      if (!item.content) messages.splice(index, 1);
    }
    for (let index = messages.length - 2; index >= 1; index--) {
      const item = messages[index];
      const previous = messages[index - 1];
      if (item && item.role === 'assistant' && previous && previous.role === 'assistant') {
        const merged = `${previous.content || ''}\n${item.content || ''}`.trim();
        previous.content = merged || '（继续）';
        messages.splice(index, 1);
      }
    }
    return messages;
  }

  function endpoint(config) {
    const base = String(config.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('尚未配置模型接口地址');
    return `${base}/chat/completions`;
  }

  function normalizeError(status, text) {
    let detail = '';
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error && (parsed.error.message || parsed.error.type) ? String(parsed.error.message || parsed.error.type) : '';
    } catch (_) { detail = String(text || '').slice(0, 300); }
    if (status === 401) return `鉴权失败（401）：API Key 无效或没有该模型权限${detail ? ' · ' + detail : ''}`;
    if (status === 403) return `无权限（403）${detail ? ' · ' + detail : ''}`;
    if (status === 404) return `接口不存在（404）：请检查 Base URL 是否包含 /v1${detail ? ' · ' + detail : ''}`;
    if (status === 429) return `触发限流（429）：请稍后重试${detail ? ' · ' + detail : ''}`;
    return `模型返回 ${status}${detail ? '：' + detail : ''}`;
  }

  function mergeToolCall(store, delta) {
    const index = Number.isInteger(delta.index) ? delta.index : store.length;
    if (!store[index]) store[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
    const target = store[index];
    if (delta.id) target.id = delta.id;
    if (delta.function) {
      if (delta.function.name) target.function.name += delta.function.name;
      if (delta.function.arguments) target.function.arguments += delta.function.arguments;
    }
    return store;
  }

  const REASONING_KEYS = ['reasoning_content', 'reasoning', 'thinking', 'thinking_content', 'reasoning_text'];

  function pickReasoning(source) {
    if (!source || typeof source !== 'object') return '';
    for (const key of REASONING_KEYS) {
      const value = source[key];
      if (typeof value === 'string' && value) return value;
      if (value && typeof value === 'object') {
        if (typeof value.text === 'string' && value.text) return value.text;
        if (typeof value.content === 'string' && value.content) return value.content;
      }
    }
    return '';
  }

  async function requestOnce(config, messages, options) {
    const controller = new AbortController();
    if (options && options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const body = {
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: Boolean(options && options.stream)
    };
    const tools = toolSchema();
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = options && options.noTools ? 'none' : 'auto';
    }
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    let response;
    try {
      response = await fetch(endpoint(config), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`无法连接模型接口（${config.baseUrl}）：${error.message}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(normalizeError(response.status, text));
      error.status = response.status;
      if (response.status === 400 && /tool/i.test(text) && /tool_calls|role\s*['"]?tool|tool_call_id/i.test(text)) {
        error.repairable = true;
      }
      throw error;
    }
    if (!body.stream) {
      const data = await response.json();
      const choice = (data.choices && data.choices[0]) || {};
      const message = choice.message || {};
      return {
        content: message.content || '',
        reasoning: pickReasoning(message),
        toolCalls: message.tool_calls || [],
        usage: data.usage || null
      };
    }
    return await readStream(response, options && options.onDelta, options && options.onReasoning);
  }

  async function readStream(response, onDelta, onReasoning) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoning = '';
    let usage = null;
    const toolCalls = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(payload); } catch (_) { continue; }
        if (chunk.usage) usage = chunk.usage;
        const choice = (chunk.choices && chunk.choices[0]) || null;
        if (!choice) continue;
        const delta = choice.delta || {};
        const think = pickReasoning(delta);
        if (think) {
          reasoning += think;
          if (onReasoning) onReasoning(think);
        }
        if (typeof delta.content === 'string' && delta.content) {
          content += delta.content;
          if (onDelta) onDelta(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const call of delta.tool_calls) mergeToolCall(toolCalls, call);
        }
      }
    }
    return { content, reasoning, toolCalls: toolCalls.filter(Boolean), usage };
  }


  function trimHistory(messages) {
    const toolIndexes = [];
    for (let index = 0; index < messages.length; index++) {
      if (messages[index] && messages[index].role === 'tool') toolIndexes.push(index);
    }
    const keep = 6;
    for (let cursor = 0; cursor < toolIndexes.length - keep; cursor++) {
      const item = messages[toolIndexes[cursor]];
      const text = String(item.content || '');
      if (text.length <= 1200) continue;
      messages[toolIndexes[cursor]] = {
        ...item,
        content: text.slice(0, 1200) + '\n…（早期观察已截断，需要细节就重新调用对应工具）'
      };
    }
  }

  async function converse(options) {
    const config = await readConfig();
    const profile = options.profile && typeof options.profile === 'object' ? options.profile : null;
    if (profile) {
      if (profile.baseUrl) config.baseUrl = String(profile.baseUrl).trim().replace(/\/+$/, '');
      if (profile.model) config.model = String(profile.model).trim();
      if (profile.apiKey) config.apiKey = String(profile.apiKey);
      if (profile.temperature !== undefined) config.temperature = Math.max(0, Math.min(2, Number(profile.temperature) || 0));
      if (profile.maxTokens !== undefined) config.maxTokens = Math.max(256, Math.min(32000, Number(profile.maxTokens) || 4096));
    }
    if (!config.enabled && !profile) throw new Error('智能体已停用，请到设置里开启');
    if (!config.model) throw new Error('尚未配置模型名称');
    if (!config.baseUrl) throw new Error('尚未配置模型接口地址');

    const tab = await resolveTab(options.tabId);
    const tabId = tab ? tab.id : null;
    let context = null;
    if (config.autoContext && tabId) {
      try { context = await buildContext(tabId); } catch (_) { context = null; }
    }

    const history = Array.isArray(options.messages) ? options.messages : [];
    const steps = Math.max(1, Math.min(200, Number(options.steps) || Number(config.toolRounds) || 40));
    const messages = [{ role: 'system', content: systemPrompt(context, { used: 0, total: steps }) }];
    for (const item of historyMessages(history)) messages.push(item);

    const emit = options.emit || (() => {});
    activeEmit = emit;
    taskContext = options.taskContext || null;
    const signal = options.signal;
    let answer = '';
    let usage = null;
    let lastSignature = '';
    let repeats = 0;
    let used = 0;
    let drained = false;
    let stuck = false;
    let repaired = false;

    for (let step = 0; step <= steps; step++) {
      if (signal && signal.aborted) throw new DOMException('已中止', 'AbortError');
      const allowTools = step < steps;
      messages[0] = { role: 'system', content: systemPrompt(context, { used, total: steps }) };
      emit({ type: 'step', index: Math.min(used + 1, steps), total: steps, used });
      trimHistory(messages);
      const callOptions = {
        stream: config.streaming,
        signal,
        noTools: !allowTools,
        onDelta: chunk => emit({ type: 'delta', text: chunk }),
        onReasoning: chunk => emit({ type: 'reasoning', text: chunk, step: Math.min(used + 1, steps) })
      };
      let reply;
      sanitizeMessages(messages);
      try {
        reply = await requestOnce(config, messages, callOptions);
      } catch (error) {
        if (!error || !error.repairable || repaired) throw error;
        repaired = true;
        repairToolHistory(messages);
        emit({ type: 'delta', text: '\n\n> 历史里的工具回话被模型接口判定不合法，已自动转成文本重发。\n' });
        reply = await requestOnce(config, messages, callOptions);
      }
      usage = reply.usage || usage;
      const calls = (reply.toolCalls || []).filter(call => call && call.function && call.function.name);

      if (!config.streaming && reply.reasoning) emit({ type: 'reasoning', text: reply.reasoning, step: Math.min(used + 1, steps) });
      if (reply.content) {
        answer += reply.content;
        if (!config.streaming) emit({ type: 'delta', text: reply.content });
      }

      if (!calls.length) {
        if (!allowTools) drained = true;
        break;
      }
      if (!allowTools) {
        drained = true;
        emit({ type: 'delta', text: '\n\n> 步数已用完，收口轮的工具调用被忽略，下面是基于已有证据的结论。\n' });
        break;
      }

      const action = calls[0];
      const ignored = calls.slice(1).map(call => call.function.name).filter(Boolean);
      used += 1;

      messages.push({
        role: 'assistant',
        content: reply.content || '',
        tool_calls: [{
          id: action.id || `call_${Math.random().toString(36).slice(2, 9)}`,
          type: 'function',
          function: { name: action.function.name, arguments: action.function.arguments || '{}' }
        }]
      });

      const call = messages[messages.length - 1].tool_calls[0];
      let args = {};
      try { args = call.function.arguments ? JSON.parse(call.function.arguments) : {}; }
      catch (_) { args = {}; }
      emit({ type: 'tool', id: call.id, name: call.function.name, args, step: used });
      const signature = call.function.name + '|' + (call.function.arguments || '');
      if (signature === lastSignature) repeats += 1;
      else { lastSignature = signature; repeats = 0; }
      if (repeats >= 5) {
        emit({
          type: 'delta',
          text: `\n\n> 连续 6 次同工具同参数（${call.function.name}）都被拦下了，这一轮自动停在 ${used} 步。换方向、换参数，或者先给结论再继续。\n`
        });
        stuck = true;
        break;
      }
      const result = repeats >= 2
        ? { error: '重复调用被拦截：与前两次同工具同参数。换工具、换参数，或直接给结论。' }
        : await runTool(call.function.name, args, tabId);
      const text = JSON.stringify(result);
      emit({
        type: 'tool_result',
        id: call.id,
        name: call.function.name,
        ok: !result || !result.error,
        preview: text.length > 400 ? text.slice(0, 400) + '…' : text,
        step: used
      });
      const note = ignored.length ? `（本轮其余 ${ignored.length} 个调用已作废：${ignored.join('、')}。一步只做一个动作。）` : '';
      messages.push({ role: 'tool', tool_call_id: call.id, content: (text.slice(0, 24000) + note) });
    }

    return {
      answer,
      usage,
      steps: used,
      budget: steps,
      exhausted: drained,
      stuck,
      context: context ? { url: context.url, title: context.title, total: context.total } : null
    };
  }

  async function testConnection(patch) {
    const config = patch ? { ...(await readConfig()), ...patch } : await readConfig();
    if (patch && typeof patch.apiKey === 'string' && patch.apiKey === '') config.apiKey = (await readConfig()).apiKey;
    if (!config.baseUrl) return { ok: false, error: '请先填写接口地址' };
    if (!config.model) return { ok: false, error: '请先填写模型名称' };
    try {
      const reply = await requestOnce({ ...config, streaming: false, toolRounds: 0 }, [
        { role: 'system', content: '你是一个连通性测试助手，只回复“pong”。' },
        { role: 'user', content: 'ping' }
      ], { stream: false });
      return { ok: true, model: config.model, sample: String(reply.content || '').slice(0, 80) || '(空响应)' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  const clip = (value, max) => String(value == null ? '' : value).slice(0, max);

  function partText(parts) {
    if (!Array.isArray(parts)) return '';
    return parts.map(part => (part && part.type === 'text' && typeof part.text === 'string' ? part.text : '')).join('');
  }

  function sanitizeParts(parts) {
    if (!Array.isArray(parts)) return [];
    return parts.slice(-80).map(part => {
      if (part && part.type === 'reasoning') {
        return {
          type: 'reasoning',
          text: clip(part.text, 12000),
          step: Number(part.step) > 0 ? Math.min(999, Number(part.step)) : 0
        };
      }
      if (!part || part.type !== 'tool') return { type: 'text', text: clip(part && part.text, 9000) };
      return {
        type: 'tool',
        callId: clip(part.callId, 80),
        name: clip(part.name, 60),
        args: part.args && typeof part.args === 'object' ? part.args : {},
        state: part.state === 'running' ? 'done' : ['done', 'error'].includes(part.state) ? part.state : 'done',
        ok: part.ok !== false,
        step: Number(part.step) > 0 ? Math.min(999, Number(part.step)) : 0,
        preview: clip(part.preview, 1500),
        ms: Number(part.ms) > 0 ? Math.min(600000, Number(part.ms)) : 0
      };
    });
  }

  function sanitizeMessage(message) {
    return {
      id: clip(message && message.id, 80),
      role: message && message.role === 'user' ? 'user' : 'assistant',
      parts: sanitizeParts(message && message.parts),
      error: clip(message && message.error, 600),
      ts: Number(message && message.ts) || Date.now()
    };
  }

  async function readSessionStore() {
    let raw = null;
    try {
      const data = await chrome.storage.local.get(SESSIONS_KEY);
      raw = data && data[SESSIONS_KEY];
    } catch (_) { raw = null; }
    const store = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object'
      ? raw
      : { v: 1, order: [], items: {} };
    if (!Array.isArray(store.order)) store.order = Object.keys(store.items);
    store.order = store.order.filter(id => store.items[id]);
    for (const id of Object.keys(store.items)) if (!store.order.includes(id)) store.order.push(id);
    return store;
  }

  function sessionMeta(session) {
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const first = messages.find(message => message.role === 'user');
    return {
      id: session.id,
      site: session.site || '',
      url: session.url || '',
      title: session.title || '',
      createdAt: session.createdAt || 0,
      updatedAt: session.updatedAt || 0,
      count: messages.length,
      preview: first ? clip(partText(first.parts).replace(/\s+/g, ' ').trim(), 60) : ''
    };
  }

  async function listSessions(site) {
    const store = await readSessionStore();
    return store.order
      .map(id => store.items[id])
      .filter(Boolean)
      .filter(item => !site || item.site === site)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(sessionMeta);
  }

  async function loadSession(id) {
    const store = await readSessionStore();
    return store.items[id] || null;
  }

  function trimStore(store) {
    while (store.order.length > MAX_SESSIONS) {
      const dropped = store.order.pop();
      delete store.items[dropped];
    }
    return store;
  }

  async function saveSession(session) {
    if (!session || !session.id) return { ok: false, error: '缺少会话标识' };
    const store = await readSessionStore();
    const id = String(session.id);
    const prev = store.items[id] || {};
    const messages = (Array.isArray(session.messages) ? session.messages : [])
      .filter(message => message && message.role)
      .slice(-MAX_MESSAGES)
      .map(sanitizeMessage);
    const next = {
      id,
      site: clip(session.site || prev.site || '', 120),
      url: clip(session.url || prev.url || '', 600),
      title: clip(session.title || prev.title || '', 200),
      createdAt: Number(prev.createdAt) || Number(session.createdAt) || Date.now(),
      updatedAt: Date.now(),
      messages
    };
    store.items[id] = next;
    store.order = [id, ...store.order.filter(item => item !== id)];
    trimStore(store);
    let size = JSON.stringify(store).length;
    while (size > MAX_STORE_BYTES && store.order.length > 1) {
      const dropped = store.order.pop();
      delete store.items[dropped];
      size = JSON.stringify(store).length;
    }
    if (!messages.length) {
      delete store.items[id];
      store.order = store.order.filter(item => item !== id);
      await chrome.storage.local.set({ [SESSIONS_KEY]: store });
      return { ok: true, removed: true, id };
    }
    try {
      await chrome.storage.local.set({ [SESSIONS_KEY]: store });
    } catch (error) {
      return { ok: false, error: '本地保存失败：' + error.message };
    }
    return { ok: true, id, meta: sessionMeta(next), session: next };
  }

  async function deleteSession(id) {
    const store = await readSessionStore();
    const key = String(id || '');
    delete store.items[key];
    store.order = store.order.filter(item => item !== key);
    await chrome.storage.local.set({ [SESSIONS_KEY]: store });
    return { ok: true, id: key };
  }

  async function clearSiteSessions(site) {
    const store = await readSessionStore();
    const kept = store.order.filter(id => (store.items[id] || {}).site !== site);
    for (const id of store.order) if (!kept.includes(id)) delete store.items[id];
    store.order = kept;
    await chrome.storage.local.set({ [SESSIONS_KEY]: store });
    return { ok: true, site, keep: kept.length };
  }

  const running = new Map();

  async function runConversation({ tabId, messages, sessionId, signal, emit }) {
    const config = await readConfig();
    if (config.backend === 'dsh' && self.MAPUS_DSH) {
      return await self.MAPUS_DSH.run({ tabId, messages, sessionId, emit, signal });
    }
    if (config.backend === 'dsh' && !self.MAPUS_DSH) {
      throw new Error('Harness 后端未加载，请重新加载扩展');
    }
    return await converse({ tabId, messages, signal, emit });
  }

  chrome.runtime.onConnect.addListener(port => {
    if (!port || port.name !== PORT_NAME) return;
    let aborter = null;

    const post = message => {
      try { port.postMessage(message); } catch (_) {  }
    };

    port.onMessage.addListener(async message => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ABORT') {
        if (aborter) aborter.abort();
        if (self.MAPUS_DSH && self.MAPUS_DSH.cancel) Promise.resolve(self.MAPUS_DSH.cancel()).catch(() => { });
        return;
      }
      if (message.type !== 'CHAT') return;
      if (!self.MAPUS_GATE.isEnabled()) {
        post({ type: 'error', requestId: message.requestId, message: 'MAPUS 已停用，请先在侧边栏重新启用。' });
        return;
      }
      const requestId = message.requestId || `req_${Date.now()}`;
      aborter = new AbortController();
      running.set(requestId, aborter);
      post({ type: 'start', requestId });
      try {
        const result = await runConversation({
          tabId: message.tabId,
          messages: message.messages,
          sessionId: message.sessionId,
          signal: aborter.signal,
          emit: event => post({ ...event, requestId })
        });
        post({ type: 'done', requestId, answer: result.answer, usage: result.usage, context: result.context, steps: result.steps, budget: result.budget, exhausted: result.exhausted, stuck: result.stuck });
      } catch (error) {
        if (error && error.name === 'AbortError') post({ type: 'aborted', requestId });
        else post({ type: 'error', requestId, message: error.message || String(error) });
      } finally {
        running.delete(requestId);
        aborter = null;
      }
    });

    port.onDisconnect.addListener(() => {
      if (aborter) aborter.abort();
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.to !== 'agent') return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    (async () => {
      try {
        switch (message.type) {
          case 'AGENT_CONFIG_GET': {
            sendResponse({ ok: true, config: publicConfig(await readConfig()) });
            return;
          }
          case 'AGENT_CONFIG_SET': {
            const next = await writeConfig(message.patch || {});
            sendResponse({ ok: true, config: publicConfig(next) });
            return;
          }
          case 'AGENT_TEST': {
            const active = await readConfig();
            const patch = message.patch || null;
            const backend = patch && patch.backend ? patch.backend : active.backend;
            if (backend === 'dsh' && self.MAPUS_DSH) {
              sendResponse(await self.MAPUS_DSH.testConnection(patch));
              return;
            }
            sendResponse(await testConnection(patch));
            return;
          }
          case 'AGENT_DSH_MODELS': {
            if (!self.MAPUS_DSH) {
              sendResponse({ ok: false, error: 'DSH 后端未加载' });
              return;
            }
            sendResponse(await self.MAPUS_DSH.listModels(message.patch || null));
            return;
          }
          case 'AGENT_CONFIG_SECRET': {
            const from = (sender && sender.url) || '';
            if (!/^chrome-extension:/i.test(from)) {
              sendResponse({ ok: false, error: '仅扩展内部页面可用' });
              return;
            }
            const current = await readConfig();
            sendResponse({ ok: true, apiKey: typeof current.apiKey === 'string' ? current.apiKey : '' });
            return;
          }
          case 'AGENT_CONTEXT': {
            sendResponse({ ok: true, context: await buildContext(message.tabId) });
            return;
          }
          case 'AGENT_TOOLS': {
            sendResponse({ ok: true, tools: toolList() });
            return;
          }
          case 'AGENT_CHAT': {
            try {
              const result = await converse({
                tabId: message.tabId,
                messages: message.messages,
                emit: () => {}
              });
              sendResponse({ ok: true, answer: result.answer, usage: result.usage, steps: result.steps, budget: result.budget, exhausted: result.exhausted, stuck: result.stuck });
            } catch (error) {
              sendResponse({ ok: false, error: error.message });
            }
            return;
          }
          case 'AGENT_SESSION_LIST': {
            sendResponse({ ok: true, sessions: await listSessions(message.site || '') });
            return;
          }
          case 'AGENT_SESSION_GET': {
            const session = await loadSession(String(message.id || ''));
            sendResponse(session ? { ok: true, session } : { ok: false, error: '会话不存在' });
            return;
          }
          case 'AGENT_SESSION_SAVE': {
            sendResponse(await saveSession(message.session));
            return;
          }
          case 'AGENT_SESSION_DELETE': {
            sendResponse(await deleteSession(message.id));
            return;
          }
          case 'AGENT_SESSION_CLEAR_SITE': {
            sendResponse(await clearSiteSessions(String(message.site || '')));
            return;
          }
          default:
            sendResponse({ ok: false, error: '未知指令' });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  });

  self.MAPUS_AGENT_MASTER = function (enabled) {
    if (enabled) return;
    for (const aborter of running.values()) {
      try { aborter.abort(); } catch (_) {  }
    }
    running.clear();
    if (self.MAPUS_BROWSER && self.MAPUS_BROWSER.releaseAll) {
      Promise.resolve(self.MAPUS_BROWSER.releaseAll()).catch(() => {  });
    }
  };

  self.MAPUS_AGENT = {
    readConfig,
    publicConfig,
    buildContext,
    runTool,
    toolList,
    converse,
    testConnection,
    listSessions,
    loadSession,
    saveSession,
    deleteSession
  };
})();
