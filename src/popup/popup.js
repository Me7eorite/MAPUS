import { $, $$, el, send, sendTab, activeTab, canInspect, hostOf, copyText, toast, ICON, escapeHtml, openDashboard, t, isEnglish } from './ui.js';
import { renderOverview } from './views/overview.js';
import { renderInfo } from './views/info.js';
import { renderAgent } from './views/agent.js';
import { renderAnti } from './views/anti.js';
import { renderHooks } from './views/hooks.js';
import { renderFindings } from './views/findings.js';
import { renderAbout } from './views/about.js';

const NAV = [
  { id: 'overview', label: '总览', icon: ICON.overview },
  { id: 'info', label: '信息', icon: ICON.info },
  { id: 'agent', label: '助手', icon: ICON.agent },
  { id: 'findings', label: '报告', icon: ICON.findings },
  { id: 'anti', label: '隐私', icon: ICON.anti },
  { id: 'hooks', label: '脚本', icon: ICON.hook }
];

const RENDERERS = {
  overview: renderOverview,
  info: renderInfo,
  agent: renderAgent,
  findings: renderFindings,
  anti: renderAnti,
  hooks: renderHooks,
  about: renderAbout
};

export const state = {
  tab: null,
  view: 'overview',
  enabled: true,
  contentReady: false,
  results: null,
  progress: 0,
  scanning: false,
  fingerprints: [],
  anti: null,
  adb: { state: null, catalog: null, routes: null, library: null, error: null },
  busy: false,
  ui: {}
};

const COUNT_KEYS = ['domains', 'absoluteApis', 'apis', 'moduleFiles', 'docFiles', 'credentials', 'cookies',
  'idKeys', 'phones', 'emails', 'idcards', 'ips', 'companies', 'jwts', 'imageFiles', 'githubUrls',
  'vueFiles', 'jsFiles', 'urls'];

let lastInteraction = 0;

export function countFindings(results) {
  if (!results) return 0;
  return COUNT_KEYS.reduce((total, key) => total + (Array.isArray(results[key]) ? results[key].length : 0), 0);
}

export function securityFindings() {
  const list = state.results && state.results.securityFindings;
  if (!Array.isArray(list)) return [];
  return list.filter(item => item && item.text);
}

async function loadTab() {
  const tab = await activeTab();
  state.tab = tab ? { id: tab.id, url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl } : null;
  const host = hostOf(state.tab && state.tab.url);
  $('#hostLine').textContent = host ? host + (state.tab.title ? ' · ' + state.tab.title : '') : '当前页面不可检测';
  $('#hostLine').title = (state.tab && state.tab.url) || '';
  const inspectable = state.tab && canInspect(state.tab.url);
  $('#btnScan').disabled = !inspectable;
  $('#btnExport').disabled = !inspectable;
  return state.tab;
}

async function fetchScan() {
  if (!state.tab) return;
  const response = await sendTab(state.tab.id, { type: 'GET_RESULTS', tabId: state.tab.id, from: 'popup' });
  if (response && response.__error) {
    state.contentReady = false;
    return;
  }
  state.contentReady = true;
  state.results = response || null;
  const progress = response && response.progress;
  if (Array.isArray(progress) && progress[0]) {
    const entry = progress[0];
    const raw = Array.isArray(entry) ? entry[1] : entry;
    const value = typeof raw === 'number' ? raw : Number(raw);
    state.progress = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  }
  state.scanning = state.progress < 100;
}

async function fetchFingerprints() {
  if (!state.tab) return;
  const list = await send({ type: 'GET_FINGERPRINTS_V2', to: 'background', tabId: state.tab.id });
  state.fingerprints = Array.isArray(list) ? list : [];
}

async function fetchAnti() {
  const url = (state.tab && state.tab.url) || '';
  const data = await send({ type: 'ANTI_STATE', to: 'anti', url });
  state.anti = data || null;
}

async function fetchAdb() {
  if (!state.tab) return;
  const tabId = state.tab.id;
  const [catalog, adbState] = await Promise.all([
    state.adb.catalog ? Promise.resolve({ scripts: state.adb.catalog }) : adbCommand('scripts.list', {}),
    adbCommand('state.get', { tabId })
  ]);
  if (catalog && catalog.scripts) state.adb.catalog = catalog.scripts.filter(s => !s.hidden);
  if (adbState) {
    state.adb.state = adbState;
    state.adb.error = adbState.registrationError ? adbState.registrationError.message : null;
  } else {
    state.adb.error = state.adb.error || null;
  }
}

export async function adbCommand(method, params = {}) {
  const reply = await send({ type: 'ADB_COMMAND', method, params });
  if (!reply) return null;
  if (!reply.ok) {
    const error = new Error((reply.error && reply.error.message) || '指令执行失败');
    error.code = reply.error && reply.error.code;
    error.details = reply.error && reply.error.details;
    throw error;
  }
  return reply.result;
}

export async function refresh(options = {}) {
  const opts = Object.assign({ scan: true, fingerprints: true, anti: true, adb: true, force: false }, options);
  if (!state.enabled) {
    renderStatus();
    renderGuard();
    return;
  }  if (state.busy) return;
  state.busy = true;
  try {
    await loadTab();
    if (!state.tab || !canInspect(state.tab.url)) {
      state.contentReady = false;
      renderActive();
      renderStatus();
      renderGuard();
      return;
    }
    const jobs = [];
    if (opts.scan) jobs.push(fetchScan());
    if (opts.fingerprints) jobs.push(fetchFingerprints());
    if (opts.anti) jobs.push(fetchAnti());
    if (opts.adb) jobs.push(fetchAdb());
    await Promise.all(jobs.map(job => job.catch(() => {})));
  } finally {
    state.busy = false;
  }

  const signature = JSON.stringify([
    countFindings(state.results),
    state.progress,
    state.fingerprints.length,
    hostOf(state.tab && state.tab.url),
    state.anti ? [state.anti.blocks, (state.anti.findings || []).length, state.anti.isEnabled,
      state.anti.fingerprintEnabled, state.anti.webrtcEnabled, state.anti.uaRotationEnabled,
      state.anti.autoCleanPrevDomain, state.anti.notifyOnBlock, state.anti.ua && state.anti.ua.ua] : null,
    state.adb.state ? [state.adb.state.enabledScripts, state.adb.state.appliedScripts,
      state.adb.state.mode, state.adb.state.requiresReload, state.adb.error] : null,
    state.view
  ]);
  const changed = signature !== state.signature;
  state.signature = signature;
  const quiet = opts.silentRender && Date.now() - lastInteraction < 1400;
  if ((changed || opts.force) && !quiet && !isEditingActiveView()) renderActive();
  renderStatus();
  renderGuard();
}

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV.map(item => `
    <button class="nav-item ${item.id === state.view ? 'active' : ''}" data-nav="${item.id}" role="tab">
      ${item.icon}<span>${t(item.label)}</span>
      <span class="badge" data-badge="${item.id}"></span>
    </button>`).join('');
  nav.onclick = event => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    switchView(button.dataset.nav);
  };
}

export function switchView(view) {
  state.view = view;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.nav === view));
  $$('.view').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  const about = $('#btnAbout');
  if (about) about.classList.toggle('on', view === 'about');
  chrome.storage.local.set({ 'ui.activeView': view });
  renderActive();
  renderStatus();
}

function renderActive() {
  const root = $(`.view[data-view="${state.view}"]`);
  if (!root) return;
  const renderer = RENDERERS[state.view];
  const scrolled = root.scrollTop;
  const scroller = root.scrollHeight > root.clientHeight;
  try {
    renderer(root, { state, switchView, refresh, adbCommand });
  } catch (error) {
    root.innerHTML = `<div class="notice danger">界面渲染失败：${escapeHtml(error.message)}</div>`;
    console.error(error);
  }
  if (scroller && scrolled > 0) root.scrollTop = scrolled;
  updateBadges();
}

function isEditingActiveView() {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  const view = $(`.view[data-view="${state.view}"]`);
  if (!view || !view.contains(active)) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
}

function updateBadges() {
  const infoBadge = $('[data-badge="info"]');
  if (infoBadge) {
    const total = countFindings(state.results);
    infoBadge.textContent = total > 99 ? '99+' : String(total);
    infoBadge.classList.toggle('show', total > 0);
  }
  const antiBadge = $('[data-badge="anti"]');
  if (antiBadge) {
    const count = state.anti ? state.anti.blocks || 0 : 0;
    antiBadge.textContent = count > 99 ? '99+' : String(count);
    antiBadge.classList.toggle('show', count > 0);
  }
  const hookBadge = $('[data-badge="hooks"]');
  if (hookBadge) {
    const count = state.adb.state ? (state.adb.state.enabledScripts || []).length : 0;
    hookBadge.textContent = String(count);
    hookBadge.classList.toggle('show', count > 0);
  }
}

function renderStatus() {
  const pct = $('#statusPct');
  const bar = $('#progressBar');
  const text = $('#statusText');
  if (!state.enabled) {
    text.textContent = 'MAPUS 已停用';
    pct.textContent = '—';
    bar.style.width = '0%';
    return;
  }
  if (!state.tab) {
    text.textContent = '没有可检测的标签页';
    pct.textContent = '—';
    bar.style.width = '0%';
    return;
  }
  if (!canInspect(state.tab.url)) {
    text.textContent = '当前页面不支持检测（内部页面）';
    pct.textContent = '—';
    bar.style.width = '0%';
    return;
  }
  if (!state.contentReady) {
    text.textContent = '内容脚本未就绪，刷新页面后重试';
    pct.textContent = '—';
    bar.style.width = '0%';
    return;
  }
  pct.textContent = state.progress + '%';
  bar.style.width = state.progress + '%';
  const total = countFindings(state.results);
  if (state.scanning) text.textContent = `扫描中 · 已发现 ${total} 项`;
  else text.textContent = total ? `扫描完成 · ${total} 项敏感数据` : '扫描完成 · 未发现敏感数据';
}

function renderGuard() {
  const chip = $('#guardChip');
  const label = $('#guardText');
  if (!chip || !label) return;
  const on = state.enabled;
  const antiOn = state.anti ? state.anti.isEnabled !== false : false;
  chip.dataset.state = on ? 'on' : 'off';
  chip.setAttribute('aria-checked', on ? 'true' : 'false');
  label.textContent = on ? '运行中' : '已停用';
  chip.title = on
    ? `全部功能运行中${antiOn ? ' · 隐私防护已开启' : ' · 隐私防护当前关闭'}，点击可一键停用`
    : 'MAPUS 已停用，点击可重新启用';
}

function applyEnabledUI() {
  const on = state.enabled;
  const app = document.querySelector('.app');
  if (app) app.dataset.enabled = on ? '1' : '0';
  const veil = $('#offVeil');
  if (veil) veil.hidden = on;
  renderGuard();
}

export async function setMaster(on) {
  const next = on !== false;
  if (next === state.enabled) {
    applyEnabledUI();
    return;
  }
  state.enabled = next;
  applyEnabledUI();
  try {
    await chrome.storage.local.set({ mapus_enabled: next });
  } catch (error) {
    toast('切换失败：' + error.message, 'error');
  }
  if (next) {
    toast('MAPUS 已重新启用', 'ok');
    await refresh({ force: true });
  } else {
    toast('已停用全部功能');
    renderStatus();
  }
}

async function runScan() {
  if (!state.enabled) return;
  if (!state.tab || !canInspect(state.tab.url)) return;
  const button = $('#btnScan');
  button.disabled = true;
  button.textContent = '扫描中';
  state.scanning = true;
  $('#statusText').textContent = '正在重新扫描…';
  const response = await sendTab(state.tab.id, { type: 'RUN_SCAN', tabId: state.tab.id });
  if (response && response.__error) {
    toast('无法连接页面，请刷新后重试', 'error');
  } else {
    toast('已开始扫描');
  }
  setTimeout(async () => {
    button.disabled = false;
    button.textContent = '扫描';
    await refresh({ scan: true, fingerprints: false, anti: false, adb: false });
  }, 1200);
}

async function exportReport() {
  if (!state.enabled) return;
  const tab = state.tab;
  if (!tab) return;
  const report = {
    generator: 'MAPUS',
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    page: { url: tab.url, title: tab.title, host: hostOf(tab.url) },
    scan: state.results || null,
    fingerprints: state.fingerprints,
    securityFindings: securityFindings(),
    antiHoneypot: state.anti ? {
      enabled: state.anti.isEnabled !== false,
      blocks: state.anti.blocks || 0,
      recent: state.anti.recent || [],
      findings: state.anti.findings || [],
      userAgent: (state.anti.ua && state.anti.ua.ua) || ''
    } : null,
    hook: state.adb.state ? {
      mode: state.adb.state.mode,
      enabledScripts: state.adb.state.enabledScripts || [],
      appliedScripts: state.adb.state.appliedScripts || []
    } : null
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const host = (hostOf(tab.url) || 'page').replace(/[^\w.-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const anchor = el('a', { href: url, download: `mapus-${host}-${stamp}.json` });
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('报告已导出', 'ok');
}

async function runPageTool(tool) {
  if (!state.enabled) {
    toast('MAPUS 已停用', 'error');
    return;
  }
  if (!state.tab || !canInspect(state.tab.url)) {
    toast('当前页面不可执行', 'error');
    return;
  }
  const reply = await send({ type: 'MAPUS_RULES_RUNTIME' });
  if (!reply || !reply.ok || !reply.rules) {
    toast('规则配置读取失败，请重试', 'error');
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      func: self.MAPUS_PAGEFN.applyConfig,
      args: [reply.rules]
    });
    await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      files: ['content/modules/toolkit.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      world: 'MAIN',
      files: [`content/modules/${tool}.js`]
    });
    toast('工具已注入页面右下角', 'ok');
  } catch (error) {
    toast('注入失败：' + error.message, 'error');
  }
}

const THEME_MODES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '跟随系统', light: '亮色', dark: '暗色' };

export async function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  const auto = $('#iconThemeAuto');
  const light = $('#iconThemeLight');
  const dark = $('#iconThemeDark');
  if (auto && light && dark) {
    auto.hidden = mode !== 'auto';
    light.hidden = mode !== 'light';
    dark.hidden = mode !== 'dark';
  }
  const button = $('#btnTheme');
  if (button) button.title = `主题：${THEME_LABEL[mode] || '跟随系统'}（点击切换）`;
}

async function cycleTheme() {
  const stored = await chrome.storage.local.get(['mapus_theme']);
  const current = THEME_MODES.includes(stored && stored['mapus_theme']) ? stored['mapus_theme'] : 'auto';
  const next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
  await chrome.storage.local.set({ mapus_theme: next });
  applyTheme(next);
  toast(`主题已切换：${THEME_LABEL[next]}`, 'ok');
}


const LANG_KEY = 'adb_language';

async function initI18n() {
  const api = globalThis.ADB_I18N;
  if (!api) return;
  try {
    await api.init(chrome);
  } catch (_) {
  }
  applyStaticI18n();
  syncLangButton();
  document.documentElement.lang = isEnglish() ? 'en' : 'zh-CN';
  globalThis.MAPUS_I18N_DOM?.start();
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach(node => {
    node.textContent = t(node.textContent);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(node => {
    node.title = t(node.dataset.i18nTitle);
  });
}

function syncLangButton() {
  const label = $('#langText');
  const button = $('#btnLang');
  if (!label || !button) return;
  const en = isEnglish();
  label.textContent = en ? 'EN' : '中';
  button.title = t(en ? '切到中文' : '切到英文');
}

async function toggleLanguage() {
  try {
    await chrome.storage.local.set({ [LANG_KEY]: isEnglish() ? 'zh_CN' : 'en' });
  } catch (_) {}
  location.reload();
}

async function init() {
  await initI18n();
  renderNav();
  const stored = await chrome.storage.local.get(['ui.activeView', 'mapus_enabled', 'mapus_theme']);
  applyTheme(THEME_MODES.includes(stored && stored['mapus_theme']) ? stored['mapus_theme'] : 'auto');
  state.enabled = !stored || stored['mapus_enabled'] !== false;
  const saved = stored ? stored['ui.activeView'] : null;
  const hash = (location.hash || '').replace(/^#/, '');
  state.view = RENDERERS[hash] ? hash : (RENDERERS[saved] ? saved : 'overview');
  $$('.view').forEach(node => node.classList.toggle('active', node.dataset.view === state.view));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.nav === state.view));
  $('#btnAbout').classList.toggle('on', state.view === 'about');
  applyEnabledUI();

  document.addEventListener('pointerdown', () => { lastInteraction = Date.now(); }, true);
  document.addEventListener('keydown', () => { lastInteraction = Date.now(); }, true);

  $('#btnScan').addEventListener('click', runScan);
  $('#btnExport').addEventListener('click', exportReport);
  $('#btnTheme').addEventListener('click', cycleTheme);
  $('#btnLang').addEventListener('click', toggleLanguage);
  $('#btnSettings').addEventListener('click', () => openDashboard('settings'));
  $('#btnDashboard').addEventListener('click', () => openDashboard());
  $('#btnAbout').addEventListener('click', () => switchView('about'));
  $('#guardChip').addEventListener('click', () => setMaster(!state.enabled));
  $('#btnEnable').addEventListener('click', () => setMaster(true));
  $('#btnReloadOff').addEventListener('click', () => {
    if (state.tab) chrome.tabs.reload(state.tab.id);
    toast('页面已刷新');
  });
  $('#btnReload').addEventListener('click', () => {
    if (!state.tab) return;
    chrome.tabs.reload(state.tab.id);
    toast('页面已刷新，正在重新扫描');
  });

  await refresh();
  exposeHelpers();

  chrome.tabs.onActivated.addListener(() => { state.adb = { ...state.adb, routes: null, library: null }; refresh(); });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (state.tab && tabId === state.tab.id && (changeInfo.status === 'complete' || changeInfo.url)) {
      state.progress = 0;
      setTimeout(() => refresh(), 400);
    }
  });

  chrome.runtime.onMessage.addListener(message => {
    if (!message) return;
    if (message.type === 'MAPUS_MASTER_STATE') {
      const on = message.enabled !== false;
      if (on !== state.enabled) {
        state.enabled = on;
        applyEnabledUI();
        if (on) refresh({ force: true });
        else renderStatus();
      }
      return;
    }
    if (message.type === 'SCAN_UPDATE' && state.tab && message.tabId === state.tab.id && message.results) {
      state.results = message.results;
      state.contentReady = true;
      const progress = message.results.progress;
      if (Array.isArray(progress) && progress[0]) {
        const value = Number(Array.isArray(progress[0]) ? progress[0][1] : progress[0]);
        if (Number.isFinite(value)) state.progress = Math.max(0, Math.min(100, Math.round(value)));
      }
      state.scanning = state.progress < 100;
      if (state.view === 'overview' || state.view === 'info') renderActive();
      renderStatus();
      updateBadges();
    }
    if (message.type === 'ADB_EVENT' && (message.event === 'config.changed' || message.event === 'config.applied')) {
      if (state.view === 'hooks') refresh({ scan: false, fingerprints: false, anti: false, adb: true });
    }
  });

  setInterval(async () => {
    if (document.hidden) return;
    if (!state.enabled) return;
    if (!state.tab) return;
    if (state.view === 'about') return;
    await refresh({ adb: state.view === 'hooks', fingerprints: false, silentRender: true });
  }, 5000);
}

function exposeHelpers() {
  window.__mapus = { state, refresh, adbCommand, runPageTool, switchView, copyText, toast, setMaster };
  window.dispatchEvent(new CustomEvent('mapus:ready'));
  window.mapusTool = runPageTool;
}

document.addEventListener('DOMContentLoaded', init);
