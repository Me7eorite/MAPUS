(function () {
  'use strict';
  if (self.MAPUS_ANTI_CORE) return;
  self.MAPUS_ANTI_CORE = true;

  const SITE_BLOCK_STATS = {};
  const SITE_RECENT_BLOCKS = {};
  const SITE_FINDINGS = {};
  const SITE_UA_STATE = {};
  const TAB_LAST_MAIN_DOMAIN = {};
  const MAIN_DOMAIN_ORIGINS = {};
  const TAB_COUNTER = {};
  const UA_RULE_ID_BASE = 10000;
  const UA_RULE_ID_LIMIT = 3000;
  const RECENT_LIMIT = 40;
  const FINDING_LIMIT = 60;

  const DEFAULT_SETTINGS = {
    isEnabled: true,
    fingerprintEnabled: true,
    webrtcEnabled: true,
    autoCleanPrevDomain: false,
    notifyOnBlock: false,
    uaRotationEnabled: true
  };

  let RULES = self.MAPUS_RULES ? self.MAPUS_RULES.getSync() : null;

  async function ensureRules() {
    if (!RULES && self.MAPUS_RULES) {
      try { RULES = await self.MAPUS_RULES.get(); } catch (_) { RULES = null; }
    }
    return RULES;
  }

  function rulesNow() {
    if (!RULES && self.MAPUS_RULES) RULES = self.MAPUS_RULES.getSync();
    return RULES;
  }

  const trackerList = () => {
    const rules = rulesNow();
    return rules && rules.trackers && Array.isArray(rules.trackers.rules) ? rules.trackers.rules : [];
  };

  const uaPool = () => {
    const rules = rulesNow();
    return rules && rules.ua && Array.isArray(rules.ua.pool) ? rules.ua.pool : [];
  };

  const uaResourceTypes = () => {
    const rules = rulesNow();
    const list = rules && rules.ua && rules.ua.resourceTypes;
    return Array.isArray(list) && list.length ? list : ['main_frame', 'xmlhttprequest'];
  };

  function getHostname(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
  }

  function isWebUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  function isIPv4(hostname) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  }

  function getMainDomain(hostname) {
    if (!hostname) return '';
    if (hostname === 'localhost' || isIPv4(hostname)) return hostname;
    const parts = hostname.split('.').filter(Boolean);
    return parts.length <= 2 ? hostname : parts.slice(-2).join('.');
  }

  function rememberMainDomainOrigin(url) {
    if (!isWebUrl(url)) return '';
    try {
      const parsed = new URL(url);
      const mainDomain = getMainDomain(parsed.hostname.toLowerCase());
      if (!mainDomain) return '';
      if (!MAIN_DOMAIN_ORIGINS[mainDomain]) MAIN_DOMAIN_ORIGINS[mainDomain] = {};
      MAIN_DOMAIN_ORIGINS[mainDomain][parsed.origin] = true;
      return mainDomain;
    } catch (_) { return ''; }
  }

  async function readConfig() {
    const data = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const config = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      config[key] = data[key] === undefined ? value : data[key];
    }
    return config;
  }

  let rulesQueue = Promise.resolve();
  const BLOCK_RESOURCE_TYPES = ['script', 'xmlhttprequest', 'sub_frame', 'image', 'ping', 'media', 'font', 'websocket', 'other'];

  function initializeRules(isEnabled) {
    rulesQueue = rulesQueue.then(() => rebuildRules(isEnabled)).catch(err => {
      console.error('[NextAnti] 拦截规则初始化失败:', err && err.message);
    });
    return rulesQueue;
  }

  async function rebuildRules(isEnabled) {
    await ensureRules();
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(rule => rule.id);

    if (!isEnabled) {
      if (removeRuleIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
      return;
    }

    const seen = new Set();
    const addRules = [];
    for (const entry of trackerList()) {
      const host = String((entry && entry.host) || '').trim();
      if (!host || seen.has(host)) continue;
      seen.add(host);
      addRules.push({
        id: addRules.length + 1,
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: host, resourceTypes: BLOCK_RESOURCE_TYPES }
      });
    }

    if (!addRules.length) {
      if (removeRuleIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
      console.warn('[NextAnti] 追踪器规则为空，跳过拦截规则注册');
      return;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  }

  async function clearOriginsData(origins, mainDomain) {
    try {
      if (origins && origins.length) {
        await chrome.browsingData.remove({ origins }, {
          cache: true, cookies: true, localStorage: true, indexedDB: true,
          serviceWorkers: true, cacheStorage: true, fileSystems: true, webSQL: true
        });
      }
      if (mainDomain && chrome.cookies && chrome.cookies.getAll && chrome.cookies.remove) {
        const cookies = await chrome.cookies.getAll({ domain: mainDomain });
        await Promise.all(cookies.map(cookie => {
          const cookieDomain = cookie.domain.replace(/^\./, '');
          const url = `${cookie.secure ? 'https' : 'http'}://${cookieDomain}${cookie.path}`;
          return chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId });
        }));
      }
    } catch (e) {
      console.error('[NextAnti] 清理主域数据失败:', mainDomain, e && e.message);
    }
  }

  async function maybeAutoCleanPreviousMainDomain(tabId, url) {
    if (tabId === undefined || tabId === null || tabId === -1) return;
    const currentMainDomain = rememberMainDomainOrigin(url);
    if (!currentMainDomain) return;
    const previousMainDomain = TAB_LAST_MAIN_DOMAIN[tabId];
    TAB_LAST_MAIN_DOMAIN[tabId] = currentMainDomain;
    if (!previousMainDomain || previousMainDomain === currentMainDomain) return;
    const config = await readConfig();
    if (!config.isEnabled || !config.autoCleanPrevDomain) return;
    const origins = Object.keys(MAIN_DOMAIN_ORIGINS[previousMainDomain] || {});
    await clearOriginsData(origins, previousMainDomain);
    delete MAIN_DOMAIN_ORIGINS[previousMainDomain];
  }

  function pickRandomUA(exceptUA) {
    const pool = uaPool();
    if (!pool.length) return '';
    if (pool.length === 1) return pool[0];
    let picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked === exceptUA) picked = pool[(pool.indexOf(picked) + 1) % pool.length];
    return picked;
  }

  function isPrivateOrReservedIPv4(first, second) {
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    return false;
  }

  function generateRandomForwardedForIp() {
    for (;;) {
      const first = Math.floor(Math.random() * 223) + 1;
      const second = Math.floor(Math.random() * 256);
      if (isPrivateOrReservedIPv4(first, second)) continue;
      return `${first}.${second}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    }
  }

  function hashCode(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function getRuleIdForSite(site) {
    return UA_RULE_ID_BASE + (hashCode(site) % UA_RULE_ID_LIMIT);
  }

  async function upsertSiteUARule(site, ua, forwardedFor) {
    if (!site || !ua || !forwardedFor) return;
    const ruleId = getRuleIdForSite(site);
    const existingSite = Object.keys(SITE_UA_STATE).find(key => SITE_UA_STATE[key].ruleId === ruleId && key !== site);
    const removeRuleIds = new Set([ruleId]);
    if (existingSite) {
      removeRuleIds.add(SITE_UA_STATE[existingSite].ruleId);
      delete SITE_UA_STATE[existingSite];
    }
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: Array.from(removeRuleIds),
      addRules: [{
        id: ruleId,
        priority: 2,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'User-Agent', operation: 'set', value: ua },
            { header: 'X-Forwarded-For', operation: 'set', value: forwardedFor }
          ]
        },
        condition: { requestDomains: [site], resourceTypes: uaResourceTypes() }
      }]
    });
    SITE_UA_STATE[site] = { ruleId, ua, forwardedFor, updatedAt: Date.now() };
  }

  async function rotateSiteUA(url) {
    if (!isWebUrl(url)) return;
    const site = getHostname(url);
    if (!site) return;
    const config = await readConfig();
    if (!config.isEnabled || !config.uaRotationEnabled) return;
    const ua = pickRandomUA((SITE_UA_STATE[site] || {}).ua || '');
    const forwardedFor = generateRandomForwardedForIp();
    try {
      await upsertSiteUARule(site, ua, forwardedFor);
    } catch (e) {
      console.warn('[NextAnti] UA 规则写入失败:', e && e.message);
    }
  }

  async function clearAllSiteUARules() {
    try {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      const removeRuleIds = rules.map(rule => rule.id)
        .filter(id => id >= UA_RULE_ID_BASE && id < UA_RULE_ID_BASE + UA_RULE_ID_LIMIT);
      if (removeRuleIds.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
      for (const key of Object.keys(SITE_UA_STATE)) delete SITE_UA_STATE[key];
    } catch (e) {
      console.error('[NextAnti] 清理 UA 规则失败:', e && e.message);
    }
  }

  let statsLoaded = false;
  let persistTimer = null;

  async function ensureStatsLoaded() {
    if (statsLoaded) return;
    try {
      const data = await chrome.storage.local.get(['siteBlockStats', 'siteRecentBlocks', 'siteFindings']);
      for (const [site, count] of Object.entries(data.siteBlockStats || {})) {
        const safe = Number(count) || 0;
        if (safe > 0) SITE_BLOCK_STATS[site] = safe;
      }
      for (const [site, list] of Object.entries(data.siteRecentBlocks || {})) {
        if (Array.isArray(list)) SITE_RECENT_BLOCKS[site] = list.slice(-RECENT_LIMIT);
      }
      for (const [site, list] of Object.entries(data.siteFindings || {})) {
        if (Array.isArray(list)) SITE_FINDINGS[site] = list.slice(-FINDING_LIMIT);
      }
      statsLoaded = true;
    } catch (e) {
      console.error('[NextAnti] 读取统计失败:', e && e.message);
    }
  }

  function persistStats() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      chrome.storage.local.set({
        siteBlockStats: SITE_BLOCK_STATS,
        siteRecentBlocks: SITE_RECENT_BLOCKS,
        siteFindings: SITE_FINDINGS
      }).catch(() => {});
    }, 300);
  }

  async function addFinding(hostUrl, item) {
    await ensureStatsLoaded();
    const site = getHostname(hostUrl);
    if (!site || !item) return;
    const list = SITE_FINDINGS[site] || (SITE_FINDINGS[site] = []);
    if (list.some(entry => entry.name === item.name && entry.detail === item.detail)) return;
    list.push({
      name: String(item.name || '未知特征').slice(0, 60),
      detail: String(item.detail || '').slice(0, 300),
      level: ['danger', 'warn', 'info'].includes(item.level) ? item.level : 'warn',
      ts: item.ts || Date.now()
    });
    if (list.length > FINDING_LIMIT) list.splice(0, list.length - FINDING_LIMIT);
    persistStats();
  }

  function classifyBlock(url) {
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { host = String(url || ''); }
    const lower = String(url).toLowerCase();
    const hit = trackerList().find(rule => lower.includes(rule.host));
    return { host, rule: hit ? hit.host : '', url };
  }

  async function increaseSiteBlockCount(tabId, pageUrl, blockedUrl) {
    await ensureStatsLoaded();
    let site = getHostname(pageUrl);
    if (!site && tabId !== undefined && tabId !== null && tabId !== -1) {
      try {
        const tab = await chrome.tabs.get(tabId);
        site = getHostname(tab && tab.url);
      } catch (_) {  }
    }
    if (!site) return null;
    SITE_BLOCK_STATS[site] = (SITE_BLOCK_STATS[site] || 0) + 1;
    if (blockedUrl) {
      const list = SITE_RECENT_BLOCKS[site] || (SITE_RECENT_BLOCKS[site] = []);
      list.push({ ...classifyBlock(blockedUrl), ts: Date.now() });
      if (list.length > RECENT_LIMIT) list.splice(0, list.length - RECENT_LIMIT);
    }
    persistStats();
    return site;
  }

  let lastNotify = 0;

  async function handleBlock(url, tabId, pageUrl) {
    try {
      await ensureStatsLoaded();
      if (tabId && tabId !== -1) TAB_COUNTER[tabId] = (TAB_COUNTER[tabId] || 0) + 1;
      const site = await increaseSiteBlockCount(tabId, pageUrl, url);
      const config = await readConfig();
      const now = Date.now();
      if (config.isEnabled && config.notifyOnBlock && now - lastNotify > 2000) {
        lastNotify = now;
        const info = classifyBlock(url);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'MAPUS 已拦截追踪请求',
          message: `${info.host}${site ? '\n来源：' + site : ''}`
        }, () => void chrome.runtime.lastError);
      }
      console.warn('[NextAnti] 拦截:', url);
    } catch (e) {
      console.error('[NextAnti] 处理拦截失败:', e && e.message);
    }
  }

  async function clearSiteData(tabUrl) {
    const url = new URL(tabUrl);
    await chrome.browsingData.remove({ origins: [url.origin] }, {
      cache: true, cookies: true, localStorage: true, indexedDB: true,
      serviceWorkers: true, cacheStorage: true, fileSystems: true, webSQL: true
    });
    return { origin: url.origin };
  }

  async function siteStatus(url) {
    await ensureStatsLoaded();
    const site = getHostname(url);
    return {
      site,
      mainDomain: getMainDomain(site),
      blocks: site ? (SITE_BLOCK_STATS[site] || 0) : 0,
      recent: site ? (SITE_RECENT_BLOCKS[site] || []).slice(-12).reverse() : [],
      findings: site ? (SITE_FINDINGS[site] || []).slice(-20).reverse() : [],
      ua: site ? (SITE_UA_STATE[site] || null) : null
    };
  }

  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const next = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      next[key] = existing[key] === undefined ? value : existing[key];
    }
    await chrome.storage.local.set(next);
    await clearAllSiteUARules();
    await ensureStatsLoaded();
    await initializeRules(next.isEnabled);
  });

  chrome.runtime.onStartup.addListener(async () => {
    await clearAllSiteUARules();
    await ensureStatsLoaded();
    const config = await readConfig();
    await initializeRules(config.isEnabled);
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'mapus_rules')) {
      RULES = self.MAPUS_RULES ? await self.MAPUS_RULES.get() : null;
      const config = await readConfig();
      await initializeRules(config.isEnabled);
      await clearAllSiteUARules();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'isEnabled')) {
      const enabled = changes.isEnabled.newValue !== false;
      await initializeRules(enabled);
      if (!enabled) await clearAllSiteUARules();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'uaRotationEnabled')) {
      if (changes.uaRotationEnabled.newValue === false) await clearAllSiteUARules();
    }
  });

  if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
    chrome.webNavigation.onBeforeNavigate.addListener(async details => {
      if (details.frameId !== 0) return;
      await maybeAutoCleanPreviousMainDomain(details.tabId, details.url);
      await rotateSiteUA(details.url);
    });
  }

  if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(info => {
      const request = info.request;
      if (!request) return;
      if (request.tabId === undefined) return;
      const hit = trackerList()[info.rule.ruleId - 1];
      if (!hit) return;
      handleBlock(request.url, request.tabId, request.initiator);
    });
  }

  chrome.webNavigation && chrome.webNavigation.onErrorOccurred && chrome.webNavigation.onErrorOccurred.addListener(details => {
    if (details.error && details.error.includes('ERR_BLOCKED_BY_CLIENT')) {
      console.warn('[NextAnti] 浏览器已拦截:', details.url);
    }
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    delete TAB_COUNTER[tabId];
    delete TAB_LAST_MAIN_DOMAIN[tabId];
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') TAB_COUNTER[tabId] = 0;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.to !== 'anti') return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    (async () => {
      try {
        switch (message.type) {
          case 'BLOCK_DETECTED': {
            await handleBlock(message.url, sender.tab && sender.tab.id, (sender.tab && sender.tab.url) || message.url);
            sendResponse({ ok: true });
            return;
          }
          case 'ALERT': {
            const config = await readConfig();
            if (config.isEnabled && config.notifyOnBlock) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'MAPUS 隐私防护提醒',
                message: String(message.message || '').slice(0, 200)
              }, () => void chrome.runtime.lastError);
            }
            sendResponse({ ok: true });
            return;
          }
          case 'ANTI_FINDING': {
            const url = (sender.tab && sender.tab.url) || message.url || '';
            await addFinding(url, message.finding);
            sendResponse({ ok: true });
            return;
          }
          case 'ANTI_STATE': {
            const config = await readConfig();
            const url = message.url || (sender.tab && sender.tab.url) || '';
            const status = await siteStatus(url);
            sendResponse({ ...config, ...status, tabId: sender.tab ? sender.tab.id : null });
            return;
          }
          case 'ANTI_SET': {
            const patch = message.patch || {};
            const allowed = Object.keys(DEFAULT_SETTINGS);
            const clean = {};
            for (const [key, value] of Object.entries(patch)) {
              if (allowed.includes(key)) clean[key] = value;
            }
            await chrome.storage.local.set(clean);
            sendResponse({ ok: true, config: await readConfig() });
            return;
          }
          case 'ANTI_CLEAR_SITE': {
            const result = await clearSiteData(message.url || (sender.tab && sender.tab.url));
            const site = getHostname(message.url || (sender.tab && sender.tab.url));
            if (site) {
              SITE_BLOCK_STATS[site] = 0;
              SITE_RECENT_BLOCKS[site] = [];
              SITE_FINDINGS[site] = [];
              persistStats();
            }
            if (sender.tab) TAB_COUNTER[sender.tab.id] = 0;
            sendResponse({ ok: true, ...result });
            return;
          }
          case 'ANTI_RESET_STATS': {
            for (const key of Object.keys(SITE_BLOCK_STATS)) delete SITE_BLOCK_STATS[key];
            for (const key of Object.keys(SITE_RECENT_BLOCKS)) delete SITE_RECENT_BLOCKS[key];
            for (const key of Object.keys(SITE_FINDINGS)) delete SITE_FINDINGS[key];
            persistStats();
            sendResponse({ ok: true });
            return;
          }
        }
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  });

  ensureStatsLoaded().then(() => syncRulesOnBoot());

  async function syncRulesOnBoot() {
    try {
      if (self.MAPUS_GATE) await self.MAPUS_GATE.ready;
      const config = await readConfig();
      const master = !self.MAPUS_GATE || self.MAPUS_GATE.isEnabled();
      await initializeRules(master && config.isEnabled);
    } catch (e) {
      console.warn('[NextAnti] 启动同步规则失败:', e && e.message);
    }
  }

  self.MAPUS_ANTI_MASTER = async function (enabled) {
    if (enabled) {
      const config = await readConfig();
      await initializeRules(config.isEnabled);
      return;
    }
    await initializeRules(false);
    await clearAllSiteUARules();
  };

  self.MAPUS_ANTI = { siteStatus, classifyBlock, clearSiteData, readConfig };
})();
