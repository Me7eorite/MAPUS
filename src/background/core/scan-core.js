(function () {
  'use strict';
  if (self.MAPUS_SCAN_CORE) return;
  self.MAPUS_SCAN_CORE = true;

  const FINGERPRINT_CONFIG = self.FINGERPRINT_CONFIG;
  const tabCountsCache = new Map();
  const tabJsMap = {};
  let serverFingerprints = new Map();
  let analysisPending = false;

  chrome.webNavigation.onCommitted.addListener(details => {
    const { tabId, frameId } = details;
    if (frameId === 0 && tabJsMap[tabId]) tabJsMap[tabId].clear();
  });

  function setTabCount(tabId, count) {
    tabCountsCache.set(tabId, count);
    chrome.storage.session.set({ [`tab_${tabId}`]: count });
  }

  function getTabCount(tabId, callback) {
    if (tabCountsCache.has(tabId)) {
      callback(tabCountsCache.get(tabId));
      return;
    }
    chrome.storage.session.get(`tab_${tabId}`, data => {
      const count = data[`tab_${tabId}`] || 0;
      tabCountsCache.set(tabId, count);
      callback(count);
    });
  }

  function setBadgeUI(tabId, count) {
    const hasCount = count > 0;
    chrome.action.setBadgeText({ text: hasCount ? String(count) : '', tabId });
    chrome.action.setBadgeBackgroundColor({ color: hasCount ? '#2f6bff' : '#8a94a6', tabId });
  }

  function updateBadge(results, tabId) {
    const fields = [
      'domains', 'absoluteApis', 'apis', 'moduleFiles', 'docFiles', 'ips', 'phones',
      'emails', 'idcards', 'jwts', 'imageFiles', 'jsFiles', 'vueFiles', 'urls',
      'githubUrls', 'companies', 'credentials', 'cookies', 'idKeys'
    ];
    const count = fields.reduce((acc, field) => {
      const arr = results[field];
      return acc + (Array.isArray(arr) && arr.length > 0 ? 1 : 0);
    }, 0);
    setTabCount(tabId, count);
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.id === tabId) setBadgeUI(tabId, count);
    });
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    getTabCount(tabId, count => setBadgeUI(tabId, count));
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    tabCountsCache.delete(tabId);
    chrome.storage.session.remove(`tab_${tabId}`);
    chrome.storage.session.remove(`analysis_${tabId}`);
    if (tabJsMap[tabId]) tabJsMap[tabId].clear();
    Object.values(analyticsDetected).forEach(map => map.delete(tabId));
    serverFingerprints.delete(tabId);
  });

  function currentUserAgent() {
    try {
      const ua = typeof navigator !== 'undefined' && navigator.userAgent;
      return (ua || '').replace(/\s*ServiceWorker\/[\d.]+/i, '') || undefined;
    } catch (_) {
      return undefined;
    }
  }

  async function tryFetchContent(url) {
    const headers = { Accept: '*/*' };
    const ua = currentUserAgent();
    if (ua) headers['User-Agent'] = ua;
    const response = await fetch(url, { headers, credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.text();
  }

  async function fallbackFetchContentViaTab(tabId, url) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: self.MAPUS_PAGEFN.fetchText,
      args: [url]
    });
    return result ? result.result : null;
  }

  async function handleFetchRequest(request, sender, sendResponse) {
    try {
      sendResponse({ content: await tryFetchContent(request.url) });
      return;
    } catch (error) {
      console.warn('[MAPUS] 直接抓取失败:', error.message);
    }
    if (sender.tab && sender.tab.id) {
      try {
        sendResponse({ content: await fallbackFetchContentViaTab(sender.tab.id, request.url) });
      } catch (e2) {
        console.warn('[MAPUS] 标签页回退抓取失败:', e2.message);
        sendResponse({ content: null });
      }
    } else {
      sendResponse({ content: null });
    }
  }

  const analyticsDetected = { baidu: new Map(), yahoo: new Map(), google: new Map() };

  const analyticsPatterns = Object.entries(FINGERPRINT_CONFIG.ANALYTICS).map(([type, config]) => ({
    pattern: config.pattern,
    type
  }));

  function getFingerprints(tabId) {
    if (serverFingerprints.has(tabId)) return serverFingerprints.get(tabId);
    const fingerprints = {
      server: [], component: [], technology: [], security: [], analytics: [],
      builder: [], framework: [], os: [], panel: [], cdn: [], nameMap: new Map()
    };
    serverFingerprints.set(tabId, fingerprints);
    return fingerprints;
  }

  function flattenFingerprints(tabId) {
    const fingerprints = getFingerprints(tabId);
    const list = [];
    const seen = new Set();
    for (const [type, items] of Object.entries(fingerprints)) {
      if (type === 'nameMap' || !Array.isArray(items)) continue;
      for (const item of items) {
        const key = `${type}|${item.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          type,
          name: item.name || '',
          description: item.description || '',
          value: item.version || item.value || item.name || '',
          header: item.header || ''
        });
      }
    }
    const order = ['server', 'os', 'framework', 'technology', 'component', 'cdn', 'panel', 'security', 'analytics', 'builder'];
    list.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    return list;
  }

  function handleAnalyticsDetection(details, type) {
    if (analyticsDetected[type].get(details.tabId)) return;
    const fingerprints = getFingerprints(details.tabId);
    analyticsDetected[type].set(details.tabId, true);
    fingerprints.analytics.push({
      name: FINGERPRINT_CONFIG.ANALYTICS[type].name,
      description: FINGERPRINT_CONFIG.ANALYTICS[type].description,
      version: FINGERPRINT_CONFIG.ANALYTICS[type].version
    });
  }

  chrome.webRequest.onBeforeRequest.addListener(
    details => {
      const matchedAnalytics = analyticsPatterns.find(item =>
        details.url.match(new RegExp(item.pattern.replace(/[*]/g, '.*')))
      );
      if (matchedAnalytics && details.tabId >= 0) handleAnalyticsDetection(details, matchedAnalytics.type);

      const { tabId, url, type } = details;
      if (type !== 'script' || tabId < 0) return;
      try {
        const initiator = new URL(details.initiator);
        const target = new URL(url);
        if (initiator.hostname !== target.hostname) return;
      } catch (_) {
        return;
      }
      if (!tabJsMap[tabId]) tabJsMap[tabId] = new Set();
      tabJsMap[tabId].add(url);
    },
    { urls: ['<all_urls>'] },
    []
  );

  function describe(typeId) {
    const item = (FINGERPRINT_CONFIG.DESCRIPTIONS || []).find(entry => entry.name === typeId);
    return item ? item.description : '';
  }

  function identifyTechnologyFromCookie(cookieHeader) {
    for (const cookie of FINGERPRINT_CONFIG.COOKIES) {
      if (cookie.match.test(cookieHeader)) {
        return {
          type: cookie.type,
          name: cookie.name,
          description: `通过 Cookie 识别到服务端${describe(cookie.type) || ''}：${cookie.name}`
        };
      }
    }
    return null;
  }

  function processHeaders(headers, tabId) {
    const fingerprints = getFingerprints(tabId);
    const headerMap = new Map(headers.map(h => [h.name.toLowerCase(), h.value]));
    for (const config of FINGERPRINT_CONFIG.HEADERS) {
      const headerValue = headerMap.get(config.header);
      if (!headerValue) continue;
      const result = headerValue.match(config.pattern);
      if (!result || fingerprints.nameMap.has(config.name)) continue;

      const fingerprint = { ...config };
      fingerprint.description = `通过 ${config.header} 响应头识别到 ${config.name}${describe(config.type) ? '（' + describe(config.type) + '）' : ''}`;
      if (config.extType && !(serverFingerprints.get(tabId) || {}).nameMap?.has(config.extName)) {
        const extFingerprint = {
          type: config.extType,
          name: config.extName,
          header: config.header,
          description: `通过 ${config.header} 响应头识别到 ${config.extName}${describe(config.extType) ? '（' + describe(config.extType) + '）' : ''}`
        };
        fingerprints[extFingerprint.type].push(extFingerprint);
        fingerprints.nameMap.set(config.extName, true);
      }
      let index = 1;
      if (config.value) {
        if (result.length > 1) {
          for (const value of config.value.split(',')) {
            fingerprint[value] = result[index] ? result[index] : null;
            fingerprint.description += `，${describe(value) || value}：${fingerprint[value] || '未知'}`;
            index++;
          }
        } else {
          fingerprint[config.value] = result[0] || null;
          fingerprint.description += `，${describe(config.value) || config.value}：${fingerprint[config.value] || '未知'}`;
        }
      }
      fingerprints[config.type].push(fingerprint);
      fingerprints.nameMap.set(config.name, true);
    }
    return fingerprints;
  }

  chrome.webRequest.onHeadersReceived.addListener(
    details => {
      if (details.type !== 'main_frame' || !details.responseHeaders) {
        return { responseHeaders: details.responseHeaders };
      }
      setTimeout(() => {
        try {
          const fingerprints = processHeaders(details.responseHeaders, details.tabId);
          serverFingerprints.set(details.tabId, fingerprints);
          chrome.cookies.getAll({ url: details.url }, cookies => {
            if (!cookies || !cookies.length) return;
            const cookieNames = cookies.map(cookie => cookie.name).join(';');
            const tech = identifyTechnologyFromCookie(cookieNames);
            if (tech && !fingerprints.nameMap.has(tech.name)) {
              fingerprints[tech.type].push(tech);
              fingerprints.nameMap.set(tech.name, true);
            }
          });
        } catch (error) {
          console.warn('[MAPUS] 特征解析失败:', error.message);
        }
      }, 0);
      return { responseHeaders: details.responseHeaders };
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );

  function performRegexMatching(chunk, patterns, patternType) {
    const matches = [];
    let maxIterations = 10000;
    try {
      for (const patternInfo of patterns) {
        const patternString = patternInfo.pattern;
        let regex = null;
        try {
          const parsed = patternString.match(/^\/(.+)\/([gimuy]*)$/);
          if (parsed) regex = new RegExp(parsed[1], parsed[2]);
        } catch (e) {
          console.error(`[MAPUS] 无效正则: ${patternString}`, e);
          continue;
        }
        if (!regex) continue;
        let patternLastIndex = 0;
        let match;
        while ((match = regex.exec(chunk)) !== null) {
          if (regex.lastIndex <= patternLastIndex) {
            console.warn(`[MAPUS] 正则可能死循环: ${patternType}`);
            break;
          }
          patternLastIndex = regex.lastIndex;
          if (--maxIterations <= 0) {
            console.warn(`[MAPUS] 达到最大迭代次数: ${patternType}`);
            break;
          }
          matches.push({ match: match[0] });
          if (!regex.global) break;
        }
        regex.lastIndex = 0;
      }
    } catch (e) {
      console.error(`[MAPUS] ${patternType} 匹配出错:`, e);
    }
    return matches;
  }

  function getRootDomain(domain) {
    const specialTlds = ['com.cn', 'edu.cn', 'gov.cn', 'org.cn', 'net.cn', 'co.jp', 'co.uk', 'co.kr', 'com.hk'];
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    for (const tld of specialTlds) {
      if (domain.endsWith(`.${tld}`)) return parts.slice(-(tld.split('.').length + 1)).join('.');
    }
    return parts.slice(-2).join('.');
  }

  function isPrivateIP(domain) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return false;
    const parts = domain.split('.');
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) || domain === '127.0.0.1';
  }

  function emptyCache() {
    return { weight: null, ip: null, icp: null, isComplete: false, services: { skipped: {}, errors: {} } };
  }

  async function servicesSignature() {
    const services = await serviceRules();
    if (!services) return '';
    return ['weight', 'ip', 'icp']
      .map(key => {
        const conf = services[key] || {};
        return `${key}:${conf.enabled ? 1 : 0}:${conf.url || ''}:${conf.id || ''}:${conf.key ? 1 : 0}`;
      })
      .join('|');
  }

  function getAnalysisFromStorage(tabId, signature) {
    return new Promise(resolve => {
      const key = `analysis_${tabId}`;
      chrome.storage.session.get(key, res => {
        const cache = res[key];
        if (!cache || (cache.meta && cache.meta.signature !== signature)) return resolve(emptyCache());
        const meta = cache.meta || {};
        const done = item => !!(item && (item.data || item.skipped));
        resolve({
          weight: cache.weight && cache.weight.data ? cache.weight.data : null,
          ip: cache.ip && cache.ip.data ? cache.ip.data : null,
          icp: cache.icp && cache.icp.data ? cache.icp.data : null,
          isComplete: done(cache.weight) && done(cache.ip) && done(cache.icp),
          services: { skipped: meta.skipped || {}, errors: meta.errors || {} }
        });
      });
    });
  }

  function saveAnalysisToStorage(tabId, results, signature) {
    const skipped = {};
    const errors = {};
    for (const [key, result] of Object.entries(results || {})) {
      if (!result) continue;
      if (result.skipped) skipped[key] = result.skipped;
      if (result.error) errors[key] = result.error;
    }
    const pack = result => (result
      ? { data: result.data || null, skipped: result.skipped || null, error: result.error || null }
      : null);
    chrome.storage.session.set({
      [`analysis_${tabId}`]: {
        weight: pack(results && results.weight),
        ip: pack(results && results.ip),
        icp: pack(results && results.icp),
        meta: { skipped, errors, signature, ts: Date.now() }
      }
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { data: await response.json() };
  }

  function renderTemplate(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (whole, key) => (
      vars[key] === undefined || vars[key] === null ? '' : encodeURIComponent(String(vars[key]))
    ));
  }

  async function serviceRules() {
    if (!self.MAPUS_RULES) return null;
    try {
      const rules = await self.MAPUS_RULES.get();
      return rules && rules.services ? rules.services : null;
    } catch (_) {
      return null;
    }
  }

  async function queryService(kind, vars) {
    const services = await serviceRules();
    const conf = services && services[kind];
    if (!conf) return { skipped: 'not-configured' };
    if (!conf.enabled) return { skipped: 'disabled' };
    if (!conf.url) return { skipped: 'no-url' };
    if (!conf.key) return { skipped: 'no-key' };
    const url = renderTemplate(conf.url, Object.assign({ id: conf.id || '' }, vars, { key: conf.key }));
    try {
      return await fetchJson(url);
    } catch (e) {
      console.error(`[MAPUS] ${conf.label || kind} 查询失败:`, e && e.message);
      return { error: e.message || '请求失败' };
    }
  }

  async function fetchDomainWeight(domain) {
    return queryService('weight', { domain });
  }

  async function fetchIpInfo(domain) {
    return queryService('ip', { domain });
  }

  async function fetchIcpInfo(domain) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
      return { data: { icp: 'IP 地址不适用', unit: 'IP 地址不适用', time: 'IP 地址不适用' } };
    }
    const result = await queryService('icp', { domain });
    if (result && result.data && result.data.code === 404) {
      return { data: { icp: '未查询到备案信息', unit: '未知', time: '未知' } };
    }
    return result;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.to !== 'background') return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    try {
      switch (request.type) {
        case 'UPDATE_BUILDER': {
          const tabId = sender.tab && sender.tab.id;
          if (tabId === undefined) return true;
          const fingerprints = getFingerprints(tabId);
          if (!fingerprints.nameMap.has(request.finger.name)) {
            const finger = request.finger;
            if (finger.extType && !fingerprints.nameMap.has(finger.extName)) {
              fingerprints[finger.extType].push({
                type: finger.extType,
                name: finger.extName,
                header: finger.name,
                description: `通过 ${finger.name} 识别到 ${finger.extName}`
              });
              fingerprints.nameMap.set(finger.extName, true);
            }
            fingerprints.nameMap.set(finger.name, true);
            fingerprints[finger.type].push(finger);
            serverFingerprints.set(tabId, fingerprints);
          }
          return true;
        }
        case 'GET_FINGERPRINTS': {
          sendResponse(getFingerprints(request.tabId));
          return true;
        }
        case 'GET_FINGERPRINTS_V2': {
          sendResponse(flattenFingerprints(request.tabId));
          return true;
        }
        case 'CLEAR_FINGERPRINTS': {
          serverFingerprints.delete(request.tabId);
          Object.values(analyticsDetected).forEach(map => map.delete(request.tabId));
          sendResponse({ ok: true });
          return true;
        }
        case 'FETCH_JS': {
          handleFetchRequest(request, sender, sendResponse);
          return true;
        }
        case 'REGISTER_CONTENT': {
          const tabId = sender.tab && sender.tab.id;
          sendResponse({ tabJs: Array.from(tabJsMap[tabId] || []), tabId });
          return true;
        }
        case 'UPDATE_BADGE': {
          updateBadge(request.results, request.tabId);
          return true;
        }
        case 'GET_TAB_ID': {
          sendResponse({ tabId: sender.tab ? sender.tab.id : null });
          return true;
        }
        case 'REGEX_MATCH': {
          sendResponse({ matches: performRegexMatching(request.chunk, request.patterns, request.patternType) });
          return true;
        }
        case 'GET_SITE_ANALYSIS': {
          const domain = getRootDomain(request.domain);
          const fullDomain = request.domain;
          const tabId = request.tabId;

          if (isPrivateIP(domain)) {
            sendResponse({ weight: null, ip: null, icp: null, isComplete: true, isPrivateIP: true });
            return true;
          }
          if (analysisPending) return true;
          analysisPending = true;

          servicesSignature().then(signature => getAnalysisFromStorage(tabId, signature)).then(cached => {
            if (cached.isComplete) {
              analysisPending = false;
              sendResponse(cached);
              return;
            }
            Promise.all([
              cached.weight ? Promise.resolve({ data: cached.weight }) : fetchDomainWeight(domain),
              cached.ip ? Promise.resolve({ data: cached.ip }) : fetchIpInfo(fullDomain),
              cached.icp ? Promise.resolve({ data: cached.icp }) : fetchIcpInfo(domain)
            ]).then(([weightData, ipData, icpData]) => {
              analysisPending = false;
              servicesSignature().then(signature => saveAnalysisToStorage(tabId, {
                weight: weightData, ip: ipData, icp: icpData
              }, signature));
              sendResponse({
                weight: (weightData && weightData.data) || null,
                ip: (ipData && ipData.data) || null,
                icp: (icpData && icpData.data) || null,
                isComplete: true,
                isPrivateIP: false,
                services: {
                  skipped: {
                    weight: weightData && weightData.skipped,
                    ip: ipData && ipData.skipped,
                    icp: icpData && icpData.skipped
                  },
                  errors: {
                    weight: weightData && weightData.error,
                    ip: ipData && ipData.error,
                    icp: icpData && icpData.error
                  }
                }
              });
            }).catch(error => {
              analysisPending = false;
              console.error('[MAPUS] 站点画像获取失败:', error);
              sendResponse(null);
            });
          });
          return true;
        }
      }
    } catch (error) {
      console.error('[MAPUS] 消息处理出错:', error);
      try { sendResponse(null); } catch (_) {  }
      return true;
    }
    return false;
  });

  self.MAPUS = Object.assign(self.MAPUS || {}, {
    flattenFingerprints,
    getFingerprints
  });
})();
