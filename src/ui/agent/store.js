import { send, hostOf, copyText, toast, openDashboard } from '../../popup/ui.js';

export const QUICK_PROMPTS = [
  '这个站点在收集我哪些信息？有哪些追踪行为？',
  '把扫描到的接口按风险排序，并说明依据',
  '页面里有哪些敏感数据？只挑最危险的 5 条',
  '分析这个站点的调试防护手法，并给出绕过建议',
  '登录流程用了哪些参数？有没有可枚举的接口',
  '当前 Cookie 和本地存储里有什么值得注意的'
];

const COUNT_KEYS = ['domains', 'absoluteApis', 'apis', 'moduleFiles', 'docFiles', 'credentials', 'cookies',
  'idKeys', 'phones', 'emails', 'idcards', 'ips', 'companies', 'jwts', 'imageFiles', 'githubUrls',
  'vueFiles', 'jsFiles', 'urls'];

export const countFindings = results => {
  if (!results) return 0;
  return COUNT_KEYS.reduce((total, key) => total + (Array.isArray(results[key]) ? results[key].length : 0), 0);
};

export const textOf = parts => (Array.isArray(parts) ? parts : [])
  .map(part => (part && part.type === 'text' ? part.text : ''))
  .join('');

const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const shotIdOf = preview => {
  const match = /"shotId"\s*:\s*"([^"]+)"/.exec(String(preview || ''));
  return match ? match[1] : '';
};

const initial = () => ({
  tabId: null,
  host: '',
  site: '',
  pageTitle: '',
  findings: 0,
  config: null,
  configLoaded: false,
  sessions: [],
  sessionsLoaded: false,
  scope: 'site',
  drawer: false,
  session: null,
  messages: [],
  streaming: false,
  error: null,
  step: null,
  exhausted: null,
  collapse: 'auto'
});

export class AgentStore {
  constructor() {
    this.state = initial();
    this.listeners = new Set();
    this.port = null;
    this.requestId = null;
    this.tabId = undefined;
    this.lastSite = undefined;
    this.saveTimer = null;
    this.ctx = null;
    this.shots = new Map();
  }

  getState = () => this.state;

  subscribe = listener => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(patch) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  attach(ctx) {
    this.ctx = ctx;
    const tab = (ctx.state && ctx.state.tab) || null;
    const tabId = tab ? tab.id : null;
    const host = (tab && hostOf(tab.url)) || '';
    this.set({
      host,
      site: host,
      pageTitle: (tab && tab.title) || '',
      findings: countFindings(ctx.state && ctx.state.results)
    });
    if (tabId === this.tabId && host === this.lastSite) return;
    this.tabId = tabId;
    this.lastSite = host;
    this.bootstrap();
  }

  switchSettings() {
    openDashboard('settings');
  }

  currentTabId() {
    const tab = this.ctx && this.ctx.state && this.ctx.state.tab;
    return tab ? tab.id : null;
  }

  ready() {
    const config = this.state.config;
    if (!config) return false;
    if (config.backend === 'dsh') return Boolean(config.dshUrl);
    return !!(config.baseUrl && config.model);
  }

  label() {
    const config = this.state.config;
    if (!config) return '';
    if (config.backend === 'dsh') return 'DeepSeek Harness';
    return hostOf(config.baseUrl) || config.baseUrl || '';
  }

  harness() {
    const config = this.state.config;
    return !!(config && config.backend === 'dsh');
  }

  loadCollapse() {
    try {
      chrome.storage.local.get(['agent.collapse'], data => {
        const value = data && data['agent.collapse'];
        if (value === 'auto' || value === 'all' || value === 'none') this.set({ collapse: value });
      });
    } catch (_) {   }
  }

  cycleCollapse() {
    const order = ['auto', 'all', 'none'];
    const next = order[(order.indexOf(this.state.collapse) + 1) % order.length];
    this.set({ collapse: next });
    try {
      chrome.storage.local.set({ 'agent.collapse': next });
    } catch (_) {   }
  }

  async loadConfig() {
    const reply = await send({ to: 'agent', type: 'AGENT_CONFIG_GET' });
    const config = reply && reply.ok ? reply.config : null;
    this.set({ config, configLoaded: true });
  }

  async patchConfig(patch) {
    const reply = await send({ to: 'agent', type: 'AGENT_CONFIG_SET', patch });
    if (!reply || !reply.ok) {
      toast((reply && reply.error) || '配置保存失败', 'error');
      return false;
    }
    this.set({ config: reply.config });
    return true;
  }

  toggleContext() {
    const config = this.state.config;
    if (!config) return;
    const next = config.autoContext === false;
    this.patchConfig({ autoContext: next });
  }

  providerList() {
    const raw = this.state.config && this.state.config.providers;
    if (Array.isArray(raw)) return raw.filter(item => item && item.id);
    if (raw && typeof raw === 'object') return Object.keys(raw).map(id => ({ id, ...(raw[id] || {}) }));
    return [];
  }

  async selectProvider(id) {
    const preset = this.providerList().find(item => item.id === id);
    if (!preset) return;
    const patch = { provider: preset.id };
    if (preset.baseUrl) patch.baseUrl = preset.baseUrl;
    if (preset.model) patch.model = preset.model;
    const ok = await this.patchConfig(patch);
    if (ok) toast(`已切换到 ${preset.label || preset.id}`, 'ok');
  }

  async bootstrap() {
    this.discard();
    this.loadCollapse();
    if (!this.state.configLoaded) await this.loadConfig();
    this.set({ messages: [], session: null, error: null, drawer: false });
    const reply = await send({ to: 'agent', type: 'AGENT_SESSION_LIST', site: this.state.site });
    const list = reply && reply.ok && Array.isArray(reply.sessions) ? reply.sessions : [];
    this.set({ sessions: this.state.scope === 'site' ? list : this.state.sessions, sessionsLoaded: true });
    if (list.length) await this.openSession(list[0].id, true);
    else this.newSession(true);
    if (this.state.scope !== 'site') this.loadSessions();
  }

  async loadSessions() {
    const site = this.state.scope === 'site' ? this.state.site : '';
    const reply = await send({ to: 'agent', type: 'AGENT_SESSION_LIST', site });
    if (!reply || !reply.ok) return;
    this.set({ sessions: reply.sessions || [], sessionsLoaded: true });
  }

  setScope(scope) {
    if (this.state.scope === scope) return;
    this.set({ scope });
    this.loadSessions();
  }

  toggleDrawer(open) {
    const next = typeof open === 'boolean' ? open : !this.state.drawer;
    this.set({ drawer: next });
    if (next) this.loadSessions();
  }

  async openSession(id, silent) {
    this.discard();
    const reply = await send({ to: 'agent', type: 'AGENT_SESSION_GET', id });
    if (!reply || !reply.ok || !reply.session) {
      if (!silent) toast('会话打开失败', 'error');
      return;
    }
    const session = reply.session;
    this.set({
      session: {
        id: session.id,
        site: session.site || '',
        url: session.url || '',
        title: session.title || '',
        createdAt: session.createdAt || Date.now()
      },
      messages: (session.messages || []).map(message => ({ ...message, parts: message.parts || [] })),
      streaming: false,
      error: null,
      step: null,
      exhausted: null,
      drawer: false
    });
  }

  newSession(silent) {
    this.discard();
    const tab = this.ctx && this.ctx.state && this.ctx.state.tab;
    this.set({
      session: {
        id: uid('s'),
        site: this.state.site,
        url: (tab && tab.url) || '',
        title: this.state.pageTitle,
        createdAt: Date.now()
      },
      messages: [],
      streaming: false,
      error: null,
      step: null,
      exhausted: null,
      drawer: false
    });
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  async removeSession(id) {
    await send({ to: 'agent', type: 'AGENT_SESSION_DELETE', id });
    this.set({ sessions: this.state.sessions.filter(item => item.id !== id) });
    if (this.state.session && this.state.session.id === id) this.newSession(true);
  }

  async clearCurrent() {
    const session = this.state.session;
    if (!session) return;
    this.discard();
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await send({ to: 'agent', type: 'AGENT_SESSION_DELETE', id: session.id });
    this.set({
      sessions: this.state.sessions.filter(item => item.id !== session.id),
      messages: [],
      session: { ...session, id: uid('s'), createdAt: Date.now() },
      error: null
    });
  }

  abort() {
    if (!this.port || !this.requestId) {
      this.set({ streaming: false });
      return;
    }
    try {
      this.port.postMessage({ type: 'ABORT', requestId: this.requestId });
    } catch (_) {   }
    this.set({ streaming: false });
  }

  discard() {
    if (this.requestId && this.port) {
      try {
        this.port.postMessage({ type: 'ABORT', requestId: this.requestId });
      } catch (_) {   }
    }
    this.requestId = null;
    this.set({ streaming: false });
  }

  connect() {
    if (this.port) return this.port;
    try {
      if (!this.shotListener) {
        this.shotListener = message => {
          if (message && message.type === 'MAPUS_SHOT' && message.shot) this.attachShot(message.shot);
        };
        try { chrome.runtime.onMessage.addListener(this.shotListener); } catch (_) {   }
      }
      const port = chrome.runtime.connect({ name: 'mapus-agent' });
      port.onMessage.addListener(event => this.onEvent(event));
      port.onDisconnect.addListener(() => {
        this.port = null;
        if (this.state.streaming) this.finish({ type: 'error', message: '与后台的连接中断，请重试' });
      });
      this.port = port;
    } catch (error) {
      this.finish({ type: 'error', message: '无法连接后台：' + error.message });
    }
    return this.port;
  }

  history() {
    const list = [];
    for (const message of this.state.messages) {
      const text = textOf(message.parts).trim();
      if (message.role === 'user') {
        if (text) list.push({ role: 'user', content: text });
        continue;
      }
      const tools = (message.parts || [])
        .filter(part => part && part.type === 'tool' && part.callId && part.name)
        .map(part => ({ id: part.callId, name: part.name, args: part.args || {}, ok: part.ok !== false, preview: part.preview || '' }));
      if (!text && !tools.length) continue;
      list.push({ role: 'assistant', content: text, tools });
    }
    return list;
  }

  continueRun() {
    if (this.state.streaming) return;
    this.send('继续：接着上面已经拿到的观察往下做，别重复做过的动作，缺什么补什么。');
  }

  send(text) {
    const content = String(text || '').trim();
    if (!content || this.state.streaming) return;
    if (!this.ready()) {
      toast('请先在设置里配置模型', 'error');
      this.switchSettings();
      return;
    }
    if (!this.state.session) this.newSession(true);
    const messages = this.state.messages.concat([
      { id: uid('m'), role: 'user', parts: [{ type: 'text', text: content }], ts: Date.now() },
      { id: uid('m'), role: 'assistant', parts: [], ts: Date.now() }
    ]);
    this.set({ messages, error: null, streaming: true, step: null, exhausted: null });
    this.save();
    const port = this.connect();
    if (!port) return;
    this.requestId = uid('req');
    try {
      port.postMessage({
        type: 'CHAT',
        requestId: this.requestId,
        tabId: this.currentTabId(),
        sessionId: this.state.session ? this.state.session.id : '',
        messages: this.history()
      });
    } catch (error) {
      this.finish({ type: 'error', message: '发送失败：' + error.message });
    }
  }

  retry() {
    const last = [...this.state.messages].reverse().find(message => message.role === 'user');
    if (last) this.send(textOf(last.parts));
  }

  copy(text) {
    copyText(text).then(ok => toast(ok ? '已复制' : '复制失败', ok ? 'ok' : 'error'));
  }

  async showContext() {
    const reply = await send({ to: 'agent', type: 'AGENT_CONTEXT', tabId: this.currentTabId() });
    if (!reply || !reply.ok) {
      toast('读取上下文失败', 'error');
      return;
    }
    const context = reply.context || {};
    const lines = [
      `URL：${context.url || '—'}`,
      `标题：${context.title || '—'}`,
      `扫描：${context.total || 0} 条，进度 ${context.progress === null || context.progress === undefined ? '—' : context.progress + '%'}`,
      `浏览器特征：${(context.fingerprints || []).map(item => item.name).join('、') || '无'}`,
      `隐私防护：${context.anti ? (context.anti.isEnabled ? '开启' : '关闭') + '，拦截 ' + context.anti.blocks + ' 次' : '—'}`,
      `脚本：${context.hooks ? (context.hooks.enabled || []).join('、') || '未启用' : '—'}`,
      context.note ? `备注：${context.note}` : ''
    ].filter(Boolean);
    await copyText(lines.join('\n'));
    toast('上下文摘要已复制', 'ok');
  }

  onEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.requestId && event.requestId !== this.requestId) return;
    if (event.type === 'start') {
      this.set({ streaming: true, error: null });
      return;
    }
    if (event.type === 'step') {
      if (this.harness()) {
        this.set({ step: { index: 0, total: 0, harness: true } });
        return;
      }
      this.set({ step: { index: Number(event.index) || 1, total: Number(event.total) || 0 } });
      return;
    }
    if (event.type === 'delta') {
      this.appendText(event.text);
      return;
    }
    if (event.type === 'reasoning') {
      this.appendReasoning(event.text, event.step);
      return;
    }
    if (event.type === 'tool') {
      this.pushTool(event);
      return;
    }
    if (event.type === 'tool_result') {
      this.finishTool(event);
      return;
    }
    if (event.type === 'done') {
      this.finish(event);
      return;
    }
    if (event.type === 'aborted') {
      this.finish(event, true);
      return;
    }
    if (event.type === 'error') this.finish(event);
  }

  patchLast(updater) {
    const messages = this.state.messages.slice();
    const index = messages.length - 1;
    if (index < 0 || messages[index].role !== 'assistant') return false;
    messages[index] = updater(messages[index]);
    this.set({ messages });
    return true;
  }

  appendText(text) {
    if (!text) return;
    this.patchLast(last => {
      const parts = last.parts.slice();
      const tail = parts[parts.length - 1];
      if (tail && tail.type === 'text') parts[parts.length - 1] = { ...tail, text: tail.text + text };
      else parts.push({ type: 'text', text });
      return { ...last, parts };
    });
  }

  appendReasoning(text, step) {
    if (!text) return;
    this.patchLast(last => {
      const parts = last.parts.slice();
      const tail = parts[parts.length - 1];
      const index = this.harness() ? 0 : Number(step) || 0;
      if (tail && tail.type === 'reasoning' && (tail.step || 0) === index) {
        parts[parts.length - 1] = { ...tail, text: tail.text + text };
      } else {
        parts.push({ type: 'reasoning', text, step: index });
      }
      return { ...last, parts };
    });
  }

  pushTool(event) {
    this.patchLast(last => ({
      ...last,
      parts: last.parts.concat([{
        type: 'tool',
        callId: event.id || uid('call'),
        name: event.name || 'tool',
        args: event.args && typeof event.args === 'object' ? event.args : {},
        step: this.harness() ? 0 : Number(event.step) || 0,
        state: 'running',
        ok: null,
        preview: '',
        startedAt: Date.now(),
        ms: 0
      }])
    }));
  }

  finishTool(event) {
    this.patchLast(last => {
      const parts = last.parts.slice();
      for (let index = parts.length - 1; index >= 0; index--) {
        const part = parts[index];
        if (part.type !== 'tool') continue;
        if (event.id && part.callId && part.callId !== event.id) continue;
        const shotId = shotIdOf(event.preview);
        parts[index] = {
          ...part,
          state: event.ok === false ? 'error' : 'done',
          ok: event.ok !== false,
          preview: event.preview || '',
          shot: shotId ? (this.shots.get(shotId) || '') : '',
          shotId: shotId || '',
          ms: part.startedAt ? Date.now() - part.startedAt : part.ms || 0
        };
        break;
      }
      return { ...last, parts };
    });
    this.save();
  }

  attachShot(shot) {
    if (!shot || !shot.id || !shot.dataUrl) return;
    this.shots.set(shot.id, shot.dataUrl);
    const messages = this.state.messages.slice();
    let touched = false;
    for (let index = messages.length - 1; index >= 0 && !touched; index--) {
      const parts = messages[index].parts || [];
      for (let inner = parts.length - 1; inner >= 0; inner--) {
        const part = parts[inner];
        if (part && part.type === 'tool' && shotIdOf(part.preview) === shot.id) {
          const next = parts.slice();
          next[inner] = { ...part, shot: shot.dataUrl, shotId: shot.id };
          messages[index] = { ...messages[index], parts: next };
          touched = true;
          break;
        }
      }
    }
    if (touched) this.set({ messages });
  }

  finish(event, aborted) {
    const isError = event.type === 'error';
    const messages = this.state.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      if (aborted && !last.parts.length) {
        messages.pop();
      } else {
        const text = textOf(last.parts);
        messages[messages.length - 1] = {
          ...last,
          parts: !text && event.answer ? [{ type: 'text', text: event.answer }] : last.parts,
          aborted: aborted === true,
          error: isError ? (event.message || '模型调用失败') : '',
          usage: event.usage || last.usage || null
        };
      }
      this.set({ messages });
    }
    this.requestId = null;
    this.set({
      streaming: false,
      step: null,
      exhausted: !this.harness() && event.exhausted && !aborted
        ? { steps: Number(event.steps) || 0, budget: Number(event.budget) || 0 }
        : null,
      error: isError ? (event.message || '模型调用失败') : null
    });
    this.save();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  async flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const session = this.state.session;
    if (!session) return;
    const messages = this.state.messages.slice();
    const tail = messages[messages.length - 1];
    if (tail && tail.role === 'assistant' && !tail.parts.length && !tail.error) messages.pop();
    if (!messages.length) return;
    const reply = await send({
      to: 'agent',
      type: 'AGENT_SESSION_SAVE',
      session: {
        id: session.id,
        site: session.site,
        url: session.url,
        title: session.title,
        createdAt: session.createdAt,
        messages
      }
    });
    if (!reply || !reply.ok || !reply.meta) return;
    const rest = this.state.sessions.filter(item => item.id !== reply.meta.id);
    this.set({ sessions: [reply.meta, ...rest], sessionsLoaded: true });
  }
}
