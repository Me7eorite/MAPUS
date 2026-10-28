import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const DASH = 'chrome-extension://testid/dashboard/dashboard.html';

function makeDom(body = '<div class="panel" data-panel="settings"></div>') {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: DASH + '#settings' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.confirm = () => true;
  for (const [key, value] of Object.entries({
    navigator: dom.window.navigator,
    location: dom.window.location,
    history: dom.window.history
  })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  return dom;
}

function installChrome({ config, store = {}, models = null }) {
  const calls = [];
  const memory = { ...store };
  const current = () => ({ ...config, ...(memory.mapus_agent || {}) });

  const chrome = {
    runtime: {
      id: 'testid',
      lastError: undefined,
      onMessage: { addListener: () => { }, removeListener: () => { } },
      getURL: p => `chrome-extension://testid/${p}`,
      getManifest: () => ({ version: '3.0.0' }),
      sendMessage: (message, callback) => {
        calls.push(message);
        let reply = { ok: true };
        if (message.type === 'AGENT_CONFIG_SET') {
          const patch = message.patch || {};
          const next = { ...current(), ...patch };
          memory.mapus_agent = next;
          reply = { ok: true, config: publicOf(next) };
        } else if (message.type === 'AGENT_CONFIG_GET') {
          reply = { ok: true, config: publicOf(current()) };
        } else if (message.type === 'AGENT_TEST') {
          reply = message.patch && message.patch.backend === 'dsh'
            ? { ok: false, error: '连不上 127.0.0.1:7355' }
            : { ok: false, error: '模型不可用' };
        } else if (message.type === 'AGENT_DSH_MODELS') {
          reply = models || {
            ok: true,
            current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
            providers: [
              {
                id: 'deepseek-official',
                name: 'DeepSeek',
                models: [
                  { id: 'deepseek-v4-flash', name: 'V4 Flash' },
                  { id: 'deepseek-v4-pro', name: 'V4 Pro' }
                ]
              },
              { id: 'deepseek', name: 'deepseek', models: [{ id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' }] }
            ]
          };
        }
        setTimeout(() => { if (typeof callback === 'function') callback(reply); }, 0);
      }
    },
    storage: {
      local: {
        get: (keys, callback) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const data = {};
          for (const key of list) if (key in memory) data[key] = memory[key];
          setTimeout(() => callback(data), 0);
        },
        set: (patch, callback) => {
          Object.assign(memory, patch);
          setTimeout(() => { if (typeof callback === 'function') callback(); }, 0);
        },
        clear: callback => setTimeout(() => { if (typeof callback === 'function') callback(); }, 0)
      }
    },
    tabs: {
      query: (info, callback) => setTimeout(() => { if (typeof callback === 'function') callback([{ id: 1, url: 'https://a.test/' }]); }, 0),
      create: (options, callback) => setTimeout(() => { if (typeof callback === 'function') callback({ id: 9, ...options }); }, 0),
      update: (id, options, callback) => setTimeout(() => { if (typeof callback === 'function') callback({ id, ...options }); }, 0),
      sendMessage: () => { }
    },
    windows: { update: () => Promise.resolve() }
  };
  globalThis.chrome = chrome;
  return { calls, memory };
}

function publicOf(config) {
  const key = config.apiKey || '';
  const token = config.dshToken || '';
  return {
    ...config,
    apiKey: '',
    hasKey: Boolean(key),
    keyHint: key ? 'sk-***abcd' : '',
    dshToken: '',
    hasDshToken: Boolean(token),
    dshTokenHint: token ? 'abcd***wxyz' : '',
    providers: { openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' } }
  };
}

async function renderView(config, options = {}) {
  makeDom();
  const env = installChrome({ config: publicOf(config), models: options.models || null });
  const { state } = await import('../dashboard/store.js');
  state.agentConfig = publicOf(config);
  state.settings = {};
  const mod = await import('../dashboard/views/settings.js');
  const root = document.querySelector('.panel');
  mod.renderSettings(root);
  await new Promise(resolve => setTimeout(resolve, 30));
  return { root, env, state, mod };
}

const BUILTIN = {
  backend: 'builtin', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
  apiKey: 'sk-test-placeholder', temperature: 0.3, toolRounds: 40, streaming: true, autoContext: true,
  dshUrl: 'http://127.0.0.1:7355', dshToken: ''
};

const DSH = { ...BUILTIN, backend: 'dsh', dshToken: 'tok_abcdefgh_123456' };

test('内置后端：只显示内置表单，标签是"已配置"', async () => {
  const { root } = await renderView(BUILTIN);
  assert.equal(root.querySelector('#agBackend').value, 'builtin');
  assert.equal(root.querySelector('#agBuiltinBox').style.display, '');
  assert.equal(root.querySelector('#agDshBox').style.display, 'none');
  assert.equal(root.querySelector('#agentTag').textContent.trim(), '已配置');
  assert.equal(root.querySelector('#agBase').value, 'https://api.openai.com/v1');
});

test('DSH 后端：隐藏内置表单，标签是 Harness，桥地址回填', async () => {
  const { root } = await renderView(DSH);
  assert.equal(root.querySelector('#agBackend').value, 'dsh');
  assert.equal(root.querySelector('#agBuiltinBox').style.display, 'none');
  assert.equal(root.querySelector('#agDshBox').style.display, '');
  assert.equal(root.querySelector('#agentTag').textContent.trim(), 'Harness');
  assert.equal(root.querySelector('#agDshUrl').value, 'http://127.0.0.1:7355');
  assert.match(root.querySelector('#agDshToken').placeholder, /已保存/);
});

test('切到 DSH 保存：不把内置的地址与模型写空', async () => {
  const { root, env } = await renderView(BUILTIN);
  const backend = root.querySelector('#agBackend');
  backend.value = 'dsh';
  backend.dispatchEvent(new window.Event('change'));
  assert.equal(root.querySelector('#agBuiltinBox').style.display, 'none');
  assert.equal(root.querySelector('#agDshBox').style.display, '');

  root.querySelector('#agDshToken').value = 'tok_newtoken_987654';
  root.querySelector('#btnAgentSave').click();
  await new Promise(resolve => setTimeout(resolve, 40));

  const saved = env.calls.filter(item => item.type === 'AGENT_CONFIG_SET').pop();
  assert.ok(saved, '应该发出 AGENT_CONFIG_SET');
  assert.equal(saved.patch.backend, 'dsh');
  assert.equal(saved.patch.dshToken, 'tok_newtoken_987654');
  assert.equal('baseUrl' in saved.patch, false, '切到 DSH 时不能覆盖内置地址');
  assert.equal('model' in saved.patch, false, '切到 DSH 时不能覆盖内置模型');
  assert.equal(saved.patch.autoContext, true);

  assert.equal(env.memory.mapus_agent.baseUrl, 'https://api.openai.com/v1');
  assert.equal(env.memory.mapus_agent.model, 'gpt-4o-mini');
});

test('DSH 下测试连接：不要求填接口地址，按 dsh 分支走', async () => {
  const { root, env } = await renderView({ ...DSH, dshUrl: '' });
  root.querySelector('#agDshUrl').value = 'http://127.0.0.1:7355';
  root.querySelector('#btnAgentTest').click();
  await new Promise(resolve => setTimeout(resolve, 60));
  const test = env.calls.filter(item => item.type === 'AGENT_TEST').pop();
  assert.ok(test, '应该发出 AGENT_TEST');
  assert.equal(test.patch.backend, 'dsh');
  assert.equal(test.patch.dshUrl, 'http://127.0.0.1:7355');
  assert.equal('baseUrl' in test.patch, false);
  assert.match(root.querySelector('#agentNote').textContent, /连不上/);
});

test('内置下测试连接：缺地址时直接拦下，不发请求', async () => {
  const { root, env } = await renderView({ ...BUILTIN, baseUrl: '', model: '' });
  root.querySelector('#btnAgentTest').click();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(env.calls.filter(item => item.type === 'AGENT_TEST').length, 0);
});

test('保存内置配置：patch 里带 backend=builtin 与完整字段', async () => {
  const { root, env } = await renderView(BUILTIN);
  root.querySelector('#agModel').value = 'gpt-4o';
  root.querySelector('#btnAgentSave').click();
  await new Promise(resolve => setTimeout(resolve, 40));
  const saved = env.calls.filter(item => item.type === 'AGENT_CONFIG_SET').pop();
  assert.equal(saved.patch.backend, 'builtin');
  assert.equal(saved.patch.model, 'gpt-4o');
  assert.equal(saved.patch.provider, 'openai');
  assert.equal('dshToken' in saved.patch, false, '内置模式下不动桥 Token');
});

test('openDashboard 拼出带 hash 的大屏地址', async () => {
  makeDom('<div></div>');
  const created = [];
  globalThis.chrome = {
    runtime: {
      id: 'testid',
      getURL: p => `chrome-extension://testid/${p}`,
      lastError: undefined
    },
    tabs: {
      query: () => Promise.resolve([]),
      create: options => { created.push(options); return Promise.resolve({ id: 3 }); }
    },
    windows: { update: () => Promise.resolve() }
  };
  const { openDashboard, DASHBOARD_URL } = await import('../popup/ui.js');
  await openDashboard('settings');
  assert.equal(created.length, 1);
  assert.equal(created[0].url, DASHBOARD_URL() + '#settings');

  const updated = [];
  globalThis.chrome.tabs.query = () => Promise.resolve([{ id: 7, url: DASHBOARD_URL() + '#tasks', windowId: 1 }]);
  globalThis.chrome.tabs.update = (id, options) => { updated.push({ id, options }); return Promise.resolve({ id }); };
  await openDashboard('settings');
  assert.equal(created.length, 1, '不应重复创建');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].options.url, DASHBOARD_URL() + '#settings');
});

test('DSH 后端：回填已选的 provider 与模型', async () => {
  const { root } = await renderView({ ...DSH, dshProvider: 'deepseek-official', dshModel: 'deepseek-v4-flash' });
  assert.equal(root.querySelector('#agDshProvider').value, 'deepseek-official');
  assert.equal(root.querySelector('#agDshModel').value, 'deepseek-v4-flash');
});

test('读取可选模型：填出下拉，保存时把 provider/model 一起带上', async () => {
  const { root, env } = await renderView(DSH);
  const providerSel = root.querySelector('#agDshProvider');

  root.querySelector('#btnDshModels').click();
  await new Promise(resolve => setTimeout(resolve, 60));

  const asked = env.calls.filter(item => item.type === 'AGENT_DSH_MODELS').pop();
  assert.ok(asked, '应该发 AGENT_DSH_MODELS');
  assert.equal(asked.patch.backend, 'dsh');

  const providerIds = [...providerSel.querySelectorAll('option')].map(o => o.value).filter(Boolean);
  assert.deepEqual(providerIds, ['deepseek-official', 'deepseek']);
  assert.deepEqual(
    [...root.querySelector('#agDshModel').querySelectorAll('option')].map(o => o.value).filter(Boolean),
    []
  );

  providerSel.value = 'deepseek-official';
  providerSel.dispatchEvent(new window.Event('change'));
  assert.deepEqual(
    [...root.querySelector('#agDshModel').querySelectorAll('option')].map(o => o.value).filter(Boolean),
    ['deepseek-v4-flash', 'deepseek-v4-pro']
  );

  providerSel.value = 'deepseek';
  providerSel.dispatchEvent(new window.Event('change'));
  const next = [...root.querySelector('#agDshModel').querySelectorAll('option')].map(o => o.value).filter(Boolean);
  assert.deepEqual(next, ['deepseek-v4-pro']);

  root.querySelector('#agDshModel').value = 'deepseek-v4-pro';
  root.querySelector('#btnAgentSave').click();
  await new Promise(resolve => setTimeout(resolve, 40));
  const saved = env.calls.filter(item => item.type === 'AGENT_CONFIG_SET').pop();
  assert.equal(saved.patch.dshProvider, 'deepseek');
  assert.equal(saved.patch.dshModel, 'deepseek-v4-pro');
});

test('不选模型时保存空串，表示交回 dsh 默认', async () => {
  const { root, env } = await renderView({ ...DSH, dshProvider: 'deepseek-official', dshModel: 'deepseek-v4-flash' });
  root.querySelector('#agDshProvider').value = '';
  root.querySelector('#agDshModel').value = '';
  root.querySelector('#btnAgentSave').click();
  await new Promise(resolve => setTimeout(resolve, 40));
  const saved = env.calls.filter(item => item.type === 'AGENT_CONFIG_SET').pop();
  assert.equal(saved.patch.dshProvider, '');
  assert.equal(saved.patch.dshModel, '');
});
