(function () {
  'use strict';
  if (self.MAPUS_FINDINGS) return;
  const KEY = 'mapus_findings';
  const MAX_FINDINGS = 500;
  const BODY_LIMIT = 20000;
  const listeners = new Set();

  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clip = (value, limit) => {
    const text = String(value === undefined || value === null ? '' : value);
    return text.length > limit ? text.slice(0, limit) + `…[截断，共 ${text.length} 字符]` : text;
  };
  const hostOf = url => {
    try { return new URL(String(url)).host || ''; } catch (_) { return ''; }
  };

  async function load() {
    const box = await chrome.storage.local.get(KEY);
    const list = box[KEY];
    return Array.isArray(list) ? list : [];
  }
  async function save(list) {
    await chrome.storage.local.set({ [KEY]: list.slice(-MAX_FINDINGS) });
  }
  function broadcast(event) {
    for (const fn of listeners) {
      try { fn(event); } catch (_) {  }
    }
    chrome.runtime.sendMessage({ type: 'MAPUS_FINDINGS_CHANGED', ...event }).catch(() => { });
  }

  function normalize(input) {
    if (!input || typeof input !== 'object') return null;
    const title = clip(input.title, 160).trim();
    if (!title) return null;
    const severity = ['critical', 'high', 'medium', 'low', 'info'].includes(input.severity) ? input.severity : 'medium';
    const url = clip(input.url, 600);
    const evidence = input.evidence && typeof input.evidence === 'object' ? input.evidence : {};
    const request = evidence.request && typeof evidence.request === 'object' ? evidence.request : {};
    const response = evidence.response && typeof evidence.response === 'object' ? evidence.response : {};
    const shot = typeof evidence.screenshot === 'string' && evidence.screenshot.startsWith('data:image')
      ? (evidence.screenshot.length > 900000 ? null : evidence.screenshot)
      : null;
    return {
      id: uid('fv'),
      taskId: clip(input.taskId, 60) || '',
      host: hostOf(url) || clip(input.host, 120),
      title,
      severity,
      cwe: clip(input.cwe, 40),
      url,
      param: clip(input.param, 120),
      description: clip(input.description, 4000),
      reproduction: clip(input.reproduction, 4000),
      remediation: clip(input.remediation, 2000),
      confidence: ['confirmed', 'probable', 'possible'].includes(input.confidence) ? input.confidence : 'probable',
      request: {
        method: clip(request.method, 10) || 'GET',
        url: clip(request.url, 900) || url,
        headers: clip(request.headers, 4000),
        body: clip(request.body, BODY_LIMIT)
      },
      response: {
        status: Number(response.status) || 0,
        statusText: clip(response.statusText, 60),
        headers: clip(response.headers, 4000),
        body: clip(response.body, BODY_LIMIT),
        contentType: clip(response.contentType, 120)
      },
      screenshot: shot,
      createdAt: Date.now()
    };
  }

  async function add(input) {
    const finding = normalize(input);
    if (!finding) return { error: '风险数据不完整：至少需要 title 与 url' };
    const list = await load();
    const key = `${finding.host}|${finding.title}|${finding.url}|${finding.param}`;
    const duplicate = list.find(item => `${item.host}|${item.title}|${item.url}|${item.param}` === key);
    if (duplicate) {
      return { ok: true, duplicate: true, findingId: duplicate.id, siteTotal: list.filter(item => item.host === finding.host).length };
    }
    list.push(finding);
    await save(list);
    broadcast({ action: 'added', findingId: finding.id, host: finding.host, total: list.length });
    const siteFindings = list.filter(item => item.host === finding.host);
    return {
      ok: true,
      findingId: finding.id,
      duplicate: false,
      siteTotal: siteFindings.length,
      siteFindings: siteFindings.map(item => ({
        id: item.id, title: item.title, severity: item.severity, cwe: item.cwe,
        url: item.url, confidence: item.confidence, createdAt: item.createdAt
      }))
    };
  }

  async function listBySite(host) {
    const list = await load();
    return list.filter(item => !host || item.host === host);
  }

  async function all() {
    return load();
  }

  async function get(id) {
    const list = await load();
    return list.find(item => item.id === id) || null;
  }

  async function summary() {
    const list = await load();
    const sites = new Map();
    const levels = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const item of list) {
      levels[item.severity] = (levels[item.severity] || 0) + 1;
      const site = sites.get(item.host) || { host: item.host, total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, lastAt: 0 };
      site.total += 1;
      site[item.severity] += 1;
      site.lastAt = Math.max(site.lastAt, item.createdAt);
      sites.set(item.host, site);
    }
    return { total: list.length, sites: [...sites.values()].sort((a, b) => b.lastAt - a.lastAt), levels };
  }

  async function removeOne(id) {
    const list = await load();
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return { ok: false, error: '风险记录不存在' };
    const removed = list.splice(index, 1)[0];
    await save(list);
    broadcast({ action: 'deleted', findingId: id, host: removed.host, total: list.length });
    return { ok: true, total: list.length };
  }

  async function clearAll(host) {
    const list = await load();
    const next = host ? list.filter(item => item.host !== host) : [];
    await save(next);
    broadcast({ action: 'cleared', host: host || '', total: next.length });
    return { ok: true, total: next.length };
  }

  async function attachScreenshot(id, dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return { error: '无效的截图数据' };
    const list = await load();
    const item = list.find(entry => entry.id === id);
    if (!item) return { error: '风险记录不存在' };
    if (dataUrl.length <= 900000) item.screenshot = dataUrl;
    await save(list);
    broadcast({ action: 'updated', findingId: id, host: item.host, total: list.length });
    return { ok: true };
  }

  async function rawHttpText(side, packet) {
    if (!packet) return '';
    const lines = [];
    if (side === 'request') {
      lines.push(`${packet.method || 'GET'} ${safePath(packet.url)} HTTP/1.1`);
      lines.push(`Host: ${hostOf(packet.url) || '?'}`);
      if (packet.headers) lines.push(...String(packet.headers).split('\n'));
    } else {
      lines.push(`HTTP/1.1 ${packet.status || 0} ${packet.statusText || ''}`.trim());
      if (packet.headers) lines.push(...String(packet.headers).split('\n'));
    }
    lines.push('');
    if (packet.body) lines.push(packet.body);
    return lines.join('\n');
  }
  function safePath(url) {
    try { const u = new URL(String(url)); return (u.pathname || '/') + u.search; } catch (_) { return String(url || '/'); }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.to !== 'findings') return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    (async () => {
      try {
        switch (message.type) {
          case 'FINDINGS_LIST': sendResponse({ ok: true, findings: await listBySite(message.host || ''), summary: await summary() }); return;
          case 'FINDINGS_GET': {
            const finding = await get(message.id);
            sendResponse(finding ? { ok: true, finding } : { ok: false, error: '不存在' });
            return;
          }
          case 'FINDINGS_SUMMARY': sendResponse({ ok: true, summary: await summary() }); return;
          case 'FINDINGS_CLEAR': sendResponse(await clearAll(message.host || '')); return;
          case 'FINDINGS_DELETE': sendResponse(await removeOne(message.id || '')); return;
          default: sendResponse({ ok: false, error: '未知指令' });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  });

  self.MAPUS_FINDINGS = { add, all, get, listBySite, summary, clearAll, removeOne, attachScreenshot, normalize, rawHttpText, onChange: fn => listeners.add(fn) };
})();
