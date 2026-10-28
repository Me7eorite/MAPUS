(function () {
  'use strict';
  if (self.MAPUS_DSH) return;


  const CONFIG_KEY = 'mapus_agent';
  const DEFAULTS = {
    backend: 'builtin',
    dshUrl: 'http://127.0.0.1:7355',
    dshToken: '',
    dshProvider: '',
    dshModel: ''
  };
  const TURN_PATH = '/v1/turn';
  const RPC_PATH = '/v1/rpc';
  const CANCEL_PATH = '/v1/cancel';
  const HEALTH_PATH = '/v1/health';
  const CATALOG_PATH = '/v1/catalog';
  const MODELS_PATH = '/v1/models';

  const active = new Set();

  function normalizeBase(url) {
    const text = String(url || '').trim() || DEFAULTS.dshUrl;
    return text.replace(/\/+$/, '');
  }

  async function readConfig() {
    let stored = {};
    try {
      const data = await chrome.storage.local.get(CONFIG_KEY);
      stored = (data && data[CONFIG_KEY]) || {};
    } catch (_) {
      stored = {};
    }
    return {
      ...DEFAULTS,
      backend: stored.backend === 'dsh' ? 'dsh' : 'builtin',
      dshUrl: normalizeBase(stored.dshUrl),
      dshToken: typeof stored.dshToken === 'string' ? stored.dshToken : '',
      dshProvider: typeof stored.dshProvider === 'string' ? stored.dshProvider.trim() : '',
      dshModel: typeof stored.dshModel === 'string' ? stored.dshModel.trim() : '',
      autoContext: stored.autoContext !== false
    };
  }

  function headers(config) {
    const out = { 'Content-Type': 'application/json' };
    if (config.dshToken) out['X-MAPUS-TOKEN'] = config.dshToken;
    return out;
  }

  function fail(message) {
    const error = new Error(message);
    return error;
  }

  async function siteOf(tabId) {
    try {
      const tab = tabId !== undefined && tabId !== null
        ? await chrome.tabs.get(Number(tabId))
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (!tab) return { origin: '', title: '' };
      let origin = '';
      try {
        origin = new URL(tab.url || '').origin;
      } catch (_) {
        origin = String(tab.url || '').slice(0, 60);
      }
      return { origin, title: tab.title || '' };
    } catch (_) {
      return { origin: '', title: '' };
    }
  }

  function messageText(message) {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    if (!Array.isArray(message.parts)) return '';
    return message.parts
      .map(part => (part && part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  function hash(text) {
    let value = 0;
    const input = String(text || '');
    for (let index = 0; index < input.length; index++) {
      value = (value * 31 + input.charCodeAt(index)) | 0;
    }
    return (value >>> 0).toString(36);
  }

  function conversationId(sessionId, site, messages) {
    if (sessionId) return String(sessionId);
    const first = (messages || []).find(item => item && item.role === 'user');
    return `${site.origin || 'unknown'}#${hash(messageText(first).slice(0, 200))}`;
  }

  function clip(value, limit) {
    const text = String(value === undefined || value === null ? '' : value);
    return text.length > limit ? text.slice(0, limit) + `…[共 ${text.length} 字符]` : text;
  }

  function abortError() {
    const error = new Error('已中止');
    error.name = 'AbortError';
    return error;
  }

  function raceAbort(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        value => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        error => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  function preview(value) {
    if (value === undefined) return '{"ok":true}';
    if (typeof value === 'string') return clip(value, 400);
    try {
      return clip(JSON.stringify(value), 400);
    } catch (_) {
      return clip(String(value), 400);
    }
  }

  async function runTool(name, args, tabId) {
    if (!self.MAPUS_AGENT || typeof self.MAPUS_AGENT.runTool !== 'function') {
      return { error: '工具表未就绪，请重新加载扩展' };
    }
    const tool = String(name || '').trim();
    if (!tool) return { error: '工具名为空' };
    try {
      const result = await self.MAPUS_AGENT.runTool(tool, args && typeof args === 'object' ? args : {}, tabId);
      return result === undefined ? { ok: true } : result;
    } catch (error) {
      return { error: error && error.message ? error.message : String(error) };
    }
  }

  async function postJson(url, config, payload, signal) {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(payload),
      signal,
      credentials: 'omit',
      cache: 'no-store'
    });
    const text = await response.text().catch(() => '');
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      parsed = null;
    }
    return { ok: response.ok, status: response.status, body: parsed, text };
  }

  async function run(options) {
    let conversation = '';
    let aborted = false;
    try {
      return await runTracked(options, value => {
        conversation = value;
        active.add(value);
      });
    } catch (error) {
      aborted = Boolean(error && error.name === 'AbortError');
      throw error;
    } finally {
      if (conversation) {
        active.delete(conversation);
        if (aborted) {
          readConfig()
            .then(config => postJson(normalizeBase(config.dshUrl) + CANCEL_PATH, config, { conversation, reason: 'user' }))
            .catch(() => { });
        }
      }
    }
  }

  async function runTracked({ tabId, messages, sessionId, emit, signal }, track) {
    const config = await readConfig();
    const base = normalizeBase(config.dshUrl);
    const list = Array.isArray(messages) ? messages : [];
    const lastUser = [...list].reverse().find(item => item && item.role === 'user');
    const prompt = messageText(lastUser).trim();
    if (!prompt) throw fail('消息为空');
    const site = await siteOf(tabId);
    const conversation = conversationId(sessionId, site, list);
    track(conversation);

    let context = null;
    if (config.autoContext !== false && self.MAPUS_AGENT && typeof self.MAPUS_AGENT.buildContext === 'function') {
      try {
        context = await self.MAPUS_AGENT.buildContext(tabId);
      } catch (_) {
        context = null;
      }
    }

    const history = list
      .slice(0, list.lastIndexOf(lastUser))
      .filter(item => item && item.role)
      .map(item => ({ role: item.role, content: messageText(item).slice(0, 2000) }))
      .filter(item => item.content);

    const startedAt = Date.now();
    let response;
    try {
      response = await fetch(base + TURN_PATH, {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify({
          prompt,
          conversation,
          context,
          history,
          ...(config.dshProvider ? { provider: config.dshProvider } : {}),
          ...(config.dshModel ? { model: config.dshModel } : {})
        }),
        signal,
        credentials: 'omit',
        cache: 'no-store'
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw fail(`连不上 DeepSeek Harness 桥（${base}）：请确认 dsh 已加载 dsh-mapus 插件；原始错误：${error.message}`);
    }

    if (response.status === 401) {
      throw fail('Harness 桥拒绝了请求：Token 不对。请把插件启动时打印的 Token 填到控制大屏 → 设置 → 智能体模型里。');
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw fail(`Harness 桥返回 ${response.status}${text ? '：' + clip(text, 200) : ''}`);
    }
    if (!response.body) throw fail('Harness 桥没有返回事件流（可能是 Node 版本过低）');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let usage = null;
    let steps = 0;
    let budget = 0;
    let step = 0;
    let terminal = null;
    const pending = [];

    const handle = async event => {
      if (!event || typeof event !== 'object') return;
      switch (event.type) {
        case 'hello':
          return;
        case 'step': {
          step = Number(event.index) || step + 1;
          steps = Math.max(steps, step);
          budget = Number(event.total) || budget;
          emit({ type: 'step', index: step, total: budget, used: Math.max(0, step - 1) });
          return;
        }
        case 'delta': {
          answer += event.text || '';
          emit({ type: 'delta', text: event.text || '' });
          return;
        }
        case 'reasoning':
          emit({ type: 'reasoning', text: event.text || '', step });
          return;
        case 'rpc': {
          const id = String(event.id || '');
          const name = String(event.tool || '');
          const args = event.args && typeof event.args === 'object' ? event.args : {};
          emit({ type: 'tool', id, name, args, step });
          const began = Date.now();
          const result = await raceAbort(runTool(name, args, tabId), signal);
          const ok = !result || !result.error;
          emit({
            type: 'tool_result',
            id,
            name,
            ok,
            preview: preview(result),
            step,
            ms: Date.now() - began
          });
          pending.push(
            postJson(base + RPC_PATH, config, { conversation, id, ok, result, error: ok ? undefined : result.error }, signal)
              .catch(() => null)
          );
          return;
        }
        case 'done':
        case 'error':
        case 'aborted':
          terminal = event;
          return;
        default:
          return;
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!raw) continue;
        let event;
        try {
          event = JSON.parse(raw);
        } catch (_) {
          continue;
        }
        await handle(event);
      }
    }
    if (buffer.trim()) {
      try {
        await handle(JSON.parse(buffer.trim()));
      } catch (_) {  }
    }
    if (pending.length) await Promise.allSettled(pending);

    if (terminal) {
      if (terminal.answer && !answer) answer = String(terminal.answer);
      if (terminal.usage) usage = terminal.usage;
      if (terminal.type === 'error') throw fail(terminal.message || 'Harness 执行失败');
      if (terminal.type === 'aborted') {
        const error = new Error(terminal.message || '已中止');
        error.name = 'AbortError';
        throw error;
      }
    }

    return {
      answer,
      usage,
      steps,
      budget: budget || steps,
      exhausted: Boolean(terminal && terminal.exhausted),
      stuck: false,
      context: terminal && terminal.context ? terminal.context : context,
      elapsed: Date.now() - startedAt
    };
  }

  async function cancel() {
    const config = await readConfig();
    if (config.backend !== 'dsh' || !active.size) return false;
    const base = normalizeBase(config.dshUrl);
    const requests = [];
    for (const conversation of active) {
      requests.push(
        postJson(base + CANCEL_PATH, config, { conversation, reason: 'user' }).catch(() => null)
      );
    }
    await Promise.allSettled(requests);
    return true;
  }

  async function testConnection(patch) {
    const stored = await readConfig();
    const config = { ...stored, ...(patch || {}) };
    config.dshUrl = normalizeBase(config.dshUrl);
    if (patch && typeof patch.dshToken === 'string' && patch.dshToken === '') config.dshToken = stored.dshToken;
    try {
      const health = await fetch(config.dshUrl + HEALTH_PATH, { cache: 'no-store', credentials: 'omit' });
      if (!health.ok) return { ok: false, error: `桥返回 ${health.status}` };
      const info = await health.json();
      if (info && info.name !== 'dsh-mapus' && info.name !== undefined) {
        return { ok: false, error: `该地址不是 dsh-mapus 桥（${info.name || '未知服务'}）` };
      }
      if (info && info.authRequired && !config.dshToken) {
        return { ok: false, error: '桥要求 Token，但控制大屏的设置里没填' };
      }
      const catalog = await fetch(config.dshUrl + CATALOG_PATH, {
        headers: config.dshToken ? { 'X-MAPUS-TOKEN': config.dshToken } : {},
        cache: 'no-store',
        credentials: 'omit'
      });
      if (catalog.status === 401) return { ok: false, error: 'Token 不正确' };
      if (!catalog.ok) return { ok: false, error: `目录接口返回 ${catalog.status}` };
      const surface = await catalog.json().catch(() => null);
      const count = surface && Array.isArray(surface.tools) ? surface.tools.length : 0;
      return { ok: true, url: config.dshUrl, tools: count, uptimeMs: info && info.uptimeMs };
    } catch (error) {
      return { ok: false, error: `连不上 ${config.dshUrl}：${error.message}` };
    }
  }

  async function listModels(patch) {
    const stored = await readConfig();
    const config = { ...stored, ...(patch || {}) };
    config.dshUrl = normalizeBase(config.dshUrl);
    if (patch && typeof patch.dshToken === 'string' && patch.dshToken === '') config.dshToken = stored.dshToken;
    try {
      const response = await fetch(config.dshUrl + MODELS_PATH, {
        headers: config.dshToken ? { 'X-MAPUS-TOKEN': config.dshToken } : {},
        cache: 'no-store',
        credentials: 'omit'
      });
      if (response.status === 401) return { ok: false, error: 'Token 不正确' };
      if (response.status === 404) {
        return { ok: false, error: '桥版本太旧，没有 /v1/models：重启一次 dsh 让新版插件生效' };
      }
      if (!response.ok) return { ok: false, error: `模型目录接口返回 ${response.status}` };
      const data = await response.json().catch(() => null);
      if (!data || !Array.isArray(data.providers)) return { ok: false, error: '桥返回的模型目录格式不对' };
      return { ok: true, providers: data.providers, current: data.current || null, note: data.note || '' };
    } catch (error) {
      return { ok: false, error: `连不上 ${config.dshUrl}：${error.message}` };
    }
  }

  self.MAPUS_DSH = {
    readConfig,
    run,
    cancel,
    runTool,
    testConnection,
    listModels,
    conversationId,
    normalizeBase
  };
})();
