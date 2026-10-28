(function () {
  'use strict';
  if (self.MAPUS_RULES) return;

  const STORAGE_KEY = 'mapus_rules';
  const LEGACY_KEY = 'nxe_rules';
  const DEFAULTS = self.MAPUS_RULES_DEFAULT || {};

  let cache = null;
  let loading = null;

  const isPlain = value => value && typeof value === 'object' && !Array.isArray(value);

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isPlain(value)) {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = clone(item);
      return out;
    }
    return value;
  }

  function merge(base, patch) {
    if (Array.isArray(patch)) return clone(patch);
    if (!isPlain(patch)) return patch === undefined ? clone(base) : patch;
    const out = isPlain(base) ? clone(base) : {};
    for (const [key, value] of Object.entries(patch)) {
      out[key] = merge(base ? base[key] : undefined, value);
    }
    return out;
  }

  const str = value => (typeof value === 'string' ? value : '');
  const trim = value => str(value).trim();

  function cleanList(list, { max = 2000, maxLength = 300, lower = false } = {}) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      let value = trim(item);
      if (lower) value = value.toLowerCase();
      if (!value || value.length > maxLength) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length >= max) break;
    }
    return out;
  }

  function intIn(value, fallback, min, max) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  function compile(pattern, flags) {
    if (!pattern) return null;
    try {
      return new RegExp(pattern, flags || '');
    } catch (_) {
      return null;
    }
  }

  function validate(input) {
    const errors = [];
    const rules = merge(DEFAULTS, isPlain(input) ? input : {});

    const probe = isPlain(rules.probe) ? rules.probe : (rules.probe = clone(DEFAULTS.probe));
    probe.concurrency = intIn(probe.concurrency, 5, 1, 20);
    probe.timeoutMs = intIn(probe.timeoutMs, 6000, 1000, 60000);
    probe.followRedirect = probe.followRedirect !== false;
    if (!['omit', 'same-origin', 'include'].includes(probe.credentials)) probe.credentials = 'omit';
    probe.acceptStatus = Array.isArray(probe.acceptStatus)
      ? [...new Set(probe.acceptStatus.map(Number).filter(n => Number.isInteger(n) && n >= 100 && n <= 599))].sort((a, b) => a - b)
      : clone(DEFAULTS.probe.acceptStatus);
    if (!probe.acceptStatus.length) probe.acceptStatus = clone(DEFAULTS.probe.acceptStatus);
    probe.wordlist = cleanList(probe.wordlist, { max: 4000, maxLength: 200 });
    if (probe.wordlist.length > 4000) errors.push('目录字典超过 4000 条，已截断');

    const honeypot = isPlain(rules.honeypot) ? rules.honeypot : (rules.honeypot = clone(DEFAULTS.honeypot));
    const features = Array.isArray(honeypot.features) ? honeypot.features : [];
    honeypot.features = features.slice(0, 500).map((item, index) => {
      if (!isPlain(item)) {
        errors.push(`追踪特征第 ${index + 1} 项格式不正确，已丢弃`);
        return null;
      }
      const signs = cleanList(item.signs, { max: 50, maxLength: 120, lower: true });
      if (!signs.length) {
        errors.push(`追踪特征「${trim(item.name) || index + 1}」没有有效特征词，已丢弃`);
        return null;
      }
      return {
        name: trim(item.name) || `特征 ${index + 1}`,
        signs,
        detail: trim(item.detail) || '命中自定义追踪特征',
        level: ['danger', 'warn', 'info', 'ok'].includes(item.level) ? item.level : 'danger'
      };
    }).filter(Boolean);

    honeypot.suspectScriptKeys = cleanList(honeypot.suspectScriptKeys, { max: 200, maxLength: 80, lower: true });
    honeypot.obfuscation = (Array.isArray(honeypot.obfuscation) ? honeypot.obfuscation : []).slice(0, 100).map((item, index) => {
      if (!isPlain(item) || !compile(item.pattern, item.flags)) {
        errors.push(`混淆规则第 ${index + 1} 项正则无效，已丢弃`);
        return null;
      }
      return {
        name: trim(item.name) || 'JS 混淆',
        pattern: String(item.pattern),
        flags: str(item.flags),
        detail: trim(item.detail) || '命中自定义混淆特征',
        level: ['danger', 'warn', 'info', 'ok'].includes(item.level) ? item.level : 'warn'
      };
    }).filter(Boolean);
    honeypot.watchClipboard = honeypot.watchClipboard !== false;
    honeypot.watchEval = honeypot.watchEval !== false;
    honeypot.watchFetch = honeypot.watchFetch !== false;

    const trackers = isPlain(rules.trackers) ? rules.trackers : (rules.trackers = clone(DEFAULTS.trackers));
    const rulesList = Array.isArray(trackers.rules) ? trackers.rules : [];
    const seenHost = new Set();
    trackers.rules = [];
    for (const item of rulesList) {
      const host = trim(isPlain(item) ? item.host : item).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!host || host.length > 120 || seenHost.has(host)) continue;
      seenHost.add(host);
      trackers.rules.push({ host, type: trim(isPlain(item) ? item.type : '') || 'custom' });
      if (trackers.rules.length >= 400) break;
    }

    const ua = isPlain(rules.ua) ? rules.ua : (rules.ua = clone(DEFAULTS.ua));
    ua.pool = cleanList(ua.pool, { max: 60, maxLength: 400 });
    ua.resourceTypes = cleanList(ua.resourceTypes, { max: 30, maxLength: 40 }).length
      ? cleanList(ua.resourceTypes, { max: 30, maxLength: 40 })
      : clone(DEFAULTS.ua.resourceTypes);
    if (!ua.pool.length) errors.push('UA 池为空，UA 伪装将自动跳过');

    const endpoint = isPlain(rules.endpoint) ? rules.endpoint : (rules.endpoint = clone(DEFAULTS.endpoint));
    for (const key of ['skipExtension', 'apiHint', 'assetHint', 'getHint', 'postHint']) {
      if (!compile(endpoint[key])) {
        errors.push(`端点规则 ${key} 正则无效，已回退默认`);
        endpoint[key] = DEFAULTS.endpoint[key];
      }
    }
    endpoint.maxPathLength = intIn(endpoint.maxPathLength, 300, 40, 2000);
    endpoint.maxResults = intIn(endpoint.maxResults, 400, 20, 5000);

    const xss = isPlain(rules.xss) ? rules.xss : (rules.xss = clone(DEFAULTS.xss));
    const sanitizePatterns = (list, label) => (Array.isArray(list) ? list : []).slice(0, 200).map((item, index) => {
      if (!isPlain(item) || !compile(item.pattern, item.flags)) {
        errors.push(`${label}第 ${index + 1} 项正则无效，已丢弃`);
        return null;
      }
      return { name: trim(item.name) || `${label} ${index + 1}`, pattern: String(item.pattern), flags: str(item.flags) };
    }).filter(Boolean);
    xss.sources = sanitizePatterns(xss.sources, 'source ');
    xss.sinks = sanitizePatterns(xss.sinks, 'sink ');
    if (!xss.sinks.length) {
      errors.push('DOM XSS sink 规则全部无效，已回退默认');
      xss.sinks = clone(DEFAULTS.xss.sinks).map(item => ({ name: item.name, pattern: item.pattern, flags: item.flags || '' }));
    }
    xss.maxInlineScripts = intIn(xss.maxInlineScripts, 200, 10, 2000);
    xss.maxEventAttrs = intIn(xss.maxEventAttrs, 12, 0, 200);

    const pollution = isPlain(rules.pollution) ? rules.pollution : (rules.pollution = clone(DEFAULTS.pollution));
    pollution.canaryPaths = cleanList(pollution.canaryPaths, { max: 100, maxLength: 120 });
    pollution.maxEnumerableKeys = intIn(pollution.maxEnumerableKeys, 8, 1, 50);
    for (const key of ['mergePattern', 'inputPattern']) {
      if (!compile(pollution[key])) {
        errors.push(`原型污染规则 ${key} 正则无效，已回退默认`);
        pollution[key] = DEFAULTS.pollution[key];
      }
    }
    pollution.libraries = (Array.isArray(pollution.libraries) ? pollution.libraries : []).slice(0, 100).map((item, index) => {
      if (!isPlain(item) || !compile(item.pattern, 'i')) {
        errors.push(`库特征第 ${index + 1} 项正则无效，已丢弃`);
        return null;
      }
      return { name: trim(item.name) || `库 ${index + 1}`, pattern: String(item.pattern) };
    }).filter(Boolean);

    const scan = isPlain(rules.scan) ? rules.scan : (rules.scan = clone(DEFAULTS.scan));
    scan.maxHitsPerRule = intIn(scan.maxHitsPerRule, 40, 1, 500);
    scan.customPatterns = (Array.isArray(scan.customPatterns) ? scan.customPatterns : []).slice(0, 200).map((item, index) => {
      if (!isPlain(item) || !compile(item.pattern, item.flags || 'g')) {
        errors.push(`自定义扫描规则第 ${index + 1} 项正则无效，已丢弃`);
        return null;
      }
      return {
        name: trim(item.name) || `自定义规则 ${index + 1}`,
        pattern: String(item.pattern),
        flags: str(item.flags) || 'g',
        note: trim(item.note)
      };
    }).filter(Boolean);

    const services = isPlain(rules.services) ? rules.services : (rules.services = clone(DEFAULTS.services));
    for (const key of ['weight', 'ip', 'icp']) {
      const item = isPlain(services[key]) ? services[key] : (services[key] = clone(DEFAULTS.services[key]));
      item.enabled = item.enabled === true;
      item.url = trim(item.url);
      item.key = trim(item.key);
      if (key === 'icp') item.id = trim(item.id);
      if (item.enabled && !item.url) {
        errors.push(`${item.label || key} 已启用但缺少接口地址，将跳过`);
        item.enabled = false;
      }
      if (item.enabled && !item.key) {
        errors.push(`${item.label || key} 已启用但缺少密钥，将跳过`);
        item.enabled = false;
      }
    }
    services.seoImage = trim(services.seoImage) || DEFAULTS.services.seoImage;
    services.seoEngines = (Array.isArray(services.seoEngines) ? services.seoEngines : []).slice(0, 30).map(item => {
      if (!isPlain(item)) return null;
      const id = trim(item.id).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) return null;
      return { id, name: trim(item.name) || id };
    }).filter(Boolean);

    const agent = isPlain(rules.agent) ? rules.agent : (rules.agent = clone(DEFAULTS.agent));
    agent.maxToolRounds = intIn(agent.maxToolRounds, 40, 1, 200);
    agent.systemPrompt = str(agent.systemPrompt).slice(0, 24000) || DEFAULTS.agent.systemPrompt;
    const providers = Array.isArray(agent.providers) ? agent.providers : [];
    const seenProvider = new Set();
    agent.providers = [];
    for (const item of providers) {
      if (!isPlain(item)) continue;
      const id = trim(item.id).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id || seenProvider.has(id)) continue;
      seenProvider.add(id);
      agent.providers.push({
        id,
        label: trim(item.label) || id,
        baseUrl: trim(item.baseUrl),
        model: trim(item.model)
      });
      if (agent.providers.length >= 40) break;
    }
    if (!agent.providers.length) {
      agent.providers = clone(DEFAULTS.agent.providers);
      errors.push('模型预设为空，已回退默认');
    }

    rules.version = DEFAULTS.version;
    return { ok: errors.length === 0, errors, rules };
  }

  async function load() {
    const data = await chrome.storage.local.get([STORAGE_KEY, LEGACY_KEY]);
    const migrated = data && data[STORAGE_KEY] === undefined && data[LEGACY_KEY] !== undefined;
    const raw = data && data[STORAGE_KEY] !== undefined ? data[STORAGE_KEY] : data && data[LEGACY_KEY];
    const result = validate(raw);
    cache = result.rules;
    if (migrated) {
      await chrome.storage.local.set({ [STORAGE_KEY]: diffFromDefaults(result.rules) });
      await chrome.storage.local.remove(LEGACY_KEY);
    } else if (raw && result.errors.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: diffFromDefaults(result.rules) });
    }
    return cache;
  }

  let normalizedDefaults = null;
  function defaultShape() {
    if (!normalizedDefaults) normalizedDefaults = validate({}).rules;
    return normalizedDefaults;
  }

  function diffFromDefaults(rules) {
    const out = {};
    const base = defaultShape();
    const walk = (def, cur, target) => {
      for (const [key, value] of Object.entries(cur)) {
        if (Array.isArray(value)) {
          if (JSON.stringify(value) !== JSON.stringify(def && def[key])) target[key] = value;
        } else if (isPlain(value)) {
          const sub = {};
          walk(def && def[key], value, sub);
          if (Object.keys(sub).length) target[key] = sub;
        } else if (def ? value !== def[key] : true) {
          target[key] = value;
        }
      }
    };
    walk(base, rules, out);
    return out;
  }

  async function get() {
    if (cache) return cache;
    if (!loading) loading = load().finally(() => { loading = null; });
    return loading;
  }

  function getSync() {
    return cache;
  }

  async function set(patch) {
    if (!isPlain(patch)) throw new Error('规则格式错误');
    const current = await get();
    const merged = merge(current, patch);
    const result = validate(merged);
    await chrome.storage.local.set({ [STORAGE_KEY]: diffFromDefaults(result.rules) });
    cache = result.rules;
    return { rules: result.rules, warnings: result.errors };
  }

  async function reset(section) {
    if (!section) {
      await chrome.storage.local.remove(STORAGE_KEY);
      cache = validate({}).rules;
      return { rules: cache, warnings: [] };
    }
    if (!(section in DEFAULTS)) throw new Error('未知的规则分组：' + section);
    const current = await get();
    const merged = merge(current, { [section]: clone(DEFAULTS[section]) });
    const result = validate(merged);
    await chrome.storage.local.set({ [STORAGE_KEY]: diffFromDefaults(result.rules) });
    cache = result.rules;
    return { rules: result.rules, warnings: result.errors };
  }

  async function exportAll() {
    return await get();
  }

  async function importAll(input) {
    let value = input;
    if (typeof input === 'string') {
      try { value = JSON.parse(input); } catch (_) { throw new Error('不是合法的 JSON'); }
    }
    if (!isPlain(value)) throw new Error('规则必须是 JSON 对象');
    const result = validate(value);
    await chrome.storage.local.set({ [STORAGE_KEY]: diffFromDefaults(result.rules) });
    cache = result.rules;
    return { rules: result.rules, warnings: result.errors };
  }

  async function runtime() {
    const rules = await get();
    return {
      probe: rules.probe,
      honeypot: rules.honeypot,
      endpoint: rules.endpoint,
      xss: rules.xss,
      pollution: rules.pollution,
      scan: rules.scan
    };
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      cache = validate(changes[STORAGE_KEY].newValue || {}).rules;
    });
  }

  self.MAPUS_RULES = {
    STORAGE_KEY,
    DEFAULTS,
    validate,
    diffFromDefaults,
    get,
    getSync,
    set,
    reset,
    exportAll,
    importAll,
    runtime,
    ready: get()
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('MAPUS_RULES_')) return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }

    const extensionOrigin = chrome.runtime.getURL('');
    const fromExtension = !!sender && sender.id === chrome.runtime.id &&
      typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin);
    const reply = promise => {
      promise.then(
        data => sendResponse(Object.assign({ ok: true }, data)),
        error => sendResponse({ ok: false, error: error.message || String(error) })
      );
      return true;
    };

    switch (message.type) {
      case 'MAPUS_RULES_GET':
        return reply(get().then(rules => ({ rules })));

      case 'MAPUS_RULES_RUNTIME':
        return reply(runtime().then(rules => ({ rules })));

      case 'MAPUS_RULES_SET':
        if (!fromExtension) { sendResponse({ ok: false, error: 'FORBIDDEN' }); return false; }
        return reply(set(message.patch));

      case 'MAPUS_RULES_RESET':
        if (!fromExtension) { sendResponse({ ok: false, error: 'FORBIDDEN' }); return false; }
        return reply(reset(message.section));

      case 'MAPUS_RULES_EXPORT':
        if (!fromExtension) { sendResponse({ ok: false, error: 'FORBIDDEN' }); return false; }
        return reply(exportAll().then(rules => ({ rules })));

      case 'MAPUS_RULES_IMPORT':
        if (!fromExtension) { sendResponse({ ok: false, error: 'FORBIDDEN' }); return false; }
        return reply(importAll(message.value));

      case 'MAPUS_RULES_VALIDATE': {
        if (!fromExtension) { sendResponse({ ok: false, error: 'FORBIDDEN' }); return false; }
        const result = validate(message.value);
        sendResponse({ ok: true, warnings: result.errors });
        return false;
      }

      default:
        return false;
    }
  });
})();
