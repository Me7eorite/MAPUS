(function () {
  'use strict';
  if (!window.__mapusReport) return;
  const api = window.__mapusReport.create({ title: 'JS 端点发现', subtitle: location.hostname });

  const cfg = window.__mapusToolConfig && window.__mapusToolConfig.endpoint;
  if (!cfg) {
    api.status('未获取到端点规则，请从侧边栏重新运行');
    return;
  }

  const build = (pattern, flags) => {
    try { return new RegExp(pattern, flags || ''); } catch (_) { return null; }
  };

  const SKIP = build('\\.(' + cfg.skipExtension + ')(\\?|$)', 'i');
  const API_HINT = build(cfg.apiHint, 'i');
  const ASSET_HINT = build(cfg.assetHint, 'i');
  const GET_HINT = build(cfg.getHint, 'i');
  const POST_HINT = build(cfg.postHint, 'i');
  const maxPathLength = Math.max(40, Math.min(2000, Number(cfg.maxPathLength) || 300));
  const maxResults = Math.max(20, Math.min(5000, Number(cfg.maxResults) || 400));

  const PATH_RE = /["'`]((?:https?:\/\/[^"'`\s<>]+)|(?:\/[a-zA-Z0-9_\-./]{2,}))["'`]/g;
  const found = new Map();

  function push(value, source) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > maxPathLength) return;
    if (SKIP && SKIP.test(raw)) return;
    if (/^(javascript:|data:|mailto:|#)/i.test(raw)) return;
    let url;
    try { url = new URL(raw, location.href); } catch (_) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname !== location.hostname) return;
    const path = url.pathname + (url.search || '');
    if (path === '/' || path === '/#') return;
    const existing = found.get(path);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    if (found.size >= maxResults) return;
    found.set(path, { path, sources: [source], method: guessMethod(path) });
  }

  function guessMethod(path) {
    if (GET_HINT && GET_HINT.test(path)) return 'GET?';
    if (POST_HINT && POST_HINT.test(path)) return 'POST?';
    return '';
  }

  function scanInline(text, source) {
    if (!text) return;
    let match;
    PATH_RE.lastIndex = 0;
    while ((match = PATH_RE.exec(text)) !== null) push(match[1], source);
  }

  try {
    api.status('正在收集内联脚本…');
    let index = 0;
    for (const script of document.querySelectorAll('script')) {
      const src = script.src;
      if (src) push(src, 'script[src]');
      const code = script.textContent || '';
      if (code) scanInline(code, '内联脚本#' + (++index));
    }
    for (const link of document.querySelectorAll('link[href]')) push(link.getAttribute('href'), 'link');
    for (const form of document.querySelectorAll('form[action]')) push(form.getAttribute('action'), 'form.action');
    for (const anchor of document.querySelectorAll('a[href]')) push(anchor.getAttribute('href'), 'a[href]');
    for (const element of document.querySelectorAll('[data-url],[data-api],[data-src]')) {
      push(element.dataset.url, 'data-url');
      push(element.dataset.api, 'data-api');
      push(element.dataset.src, 'data-src');
    }

    const entries = [...found.values()].sort((a, b) => {
      const score = item => ((API_HINT && API_HINT.test(item.path)) ? 2 : 0) + (item.method ? 1 : 0);
      return score(b) - score(a) || a.path.localeCompare(b.path);
    });

    api.clear();
    api.progress(1, 1);
    if (!entries.length) {
      api.add({ label: '当前页面未发现可达同源端点', level: 'info', badge: '0' });
    }
    const groups = { api: [], page: [], asset: [] };
    for (const entry of entries) {
      if (API_HINT && API_HINT.test(entry.path)) groups.api.push(entry);
      else if (ASSET_HINT && ASSET_HINT.test(entry.path)) groups.asset.push(entry);
      else groups.page.push(entry);
    }
    const emit = (list, level, badge) => list.forEach(entry => api.add({
      label: entry.path,
      meta: [entry.method, entry.sources.slice(0, 2).join(' / '), entry.sources.length + ' 处引用'].filter(Boolean).join(' · '),
      level,
      badge
    }));
    emit(groups.api, 'danger', 'API');
    emit(groups.page, 'warn', '页面');
    emit(groups.asset, 'info', '静态');
    api.status(`共 ${entries.length} 个同源端点（API ${groups.api.length}）`);
  } catch (error) {
    api.status('执行失败：' + error.message);
  }
})();
