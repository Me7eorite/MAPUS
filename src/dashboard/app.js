import { $, $$, t, initI18n, toggleLanguage } from './lib.js';
import { state, stats, refreshAll, refreshTasks, refreshFindings, refreshProfiles, refreshAgent, refreshSettings, onChange, setGate } from './store.js';
import { renderOverview } from './views/overview.js';
import { renderTasks, renderTaskList, appendLog } from './views/tasks.js';
import { renderFindings, renderList } from './views/findings.js';
import { renderModels } from './views/models.js';
import { renderSettings } from './views/settings.js';
import { renderSites, siteLogLine } from './views/sites.js';
import { refreshModelOptions } from './views/launch.js';

export const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'sites', label: '站点' },
  { id: 'tasks', label: '任务' },
  { id: 'findings', label: '风险' },
  { id: 'models', label: '模型' },
  { id: 'settings', label: '设置' }
];

const RENDERERS = {
  overview: renderOverview,
  sites: renderSites,
  tasks: renderTasks,
  findings: renderFindings,
  models: renderModels,
  settings: renderSettings
};

const PRELOAD = {
  overview: async () => { await refreshAll(); },
  sites: async () => { await Promise.all([refreshTasks(), refreshFindings()]); },
  tasks: async () => { await Promise.all([refreshTasks(), refreshProfiles(), refreshAgent()]); },
  findings: async () => { await refreshFindings(); },
  models: async () => { await Promise.all([refreshAgent(), refreshProfiles()]); },
  settings: async () => { await Promise.all([refreshAgent(), refreshSettings()]); }
};

export async function switchTab(id) {
  if (!RENDERERS[id]) return;
  const mask = document.querySelector('.mask:not(.hidden)');
  if (mask) mask.classList.add('hidden');
  state.tab = id;
  $$('.tab').forEach(node => node.classList.toggle('active', node.dataset.tab === id));
  $$('.panel').forEach(node => node.classList.toggle('active', node.dataset.panel === id));
  try {
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  } catch (_) {   }
  try {
    chrome.storage.local.set({ 'ui.dashboardTab': id });
  } catch (_) {   }
  renderActive();
  const preload = PRELOAD[id];
  if (preload) {
    try {
      await preload();
    } catch (_) {   }
    if (state.tab === id) renderActive();
  }
}

export function renderActive() {
  const root = $(`.panel[data-panel="${state.tab}"]`);
  if (!root) return;
  const renderer = RENDERERS[state.tab];
  try {
    renderer(root);
  } catch (error) {
    root.innerHTML = `<div class="notice danger">界面渲染失败：${String(error && error.message)}</div>`;
  }
  renderStats();
}

export function renderStats() {
  const info = stats();
  const set = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };
  set('statSites', `站点 ${info.sites}`);
  set('statFindings', `风险 ${info.findings}`);
  set('statRunning', `执行中 ${info.running}`);
  const chip = document.getElementById('gateChip');
  if (chip) {
    chip.textContent = state.gate ? '运行中' : '已停用';
    chip.dataset.state = state.gate ? 'on' : 'off';
  }
}

const THEME_MODES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '跟随系统', light: '亮色', dark: '暗色' };

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  const auto = document.getElementById('iconThemeAuto');
  const light = document.getElementById('iconThemeLight');
  const dark = document.getElementById('iconThemeDark');
  if (auto && light && dark) {
    auto.hidden = mode !== 'auto';
    light.hidden = mode !== 'light';
    dark.hidden = mode !== 'dark';
  }
  const button = document.getElementById('btnTheme');
  if (button) button.title = `主题：${THEME_LABEL[mode] || '跟随系统'}（点击切换）`;
}

async function cycleTheme() {
  const stored = await new Promise(resolve => {
    try {
      chrome.storage.local.get(['mapus_theme'], data => resolve((data && data['mapus_theme']) || 'auto'));
    } catch (_) {
      resolve('auto');
    }
  });
  const current = THEME_MODES.includes(stored) ? stored : 'auto';
  const next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
  try {
    await new Promise(resolve => chrome.storage.local.set({ mapus_theme: next }, resolve));
  } catch (_) {   }
  applyTheme(next);
}

export async function mountApp() {
  await initI18n();
  document.title = t('MAPUS 控制面板');
  const langButton = document.getElementById('btnLang');
  if (langButton) langButton.addEventListener('click', toggleLanguage);

  const storedTheme = await new Promise(resolve => {
    try {
      chrome.storage.local.get(['mapus_theme'], data => resolve((data && data['mapus_theme']) || 'auto'));
    } catch (_) {
      resolve('auto');
    }
  });
  applyTheme(THEME_MODES.includes(storedTheme) ? storedTheme : 'auto');
  document.getElementById('btnTheme').addEventListener('click', cycleTheme);

  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(tab => `<button class="tab${tab.id === state.tab ? ' active' : ''}" data-tab="${tab.id}" role="tab">${t(tab.label)}</button>`).join('');
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (button) switchTab(button.dataset.tab);
  });

  const stored = await new Promise(resolve => {
    try {
      chrome.storage.local.get(['ui.dashboardTab'], data => resolve((data && data['ui.dashboardTab']) || 'overview'));
    } catch (_) {
      resolve('overview');
    }
  });
  const hash = (location.hash || '').replace(/^#/, '');
  state.tab = RENDERERS[hash] ? hash : (RENDERERS[stored] ? stored : 'overview');

  const ping = await new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'MAPUS_MASTER_PING' }, res => resolve(res || {}));
    } catch (_) {
      resolve({});
    }
  });
  setGate(ping.enabled !== false);

  await refreshAll();
  $$('.tab').forEach(node => node.classList.toggle('active', node.dataset.tab === state.tab));
  $$('.panel').forEach(node => node.classList.toggle('active', node.dataset.panel === state.tab));
  renderActive();

  window.addEventListener('hashchange', () => {
    const next = (location.hash || '').replace(/^#/, '');
    if (RENDERERS[next] && next !== state.tab) switchTab(next);
  });

  onChange(reason => {
    if (reason === 'log') {
      const last = state.tasks.find(task => task.status === 'running');
      if (!last) return;
      const list = state.taskLogs.get(last.id) || [];
      const line = list[list.length - 1];
      if (!line) return;
      appendLog(document.getElementById('taskList'), last.id, line);
      if (state.tab === 'sites') siteLogLine(last.id, line);
      return;
    }
    if (reason === 'task') {
      const box = document.getElementById('taskList');
      if (box) renderTaskList(box);
      if (state.tab === 'overview' || state.tab === 'sites') renderActive();
      renderStats();
      return;
    }
    if (reason === 'finding') {
      const box = document.getElementById('findingList');
      if (box) renderList(box);
      if (state.tab === 'overview') renderActive();
      renderStats();
      return;
    }
    if (reason === 'gate') {
      renderStats();
      return;
    }
    if (reason === 'launch') return;
    if (state.tab === 'settings') { renderStats(); return; }
    renderActive();
  });

  setInterval(async () => {
    if (document.hidden) return;
    await refreshTasks();
    const box = document.getElementById('taskList');
    if (box && state.tab === 'tasks') renderTaskList(box);
    renderStats();
  }, 4000);

  document.getElementById('btnOpenPanel').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') }).catch(() => { });
  });
  document.getElementById('btnRefreshAll').addEventListener('click', async () => {
    await refreshAll();
    renderActive();
  });
  document.getElementById('gateChip').addEventListener('click', async () => {
    const next = !state.gate;
    await new Promise(resolve => chrome.storage.local.set({ mapus_enabled: next }, resolve));
    setGate(next);
  });

  await refreshModelOptions(document);
}
