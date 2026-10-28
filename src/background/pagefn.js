(function () {
  'use strict';
  if (self.MAPUS_PAGEFN) return;

  function domQuery(sel, max, attrs) {
    let nodes;
    try { nodes = Array.from(document.querySelectorAll(sel)); } catch (error) { return { error: '选择器无效：' + error.message }; }
    return {
      count: nodes.length,
      items: nodes.slice(0, max).map(node => {
        const item = {
          tag: node.tagName.toLowerCase(),
          text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240)
        };
        if (attrs.length) item.attrs = Object.fromEntries(attrs.map(name => [name, node.getAttribute(name)]));
        return item;
      })
    };
  }

  function pageText(limit) {
    const clone = document.body ? document.body.cloneNode(true) : null;
    if (!clone) return { title: document.title, text: '' };
    clone.querySelectorAll('script,style,noscript,template,svg').forEach(node => node.remove());
    const raw = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    return { title: document.title, url: location.href, total: raw.length, text: raw.slice(0, limit) };
  }

  function pageStorage(target, withValue, max) {
    const store = target === 'session' ? sessionStorage : localStorage;
    const items = [];
    try {
      for (let i = 0; i < store.length && items.length < max; i++) {
        const key = store.key(i);
        const value = store.getItem(key) || '';
        items.push(withValue
          ? { key, length: value.length, value: value.slice(0, 200) }
          : { key, length: value.length });
      }
    } catch (error) { return { error: error.message }; }
    return { type: target, count: store.length, items };
  }

  function collectEndpoints() {
    const scripts = Array.from(document.scripts).map(node => node.src).filter(Boolean);
    const links = Array.from(document.querySelectorAll('link[href]')).map(node => node.getAttribute('href')).filter(Boolean);
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const found = new Set();
    const regex = /["'`](\/[A-Za-z0-9_\-./?=&%{}:]{3,140})["'`]/g;
    let match;
    while ((match = regex.exec(html)) && found.size < 400) {
      const path = match[1];
      if (/\.(png|jpe?g|gif|svg|webp|ico|css|woff2?|ttf|map)$/i.test(path)) continue;
      if (path.startsWith('//')) continue;
      found.add(path);
    }
    return {
      scripts: [...new Set(scripts)].slice(0, 80),
      styles: [...new Set(links)].slice(0, 40),
      paths: [...found].slice(0, 150),
      forms: Array.from(document.forms).map(form => ({ action: form.getAttribute('action'), method: form.method })),
      inlineScriptHandlers: Array.from(document.querySelectorAll('[onclick],[onsubmit]')).length
    };
  }

  function href() {
    return location.href;
  }

  function markNonce(nonce) {
    if (nonce === null) delete window.__ADB_MCP_TARGET__;
    else Object.defineProperty(window, '__ADB_MCP_TARGET__', { value: nonce, configurable: true, writable: false, enumerable: false });
    return { href: location.href, nonce: window.__ADB_MCP_TARGET__ || null };
  }

  function applyConfig(config) {
    window.__mapusToolConfig = config;
  }

  function fetchText(url) {
    return fetch(url, { credentials: 'omit' }).then(res => res.text());
  }

  self.MAPUS_PAGEFN = {
    domQuery,
    pageText,
    pageStorage,
    collectEndpoints,
    href,
    markNonce,
    applyConfig,
    fetchText
  };
})();
