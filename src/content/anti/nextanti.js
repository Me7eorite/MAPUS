(function () {
  'use strict';
  if (window.__NEXTANTI_CONTENT_LOADED__) return;
  window.__NEXTANTI_CONTENT_LOADED__ = true;

  const runtimeConfig = { isEnabled: true, fingerprintEnabled: true, webrtcEnabled: true };
  let hasInjected = false;
  let monitorsInstalled = false;
  let rules = null;
  const reported = new Set();

  function applyConfig(data) {
    const master = !data || data.mapus_enabled !== false;
    runtimeConfig.isEnabled = master && (!data || data.isEnabled !== false);
    runtimeConfig.fingerprintEnabled = !data || data.fingerprintEnabled !== false;
    runtimeConfig.webrtcEnabled = !data || data.webrtcEnabled !== false;
  }

  function postConfig() {
    window.postMessage({ type: 'NEXTANTI_CONFIG_UPDATE', config: runtimeConfig }, '*');
  }

  async function loadConfig() {
    try {
      applyConfig(await chrome.storage.local.get(['isEnabled', 'fingerprintEnabled', 'webrtcEnabled', 'mapus_enabled']));
    } catch (_) {  }
  }

  async function loadRules() {
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'MAPUS_RULES_RUNTIME' });
      if (reply && reply.ok && reply.rules && reply.rules.honeypot) {
        rules = reply.rules;
        return true;
      }
    } catch (_) {  }
    return false;
  }

  function honeypot() {
    return (rules && rules.honeypot) || null;
  }

  function send(payload) {
    try {
      chrome.runtime.sendMessage({ to: 'anti', ...payload }).catch(() => {});
    } catch (_) {  }
  }

  function finding(name, detail, level) {
    const key = name + '|' + detail;
    if (reported.has(key)) return;
    reported.add(key);
    send({ type: 'ANTI_FINDING', finding: { name, detail, level: level || 'warn', ts: Date.now() } });
  }

  function sendBlock(url) {
    send({ type: 'BLOCK_DETECTED', url });
  }

  function injectScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/nextanti.js');
      script.dataset.nextantiConfig = JSON.stringify(runtimeConfig);
      script.type = 'text/javascript';
      script.async = false;
      script.onload = function () { this.remove(); postConfig(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[NextAnti] 注入失败:', e);
    }
  }

  function detectHoneypotFeatures() {
    if (!runtimeConfig.isEnabled) return;
    const conf = honeypot();
    if (!conf || !Array.isArray(conf.features)) return;
    try {
      const html = document.documentElement.innerHTML.toLowerCase();
      for (const feature of conf.features) {
        for (const sign of feature.signs || []) {
          if (sign && html.includes(sign)) {
            finding(feature.name, feature.detail, feature.level || 'danger');
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[NextAnti] 特征检测失败:', e);
    }
  }

  function detectObfuscatedScripts() {
    if (!runtimeConfig.isEnabled) return;
    const conf = honeypot();
    if (!conf || !Array.isArray(conf.obfuscation) || !conf.obfuscation.length) return;
    const matchers = [];
    for (const item of conf.obfuscation) {
      try {
        matchers.push({ item, re: new RegExp(item.pattern, item.flags || '') });
      } catch (_) {  }
    }
    try {
      for (const script of document.querySelectorAll('script')) {
        const code = script.textContent || '';
        if (!code) continue;
        for (const { item, re } of matchers) {
          re.lastIndex = 0;
          if (re.test(code)) {
            finding(item.name, item.detail, item.level || 'warn');
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[NextAnti] 混淆检测失败:', e);
    }
  }

  function matchSuspectKey(value) {
    const conf = honeypot();
    const keys = conf && Array.isArray(conf.suspectScriptKeys) ? conf.suspectScriptKeys : [];
    if (!keys.length || !value) return false;
    const lower = String(value).toLowerCase();
    return keys.some(key => lower.includes(key));
  }

  function monitorDynamicScripts() {
    try {
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!node || node.tagName !== 'SCRIPT') continue;
            const src = node.src || '';
            if (!src || !runtimeConfig.isEnabled) continue;
            if (matchSuspectKey(src)) {
              finding('可疑动态脚本', src, 'danger');
              sendBlock(src);
            }
          }
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[NextAnti] 动态脚本监控失败:', e);
    }
  }

  function monitorClipboard() {
    document.addEventListener('copy', () => {
      if (runtimeConfig.isEnabled) finding('剪贴板', '页面监听 copy 事件', 'info');
    }, true);
    document.addEventListener('paste', () => {
      if (runtimeConfig.isEnabled) finding('剪贴板', '页面监听 paste 事件（可能采集粘贴内容）', 'warn');
    }, true);
  }

  function detectHiddenIframes() {
    if (!runtimeConfig.isEnabled) return;
    try {
      for (const iframe of document.querySelectorAll('iframe')) {
        const style = window.getComputedStyle(iframe);
        if (style.display === 'none' || style.visibility === 'hidden' ||
          iframe.width === '0' || iframe.height === '0') {
          finding('隐藏 iframe', iframe.src || '(无 src)', 'danger');
          if (iframe.src) sendBlock(iframe.src);
        }
      }
    } catch (e) {
      console.warn('[NextAnti] iframe 检测失败:', e);
    }
  }

  function monitorEvalUsage() {
    try {
      const originalEval = window.eval;
      window.eval = function () {
        if (runtimeConfig.isEnabled) finding('动态执行', '页面调用 eval', 'info');
        return originalEval.apply(this, arguments);
      };
    } catch (e) {
      console.warn('[NextAnti] eval 监控失败:', e);
    }
  }

  function monitorNetwork() {
    try {
      const originalFetch = window.fetch;
      window.fetch = function (...args) {
        try {
          const url = args[0];
          if (runtimeConfig.isEnabled && typeof url === 'string' && matchSuspectKey(url)) {
            finding('可疑请求', url, 'warn');
            sendBlock(url);
          }
        } catch (_) {  }
        return originalFetch.apply(this, args);
      };
    } catch (e) {
      console.warn('[NextAnti] fetch 监控失败:', e);
    }
    try {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          if (runtimeConfig.isEnabled && typeof url === 'string' && matchSuspectKey(url)) {
            finding('可疑 XHR', url, 'warn');
            sendBlock(url);
          }
        } catch (_) {  }
        return originalOpen.apply(this, arguments);
      };
    } catch (e) {
      console.warn('[NextAnti] XHR 监控失败:', e);
    }
  }

  function ensureInjected() {
    if (hasInjected) return;
    injectScript();
    hasInjected = true;
  }

  function runDetections() {
    detectHoneypotFeatures();
    detectObfuscatedScripts();
    detectHiddenIframes();
  }

  function installMonitors() {
    if (monitorsInstalled) return;
    const conf = honeypot() || {};
    monitorDynamicScripts();
    if (conf.watchClipboard !== false) monitorClipboard();
    if (conf.watchEval !== false) monitorEvalUsage();
    if (conf.watchFetch !== false) monitorNetwork();
    monitorsInstalled = true;
  }

  function init() {
    if (!runtimeConfig.isEnabled) {
      postConfig();
      return;
    }
    ensureInjected();
    if (!rules) {
      return;
    }
    runDetections();
    installMonitors();
  }

  let retryTimer = null;
  let retryCount = 0;

  function scheduleDetection() {
    clearTimeout(retryTimer);
    const delay = rules ? 0 : Math.min(4000, 300 * Math.pow(2, retryCount));
    retryTimer = setTimeout(async () => {
      if (!rules) {
        const ok = await loadRules();
        if (!ok) {
          retryCount++;
          if (retryCount <= 6) scheduleDetection();
          return;
        }
        retryCount = 0;
      }
      init();
    }, delay);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || !event.data) return;
    const data = event.data;
    if (data.type === 'NEXTANTI_BLOCK') sendBlock(data.url);
    if (data.type === 'NEXTANTI_ALERT') send({ type: 'ALERT', message: data.message });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'mapus_rules')) {
      rules = null;
      retryCount = 0;
      scheduleDetection();
      return;
    }
    let touched = false;
    if (changes.mapus_enabled) {
      loadConfig().then(() => {
        postConfig();
        if (runtimeConfig.isEnabled) init();
      });
      return;
    }
    if (changes.isEnabled) { runtimeConfig.isEnabled = changes.isEnabled.newValue !== false; touched = true; }
    if (changes.fingerprintEnabled) { runtimeConfig.fingerprintEnabled = changes.fingerprintEnabled.newValue !== false; touched = true; }
    if (changes.webrtcEnabled) { runtimeConfig.webrtcEnabled = changes.webrtcEnabled.newValue !== false; touched = true; }
    if (!touched) return;
    postConfig();
    if (runtimeConfig.isEnabled) init();
  });

  (async () => {
    await loadConfig();
    await loadRules();
    const start = () => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
        ensureInjected();
      } else {
        init();
      }
      if (!rules) scheduleDetection();
    };
    start();
  })();
})();
