(function () {
  'use strict';
  if (self.MAPUS_HARNESS) return;
  const TASK_KEY = 'mapus_harness_tasks';
  const PROFILE_KEY = 'mapus_model_profiles';
  const ACTIVE_KEY = 'mapus_profiles_active';
  const MAX_TASKS = 60;
  const LOG_LIMIT = 400;

  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clip = (value, limit) => {
    const text = String(value === undefined || value === null ? '' : value);
    return text.length > limit ? text.slice(0, limit) + `…[共 ${text.length} 字符]` : text;
  };
  let running = null;
  let stopping = false;

  async function loadTasks() {
    const box = await chrome.storage.local.get(TASK_KEY);
    const list = box[TASK_KEY];
    return Array.isArray(list) ? list : [];
  }
  async function saveTasks(list) {
    await chrome.storage.local.set({ [TASK_KEY]: list.slice(-MAX_TASKS) });
  }
  async function patchTask(id, patch) {
    const list = await loadTasks();
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return null;
    const logs = memLogs.get(id);
    list[index] = { ...list[index], ...patch, ...(logs ? { logs: logs.slice(-LOG_LIMIT) } : {}) };
    await saveTasks(list);
    emit({ taskId: id, kind: 'task', status: list[index].status, phase: list[index].phase, step: list[index].step, steps: list[index].steps });
    return list[index];
  }
  function emit(event) {
    chrome.runtime.sendMessage({ type: 'MAPUS_HARNESS_EVENT', ...event }).catch(() => { });
  }
  const memLogs = new Map();
  const saveTimers = new Map();
  async function flushTaskLogs(taskId) {
    const list = await loadTasks();
    const task = list.find(item => item.id === taskId);
    if (!task) return;
    const logs = memLogs.get(taskId);
    if (logs) task.logs = logs.slice(-LOG_LIMIT);
    await saveTasks(list);
  }
  async function pushLog(taskId, text, level) {
    emit({ taskId, kind: 'log', text: clip(text, 500), level: level || 'info', at: Date.now() });
    const entry = { text: clip(text, 500), level: level || 'info', at: Date.now() };
    if (!memLogs.has(taskId)) memLogs.set(taskId, []);
    const logs = memLogs.get(taskId);
    logs.push(entry);
    if (logs.length > LOG_LIMIT) logs.splice(0, logs.length - LOG_LIMIT);
    if (saveTimers.has(taskId)) clearTimeout(saveTimers.get(taskId));
    saveTimers.set(taskId, setTimeout(() => { saveTimers.delete(taskId); flushTaskLogs(taskId).catch(() => { }); }, 400));
  }


  async function loadProfiles() {
    const box = await chrome.storage.local.get(PROFILE_KEY);
    const list = box[PROFILE_KEY];
    return Array.isArray(list) ? list : [];
  }
  async function saveProfiles(list) {
    await chrome.storage.local.set({ [PROFILE_KEY]: list });
  }
  async function activeProfileId() {
    const box = await chrome.storage.local.get(ACTIVE_KEY);
    return box[ACTIVE_KEY] || '';
  }
  async function getProfile(id) {
    const list = await loadProfiles();
    if (id) return list.find(item => item.id === id) || null;
    const active = await activeProfileId();
    return list.find(item => item.id === active) || list[0] || null;
  }
  async function getProfileById(id) {
    const list = await loadProfiles();
    return list.find(item => item.id === id) || null;
  }
  function normalizeProfile(input, existing) {
    const base = existing || { id: uid('mp') };
    return {
      id: base.id,
      name: clip(input && input.name, 60) || base.name || '未命名模型',
      baseUrl: clip(input && input.baseUrl, 300).trim().replace(/\/+$/, '') || base.baseUrl || '',
      model: clip(input && input.model, 120).trim() || base.model || '',
      apiKey: input && typeof input.apiKey === 'string' ? (/^••••/.test(input.apiKey) || input.apiKey === '' ? (base.apiKey || '') : input.apiKey) : (base.apiKey || ''),
      temperature: Math.max(0, Math.min(2, Number(input && input.temperature) || 0)),
      maxTokens: Math.max(256, Math.min(32000, Number(input && input.maxTokens) || 4096))
    };
  }


  function hostOf(url) {
    try { return new URL(String(url)).host || ''; } catch (_) { return ''; }
  }
  async function enqueue(urls, options) {
    const created = [];
    const list = await loadTasks();
    for (const raw of Array.isArray(urls) ? urls : [urls]) {
      const url = String(raw || '').trim();
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const host = hostOf(url);
      if (!host) continue;
      const task = {
        id: uid('tk'),
        url,
        host,
        profileId: (options && options.profileId) || '',
        modelMode: (options && options.modelMode === 'settings') ? 'settings' : 'profile',
        steps: Math.max(1, Math.min(200, Number(options && options.steps) || 60)),
        concurrency: 'queue',
        status: 'queued',
        phase: '排队中',
        step: 0,
        findings: [],
        error: '',
        createdAt: Date.now(),
        startedAt: 0,
        endedAt: 0
      };
      list.push(task);
      created.push(task);
    }
    await saveTasks(list);
    for (const task of created) emit({ taskId: task.id, kind: 'task', status: task.status });
    if (created.length && !running) kick();
    return { ok: true, created: created.length, tasks: created.map(task => ({ id: task.id, url: task.url })) };
  }

  async function control(id, action) {
    const list = await loadTasks();
    const task = list.find(item => item.id === id);
    if (!task) return { error: '任务不存在' };
    if (action === 'stop') {
      if (task.status === 'running') {
        stopping = true;
        task.status = 'stopping';
        await saveTasks(list);
        if (running && running.taskId === id && running.aborter) {
          try { running.aborter.abort(); } catch (_) {  }
        }
      } else if (task.status === 'queued') {
        task.status = 'stopped';
        task.phase = '已取消';
        await saveTasks(list);
        emit({ taskId: id, kind: 'task', status: task.status });
      }
      return { ok: true };
    }
    if (action === 'retry') {
      if (running) return { error: '有任务正在执行' };
      task.status = 'queued';
      task.phase = '排队中';
      task.step = 0;
      task.error = '';
      task.endedAt = 0;
      await saveTasks(list);
      emit({ taskId: id, kind: 'task', status: task.status });
      kick();
      return { ok: true };
    }
    return { error: '未知操作' };
  }

  async function clearDone() {
    const list = await loadTasks();
    const next = list.filter(item => !['done', 'error', 'stopped'].includes(item.status));
    await saveTasks(next);
    return { ok: true };
  }

  function shouldStop() {
    return stopping || !self.MAPUS_GATE.isEnabled();
  }

  async function kick() {
    if (running) return;
    const list = await loadTasks();
    const next = list.find(item => item.status === 'queued');
    if (!next) return;
    await runTask(next.id);
  }

  async function runTask(taskId) {
    const list = await loadTasks();
    const task = list.find(item => item.id === taskId);
    if (!task) return;
    if (shouldStop()) {
      await patchTask(taskId, { status: 'stopped', phase: '已停止' });
      running = null;
      stopping = false;
      return;
    }
    const useSettings = task.modelMode === 'settings';
    const profile = useSettings ? null : await getProfile(task.profileId);
    if (!useSettings && (!profile || !profile.baseUrl || !profile.model)) {
      await patchTask(taskId, { status: 'error', phase: '缺模型配置', error: '没有可用的模型档案，请在「模型」页添加，或选择「跟随设置里的模型」' });
      running = null;
      return;
    }
    const modelLabel = useSettings ? '设置里的智能体模型' : profile.model;
    running = { taskId, aborter: new AbortController() };
    await patchTask(taskId, {
      status: 'running', phase: '打开目标', step: 0, startedAt: Date.now(), error: '',
      profileName: useSettings ? '设置模型' : profile.name
    });
    pushLog(taskId, `开始扫描 ${task.url}（模型 ${modelLabel}，预算 ${task.steps} 步）`);

    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url: task.url, active: false });
      tabId = tab.id;
      await waitForComplete(tabId, 20000);
      await patchTask(taskId, { phase: '侦察与测试' });
      pushLog(taskId, `页面已打开（tab ${tabId}），进入 ReAct 循环`);

      const result = await self.MAPUS_AGENT.converse({
        tabId,
        steps: task.steps,
        profile: useSettings ? null : profile,
        signal: running.aborter.signal,
        taskContext: { taskId, url: task.url, host: task.host },
        emit: event => onAgentEvent(taskId, event)
      });

      const findings = await self.MAPUS_FINDINGS.listBySite(task.host);
      const mine = findings.filter(item => (item.taskId || '') === taskId);
      const summaryLine = `完成：消耗 ${result.usage && result.usage.total_tokens ? result.usage.total_tokens + ' tokens，' : ''}${(result.steps || []).length} 步，产出 ${mine.length} 条记录`;
      pushLog(taskId, summaryLine, 'ok');
      await patchTask(taskId, {
        status: 'done',
        phase: '完成',
        endedAt: Date.now(),
        findings: mine.map(item => item.id)
      });
      emit({ taskId, kind: 'done', findings: mine.length });
    } catch (error) {
      const aborted = error && (error.name === 'AbortError' || /abort/i.test(error.message || ''));
      pushLog(taskId, aborted ? '任务被停止' : `出错：${error.message || error}`, aborted ? 'warn' : 'bad');
      await patchTask(taskId, {
        status: aborted ? 'stopped' : 'error',
        phase: aborted ? '已停止' : '出错',
        error: aborted ? '' : clip(error.message || String(error), 300),
        endedAt: Date.now()
      });
    } finally {
      if (tabId !== null) {
        try { await chrome.tabs.remove(tabId); } catch (_) {  }
      }
      running = null;
      stopping = false;
    }
    kick();
  }

  function waitForComplete(tabId, timeout) {
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === 'complete' || Date.now() - started > timeout) {
            clearInterval(timer);
            resolve();
          }
        } catch (_) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  }

  let reasoningBuffer = '';
  let reasoningStep = 0;
  function flushReasoning(taskId) {
    const text = reasoningBuffer.trim();
    if (text) pushLog(taskId, `思考：${text}`, 'think');
    reasoningBuffer = '';
  }
  function onAgentEvent(taskId, event) {
    if (event.type === 'step') {
      flushReasoning(taskId);
      patchTask(taskId, { step: event.used + 1, phase: `第 ${event.used + 1} 步` });
      pushLog(taskId, `—— 第 ${event.used + 1} / ${event.total} 步 ——`);
    } else if (event.type === 'reasoning') {
      reasoningBuffer += event.text || '';
      reasoningStep = event.step || reasoningStep;
      if (reasoningBuffer.length > 600) flushReasoning(taskId);
    } else if (event.type === 'delta') {
      const text = (event.text || '').trim();
      if (text && text.length < 200 && /^[-*\d]|结论|发现|注入|漏洞|风险/i.test(text)) {
        flushReasoning(taskId);
        pushLog(taskId, text, 'agent');
      }
    } else if (event.type === 'tool') {
      flushReasoning(taskId);
      const args = JSON.stringify(event.args || {});
      pushLog(taskId, `调用 ${event.name} ${args.length > 120 ? args.slice(0, 120) + '…' : args}`, 'tool');
    } else if (event.type === 'tool_result') {
      pushLog(taskId, `${event.name} ${event.ok === false ? '失败' : '完成'}：${clip(event.preview || '', 160)}`, event.ok === false ? 'bad' : 'dim');
    } else if (event.type === 'finding') {
      flushReasoning(taskId);
      pushLog(taskId, `发现风险：${event.title}（${event.severity}）`, 'finding');
      emit({ taskId, kind: 'finding', findingId: event.findingId, title: event.title, severity: event.severity });
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.to !== 'harness') return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    (async () => {
      try {
        switch (message.type) {
          case 'HARNESS_ENQUEUE': sendResponse(await enqueue(message.urls, message.options || {})); return;
          case 'HARNESS_LIST': sendResponse({ ok: true, tasks: await loadTasks(), running: !!(running && running.taskId) }); return;
          case 'HARNESS_GET': {
            const list = await loadTasks();
            const task = list.find(item => item.id === message.id);
            sendResponse(task ? { ok: true, task } : { ok: false, error: '任务不存在' });
            return;
          }
          case 'HARNESS_CONTROL': sendResponse(await control(message.id, message.action)); return;
          case 'HARNESS_CLEAR_DONE': sendResponse(await clearDone()); return;
          case 'PROFILE_LIST': {
            const profiles = await loadProfiles();
            const masked = profiles.map(item => ({ ...item, apiKey: item.apiKey ? '••••' + item.apiKey.slice(-4) : '' }));
            sendResponse({ ok: true, profiles: masked, activeId: await activeProfileId() });
            return;
          }
          case 'PROFILE_GET_FULL': {
            const profile = await getProfileById(message.id);
            sendResponse(profile ? { ok: true, profile } : { ok: false, error: '档案不存在' });
            return;
          }
          case 'PROFILE_SAVE': {
            const list = await loadProfiles();
            const input = message.profile || {};
            const existing = input.id ? list.find(item => item.id === input.id) : null;
            const profile = normalizeProfile(input, existing);
            const index = list.findIndex(item => item.id === profile.id);
            if (index >= 0) list[index] = profile; else list.push(profile);
            await saveProfiles(list);
            if (message.makeActive || list.length === 1) await chrome.storage.local.set({ [ACTIVE_KEY]: profile.id });
            sendResponse({ ok: true, id: profile.id, profiles: list.map(item => ({ ...item, apiKey: item.apiKey ? '••••' + item.apiKey.slice(-4) : '' })) });
            return;
          }
          case 'PROFILE_DELETE': {
            const list = await loadProfiles();
            const next = list.filter(item => item.id !== message.id);
            await saveProfiles(next);
            const active = await activeProfileId();
            if (active === message.id) await chrome.storage.local.set({ [ACTIVE_KEY]: next[0] ? next[0].id : '' });
            sendResponse({ ok: true });
            return;
          }
          case 'PROFILE_ACTIVE': {
            const list = await loadProfiles();
            if (!list.find(item => item.id === message.id)) { sendResponse({ error: '档案不存在' }); return; }
            await chrome.storage.local.set({ [ACTIVE_KEY]: message.id });
            sendResponse({ ok: true, activeId: message.id });
            return;
          }
          case 'PROFILE_TEST': {
            const list = await loadProfiles();
            const profile = message.profile ? normalizeProfile(message.profile) : list.find(item => item.id === message.id);
            if (!profile) { sendResponse({ error: '档案不存在' }); return; }
            sendResponse(await probe(profile));
            return;
          }
          default: sendResponse({ ok: false, error: '未知指令' });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  });

  async function probe(profile) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(profile.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${profile.apiKey}` },
        body: JSON.stringify({ model: profile.model, max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}：${clip((data.error && data.error.message) || response.statusText, 160)}` };
      return { ok: true, model: (data.model || profile.model), usage: data.usage || null };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  self.MAPUS_HARNESS = { enqueue, loadTasks, getProfile, loadProfiles, activeProfileId, emit, pushLog };
})();
