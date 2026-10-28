import { escapeHtml, toast, copyText } from '../popup/ui.js';

export { escapeHtml, toast, copyText };

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const SEV_TEXT = { critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息' };
export const STATUS_TEXT = {
  queued: '排队', running: '执行中', done: '完成', error: '出错', stopped: '已停止', stopping: '停止中'
};
export const CONF_TEXT = { confirmed: '已确认', probable: '很可能', possible: '存疑' };

export function esc(value) {
  return escapeHtml(value);
}

export function dayOf(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export function timeOf(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

export function rpc(target, type, extra) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ to: target, type, ...(extra || {}) }, response => {
        if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
        else resolve(response || {});
      });
    } catch (error) {
      resolve({ error: error.message });
    }
  });
}

export const harness = (type, extra) => rpc('harness', type, extra);
export const findings = (type, extra) => rpc('findings', type, extra);
export const agent = (type, extra) => rpc('agent', type, extra);

export function saveStore(patch) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set(patch, () => resolve(true));
    } catch (_) {
      resolve(false);
    }
  });
}

export function readStore(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, data => resolve(data || {}));
    } catch (_) {
      resolve({});
    }
  });
}

export function clearStore() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.clear(() => resolve(true));
    } catch (_) {
      resolve(false);
    }
  });
}

export function packetText(side, packet, url) {
  if (!packet) return '';
  const lines = [];
  if (side === 'request') {
    let path = '/';
    let host = '?';
    try {
      const parsed = new URL(packet.url || url);
      path = parsed.pathname + parsed.search;
      host = parsed.host;
    } catch (_) {
      path = packet.url || url;
    }
    lines.push(`${packet.method || 'GET'} ${path} HTTP/1.1`);
    lines.push(`Host: ${host}`);
    if (packet.headers) lines.push(...String(packet.headers).split('\n').filter(Boolean));
  } else {
    lines.push(`HTTP/1.1 ${packet.status || 0} ${packet.statusText || ''}`.trim());
    if (packet.headers) lines.push(...String(packet.headers).split('\n').filter(Boolean));
  }
  lines.push('');
  if (packet.body) lines.push(packet.body);
  return lines.join('\n');
}

export function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
