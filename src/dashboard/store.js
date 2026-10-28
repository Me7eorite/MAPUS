import { harness, findings, agent, readStore } from './lib.js';

export const state = {
  tasks: [],
  profiles: [],
  activeId: '',
  findings: [],
  summary: null,
  agentConfig: null,
  settings: {},
  taskLogs: new Map(),
  gate: true,
  tab: 'overview',
  filterHost: '',
  filterSev: '',
  siteFocus: '',
  siteQuery: '',
  openTaskIds: [],
  launch: { profileId: '', useSettingsModel: false, steps: 90 }
};

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitChange(reason) {
  for (const fn of listeners) {
    try { fn(reason); } catch (_) {   }
  }
}

export function pushLog(taskId, line) {
  const list = state.taskLogs.get(taskId) || [];
  list.push(line);
  if (list.length > 300) list.splice(0, list.length - 300);
  state.taskLogs.set(taskId, list);
}

function mergeLogs() {
  for (const task of state.tasks) {
    if (!state.taskLogs.has(task.id) && Array.isArray(task.logs)) {
      state.taskLogs.set(task.id, task.logs.slice(-300));
    }
  }
}

export async function refreshTasks() {
  const res = await harness('HARNESS_LIST');
  if (res && res.ok) {
    state.tasks = res.tasks || [];
    mergeLogs();
  }
}

export async function refreshProfiles() {
  const res = await harness('PROFILE_LIST');
  if (res && res.ok) {
    state.profiles = res.profiles || [];
    state.activeId = res.activeId || '';
  }
}

export async function refreshFindings() {
  const res = await findings('FINDINGS_LIST', {});
  if (res && res.ok) {
    state.findings = res.findings || [];
    state.summary = res.summary || null;
  }
}

export async function refreshAgent() {
  const res = await agent('AGENT_CONFIG_GET');
  if (res && res.ok) state.agentConfig = res.config;
}

export async function refreshSettings() {
  const data = await readStore([
    'masterSwitch', 'dynamicScan', 'deepScan', 'customWhitelist', 'adb_language', 'adb_mcp', 'mapus_enabled'
  ]);
  state.settings = {
    masterSwitch: data.masterSwitch !== false,
    dynamicScan: data.dynamicScan === true,
    deepScan: data.deepScan === true,
    customWhitelist: Array.isArray(data.customWhitelist) ? data.customWhitelist : [],
    adb_language: data.adb_language || 'auto',
    adb_mcp: data.adb_mcp || null,
    mapus_enabled: data.mapus_enabled !== false
  };
  state.gate = state.settings.mapus_enabled;
}

export async function refreshAll() {
  await Promise.all([refreshProfiles(), refreshTasks(), refreshFindings(), refreshAgent(), refreshSettings()]);
  emitChange('all');
}

export function filteredFindings() {
  return state.findings.filter(item => {
    if (state.filterHost && item.host !== state.filterHost) return false;
    if (state.filterSev && item.severity !== state.filterSev) return false;
    return true;
  });
}

export function stats() {
  const summary = state.summary || { total: 0, levels: {}, sites: [] };
  return {
    sites: (summary.sites || []).length,
    findings: summary.total || state.findings.length,
    running: state.tasks.filter(task => task.status === 'running').length,
    tasks: state.tasks.length,
    profiles: state.profiles.length,
    levels: summary.levels || {}
  };
}

export function setGate(on) {
  state.gate = on !== false;
  state.settings.mapus_enabled = state.gate;
  emitChange('gate');
}

chrome.runtime.onMessage.addListener(message => {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'MAPUS_HARNESS_EVENT') {
    if (message.kind === 'log') {
      pushLog(message.taskId, { text: message.text, level: message.level });
      emitChange('log');
      return;
    }
    if (message.kind === 'finding') {
      refreshFindings().then(() => emitChange('finding'));
      return;
    }
    refreshTasks().then(() => emitChange('task'));
    return;
  }
  if (message.type === 'MAPUS_FINDINGS_CHANGED') {
    refreshFindings().then(() => emitChange('finding'));
    return;
  }
  if (message.type === 'MAPUS_MASTER_STATE') {
    setGate(message.enabled !== false);
  }
});
