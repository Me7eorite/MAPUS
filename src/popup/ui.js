
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function send(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

export function sendTab(tabId, message) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) resolve({ __error: chrome.runtime.lastError.message });
        else resolve(response);
      });
    } catch (error) {
      resolve({ __error: error.message });
    }
  });
}

export async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return (tabs && tabs[0]) || null;
}

export function canInspect(url) {
  return typeof url === 'string' && /^(https?|file):/i.test(url);
}

export function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ''; }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      return true;
    } catch (e) {
      return false;
    }
  }
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let node = $('#toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast' });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.dataset.kind = kind;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 1800);
}

export function timeAgo(ts) {
  const diff = Date.now() - Number(ts || 0);
  if (!Number.isFinite(diff) || diff < 0) return '';
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return Math.floor(diff / 86400000) + ' 天前';
}

export function shortUrl(url, max = 46) {
  const text = String(url || '').replace(/^https?:\/\//, '');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function sectionCard(title, subtitle, bodyHtml, extraClass = '') {
  return `
    <section class="card ${extraClass}">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </div>
      <div class="card-body">${bodyHtml}</div>
    </section>`;
}

export function emptyState(icon, title, description) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-desc">${escapeHtml(description || '')}</div>
    </div>`;
}

export function spinner(label = '加载中…') {
  return `<div class="loading-inline"><span class="spinner"></span>${escapeHtml(label)}</div>`;
}

export function toggleRow({ id, title, desc, checked, disabled, tone }) {
  return `
    <label class="switch-row ${tone ? 'tone-' + tone : ''}">
      <span class="switch-text">
        <span class="switch-title">${escapeHtml(title)}</span>
        ${desc ? `<span class="switch-desc">${escapeHtml(desc)}</span>` : ''}
      </span>
      <span class="switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span class="track"><span class="knob"></span></span>
      </span>
    </label>`;
}

export const ICON = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 13h6v7H4zM4 4h6v6H4zM14 4h6v10h-6zM14 17h6v3h-6z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16M4 12h10M4 18h13"/><circle cx="19" cy="12" r="2"/></svg>',
  anti: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  hook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15 7l5 5-5 5"/><path d="M9 17l-5-5 5-5"/><path d="M13 4l-2 16"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/></svg>',
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4"/><circle cx="9" cy="13" r="1.2"/><circle cx="15" cy="13" r="1.2"/><path d="M9.5 16.5h5"/></svg>',
  findings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M9 13l2 2 4-4"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l16-8-6 16-3-6z"/><path d="M11 14l9-10"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
};

export const DASHBOARD_URL = () => chrome.runtime.getURL('dashboard/dashboard.html');

export async function openDashboard(tab = '') {
  const base = DASHBOARD_URL();
  const url = tab ? `${base}#${tab}` : base;
  try {
    const tabs = await chrome.tabs.query({});
    const existing = (tabs || []).find(item => (item.url || '').startsWith(base));
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true, url });
      if (existing.windowId !== undefined) {
        try { await chrome.windows.update(existing.windowId, { focused: true }); } catch (_) {   }
      }
      return;
    }
    await chrome.tabs.create({ url });
  } catch (_) {
    try { chrome.tabs.create({ url }); } catch (_) {   }
  }
}
