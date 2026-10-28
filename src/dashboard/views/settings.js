import { $, $$, esc, agent, toast, saveStore, clearStore, copyText } from '../lib.js';
import { state, refreshSettings, refreshAgent, setGate, emitChange } from '../store.js';
import { mount as mountRules } from '../../popup/views/rules-editor.js';

const TOOLS = [
  { id: 'endpoint-finder', name: 'JS 端点发现', desc: '收集同源接口与路径' },
  { id: 'sensitive-dir-finder', name: '敏感目录探测', desc: '并发探测常见敏感路径' },
  { id: 'dom-xss-detector', name: 'DOM XSS 检测', desc: '定位 source → sink 链路' },
  { id: 'prototype-pollution', name: '原型污染检测', desc: '被动检查污染链路' }
];

const EMPTY_AGENT = {
  provider: 'custom', baseUrl: '', model: '', temperature: 0.3, streaming: true,
  enabled: true, autoContext: true, toolRounds: 40, hasKey: false, keyHint: '', providers: {},
  backend: 'builtin', dshUrl: 'http://127.0.0.1:7355', hasDshToken: false, dshTokenHint: '',
  dshProvider: '', dshModel: ''
};

function agentTagOf(config) {
  if ((config.backend || 'builtin') === 'dsh') return 'Harness';
  if (config.baseUrl && config.model && config.hasKey) return '已配置';
  return config.hasKey ? '缺少地址/模型' : '未配置';
}

function agentReady(config) {
  if (!config) return false;
  if ((config.backend || 'builtin') === 'dsh') return Boolean(config.dshUrl);
  return Boolean(config.baseUrl && config.model && config.hasKey);
}

export function renderSettings(root) {
  const settings = state.settings;
  const config = state.agentConfig || EMPTY_AGENT;
  root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h3>总开关</h3><p>关掉后扫描、隐私防护、脚本、智能体全部停用</p></div>
        <span class="tag ${settings.mapus_enabled ? 'ok' : ''}" id="gateTag">${settings.mapus_enabled ? '运行中' : '已停用'}</span>
      </div>
      <label class="switch-row">
        <span class="switch-text">
          <span class="switch-title">启用 MAPUS</span>
          <span class="switch-desc">停用后扩展不再注入任何脚本，也不会调用模型</span>
        </span>
        <span class="switch"><input type="checkbox" id="swMaster" ${settings.mapus_enabled ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
      </label>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>扫描设置</h3><p>控制页面加载时的自动扫描行为</p></div></div>
      <label class="switch-row">
        <span class="switch-text"><span class="switch-title">自动扫描</span><span class="switch-desc">关闭后进入页面不再自动收集，仍可手动扫描</span></span>
        <span class="switch"><input type="checkbox" id="swAuto" ${settings.masterSwitch ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
      </label>
      <label class="switch-row">
        <span class="switch-text"><span class="switch-title">动态扫描</span><span class="switch-desc">DOM 变化后自动重新分析页面内容</span></span>
        <span class="switch"><input type="checkbox" id="swDynamic" ${settings.dynamicScan ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
      </label>
      <label class="switch-row">
        <span class="switch-text"><span class="switch-title">深度扫描</span><span class="switch-desc">递归抓取并分析外链 JS，请求量更大</span></span>
        <span class="switch"><input type="checkbox" id="swDeep" ${settings.deepScan ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
      </label>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>智能体模型</h3><p>侧边栏的「智能体」对话与大屏下发的任务都走这一份配置</p></div>
        <span class="tag ${agentReady(config) ? 'ok' : ''}" id="agentTag">${agentTagOf(config)}</span>
      </div>
      <div class="field-grid">
        <label>执行后端
          <select id="agBackend">
            <option value="builtin" ${(config.backend || 'builtin') === 'dsh' ? '' : 'selected'}>内置（扩展自己跑工具循环）</option>
            <option value="dsh" ${(config.backend || 'builtin') === 'dsh' ? 'selected' : ''}>DeepSeek Harness（本地 DSH）</option>
          </select>
        </label>
      </div>
      <div id="agBuiltinBox" style="${(config.backend || 'builtin') === 'dsh' ? 'display:none' : ''}">
        <div class="field-grid">
          <label>服务商
            <select id="agProvider">
              <option value="custom" ${config.provider === 'custom' ? 'selected' : ''}>自定义</option>
              ${Object.entries(config.providers || {}).map(([id, meta]) => `<option value="${id}" ${config.provider === id ? 'selected' : ''}>${esc(meta.label)}</option>`).join('')}
            </select>
          </label>
          <label>接口地址<input id="agBase" value="${esc(config.baseUrl || '')}" placeholder="https://api.openai.com/v1"></label>
          <label>模型名称<input id="agModel" value="${esc(config.model || '')}" placeholder="gpt-4o-mini"></label>
          <label>API Key<input id="agKey" type="password" placeholder="${config.hasKey ? '已保存 ' + esc(config.keyHint) + '，留空不修改' : 'sk-...'}"></label>
          <label>温度<input id="agTemp" type="number" min="0" max="2" step="0.1" value="${Number(config.temperature) || 0.3}"></label>
          <label>单轮最大步数<input id="agRounds" type="number" min="1" max="200" value="${Number(config.toolRounds) || 40}"></label>
        </div>
        <label class="switch-row">
          <span class="switch-text"><span class="switch-title">流式输出</span><span class="switch-desc">逐字显示回复</span></span>
          <span class="switch"><input type="checkbox" id="agStream" ${config.streaming !== false ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
        </label>
      </div>
      <div id="agDshBox" style="${(config.backend || 'builtin') === 'dsh' ? '' : 'display:none'}">
        <div class="field-grid">
          <label>桥地址<input id="agDshUrl" value="${esc(config.dshUrl || 'http://127.0.0.1:7355')}" placeholder="http://127.0.0.1:7355"></label>
          <label>桥 Token<input id="agDshToken" type="password" placeholder="${config.hasDshToken ? '已保存 ' + esc(config.dshTokenHint) + '，留空不修改' : 'dsh-mapus 启动时打印的 Token'}"></label>
        </div>
        <div class="field-grid">
          <label>模型提供方
            <select id="agDshProvider">
              ${config.dshProvider
                ? `<option value="${esc(config.dshProvider)}" selected>${esc(config.dshProvider)}</option>`
                : '<option value="" selected>（沿用 dsh profile 默认）</option>'}
            </select>
          </label>
          <label>模型
            <select id="agDshModel">
              ${config.dshModel
                ? `<option value="${esc(config.dshModel)}" selected>${esc(config.dshModel)}</option>`
                : '<option value="" selected>（沿用 dsh profile 默认）</option>'}
            </select>
          </label>
        </div>
        <div class="btn-row">
          <button class="btn ghost sm" id="btnDshModels">读取可选模型</button>
        </div>
        <p class="hint-line">Provider 的地址与 Key 仍在 dsh 的 profile 里配，这里只是选用哪一个。留空＝交给 dsh 默认；dsh 默认没配好时，这一轮会在装配提示词处失败。</p>
      </div>
      <label class="switch-row">
        <span class="switch-text"><span class="switch-title">自动注入页面上下文</span><span class="switch-desc">每轮对话附带 URL、扫描计数、浏览器特征与防护状态</span></span>
        <span class="switch"><input type="checkbox" id="agContext" ${config.autoContext !== false ? 'checked' : ''}><span class="track"><span class="knob"></span></span></span>
      </label>
      <div class="btn-row">
        <button class="btn ghost" id="btnAgentTest">测试连接</button>
        <button class="btn primary" id="btnAgentSave">保存</button>
        <button class="btn ghost sm" id="btnAgentClearKey" ${config.hasKey ? '' : 'disabled'}>清除密钥</button>
      </div>
      <p class="hint-line" id="agentNote">内置后端兼容 OpenAI 接口（OpenAI / DeepSeek / Kimi / 智谱 / 通义 / Ollama 等），密钥只存在本机。</p>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>页面取证工具</h3><p>注入到当前正在浏览的页面，结果显示在页面右下角</p></div></div>
      <div class="tool-grid">
        ${TOOLS.map(tool => `<button class="tool-btn" data-tool="${tool.id}"><b>${tool.name}</b><span>${tool.desc}</span></button>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>扫描白名单</h3><p>命中的域名不再自动扫描，每行一个</p></div></div>
      <textarea class="area" id="whitelist" placeholder="example.com&#10;*.internal.corp">${esc((settings.customWhitelist || []).join('\n'))}</textarea>
      <div class="btn-row"><button class="btn ghost" id="btnWhitelist">保存白名单</button></div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>脚本语言</h3><p>影响 脚本在控制台输出的语言</p></div>
        <select id="adbLang" class="inline-select">
          <option value="auto" ${settings.adb_language === 'auto' ? 'selected' : ''}>跟随浏览器</option>
          <option value="zh_CN" ${settings.adb_language === 'zh_CN' ? 'selected' : ''}>简体中文</option>
          <option value="en" ${settings.adb_language === 'en' ? 'selected' : ''}>English</option>
        </select>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>MCP 连接</h3><p>允许本地 Agent 通过 WebSocket 控制浏览器（可选）</p></div>
        <span class="tag ${settings.adb_mcp && settings.adb_mcp.enabled ? 'ok' : ''}" id="mcpTag">${settings.adb_mcp && settings.adb_mcp.enabled ? '已启用' : '未启用'}</span>
      </div>
      <div class="field-grid">
        <label>本地服务地址<input id="mcpUrl" value="${esc((settings.adb_mcp && settings.adb_mcp.url) || 'ws://127.0.0.1:19876/extension')}"></label>
        <label>配对密钥<input id="mcpToken" type="password" value="${esc((settings.adb_mcp && settings.adb_mcp.token) || '')}" placeholder="32–256 位随机字符串"></label>
      </div>
      <div class="btn-row">
        <button class="btn ghost" id="btnMcpStop">停止</button>
        <button class="btn primary" id="btnMcpSave">启用连接</button>
      </div>
      <p class="hint-line">仅支持本机回环地址；启用后 Agent 可读取页面、执行脚本与修改脚本库。</p>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>字典与规则</h3><p>扫描字典、追踪特征、拦截列表、UA 池、第三方服务、模型预设</p></div></div>
      <div id="rulesHost"><p class="hint-line">正在读取…</p></div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>关于</h3><p>MAPUS ${esc(chrome.runtime.getManifest().version)} · 四项能力合一</p></div></div>
      <div class="btn-row">
        <button class="btn ghost" id="btnOpenAbout">关于页</button>
        <button class="btn ghost" id="btnCopyEnv">复制环境信息</button>
        <button class="btn danger" id="btnReset">重置扩展数据</button>
      </div>
    </section>`;

  bind(root);
  const host = $('#rulesHost', root);
  if (host) mountRules(host);
}

function bind(root) {
  const flag = async (id, key) => {
    const input = $(id, root);
    if (!input) return;
    input.addEventListener('change', async () => {
      await saveStore({ [key]: input.checked });
      toast('已保存', 'ok');
      if (key === 'dynamicScan' || key === 'deepScan') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (tab && /^https?:/i.test(tab.url || '')) {
          chrome.tabs.sendMessage(tab.id, {
            type: key === 'dynamicScan' ? 'UPDATE_DYNAMIC_SCAN' : 'UPDATE_DEEP_SCAN',
            enabled: input.checked
          }, () => void chrome.runtime.lastError);
        }
      }
    });
  };

  $('#swMaster', root).addEventListener('change', async event => {
    const on = event.target.checked;
    await saveStore({ mapus_enabled: on });
    setGate(on);
    const tag = $('#gateTag', root);
    if (tag) {
      tag.textContent = on ? '运行中' : '已停用';
      tag.classList.toggle('ok', on);
    }
    toast(on ? 'MAPUS 已启用' : 'MAPUS 已停用', on ? 'ok' : 'error');
    emitChange('gate');
  });

  flag('#swAuto', 'masterSwitch');
  flag('#swDynamic', 'dynamicScan');
  flag('#swDeep', 'deepScan');

  const config = state.agentConfig || EMPTY_AGENT;
  const backend = $('#agBackend', root);
  const builtinBox = $('#agBuiltinBox', root);
  const dshBox = $('#agDshBox', root);
  const provider = $('#agProvider', root);
  const base = $('#agBase', root);
  const model = $('#agModel', root);
  const dshUrl = $('#agDshUrl', root);
  const dshToken = $('#agDshToken', root);
  const dshProviderEl = $('#agDshProvider', root);
  const dshModelEl = $('#agDshModel', root);
  const usingDsh = () => backend.value === 'dsh';

  let dshCatalog = [];

  const optionsOf = (items, keep, label) => {
    const out = [`<option value="">（沿用 dsh profile 默认）</option>`];
    const list = Array.isArray(items) ? items : [];
    const has = list.some(item => String((item && item.id) || '') === keep);
    for (const item of list) {
      const id = String((item && item.id) || '');
      if (!id) continue;
      out.push(`<option value="${esc(id)}">${esc(label(item) || id)}</option>`);
    }
    if (keep && !has) out.push(`<option value="${esc(keep)}">${esc(keep)}（不在当前 profile 里）</option>`);
    return out.join('');
  };

  const syncDshModelOptions = (providerId, keepModel) => {
    if (!dshModelEl) return;
    const chosen = providerId === undefined ? (dshProviderEl ? dshProviderEl.value : '') : providerId;
    const entry = dshCatalog.find(item => String((item && item.id) || '') === chosen);
    dshModelEl.innerHTML = optionsOf(entry ? entry.models : [], keepModel || '', m => (m && m.name) || (m && m.id));
    dshModelEl.value = keepModel || '';
  };

  const applyDshCatalog = (providers, keepProvider, keepModel) => {
    dshCatalog = Array.isArray(providers) ? providers : [];
    if (dshProviderEl) {
      const wanted = keepProvider || dshProviderEl.value || '';
      dshProviderEl.innerHTML = optionsOf(dshCatalog, wanted, p => (p && p.name) || (p && p.id));
      dshProviderEl.value = wanted;
    }
    syncDshModelOptions(keepProvider || (dshProviderEl ? dshProviderEl.value : ''), keepModel || '');
  };

  if (dshProviderEl) {
    dshProviderEl.addEventListener('change', () => syncDshModelOptions(dshProviderEl.value, ''));
  }

  const btnDshModels = $('#btnDshModels', root);
  if (btnDshModels) {
    btnDshModels.addEventListener('click', async () => {
      btnDshModels.disabled = true;
      btnDshModels.textContent = '读取中…';
      const res = await agent('AGENT_DSH_MODELS', { patch: collect() });
      btnDshModels.disabled = false;
      btnDshModels.textContent = '读取可选模型';
      if (!res || !res.ok) {
        toast((res && res.error) || '读取失败', 'error');
        return;
      }
      applyDshCatalog(res.providers, dshProviderEl && dshProviderEl.value, dshModelEl && dshModelEl.value);
      const total = dshCatalog.reduce((sum, item) => sum + (Array.isArray(item && item.models) ? item.models.length : 0), 0);
      toast(`读到 ${dshCatalog.length} 个提供方 / ${total} 个模型`, 'ok');
      const note = $('#agentNote', root);
      if (note && res.current) {
        note.textContent = `桥当前默认：${res.current.provider || '未指定'} / ${res.current.model || '未指定'}`;
      }
    });
  }

  const syncBackend = () => {
    const dsh = usingDsh();
    if (builtinBox) builtinBox.style.display = dsh ? 'none' : '';
    if (dshBox) dshBox.style.display = dsh ? '' : 'none';
    const tag = $('#agentTag', root);
    if (tag) {
      const now = state.agentConfig || EMPTY_AGENT;
      tag.textContent = dsh ? 'Harness' : agentTagOf(now);
      tag.classList.toggle('ok', dsh ? Boolean(dshUrl && dshUrl.value.trim()) : agentReady(now));
    }
  };
  backend.addEventListener('change', syncBackend);

  provider.addEventListener('change', () => {
    const meta = config.providers ? config.providers[provider.value] : null;
    if (!meta) return;
    if (meta.baseUrl) base.value = meta.baseUrl;
    if (meta.model) model.value = meta.model;
  });

  const collect = () => {
    const dsh = usingDsh();
    const patch = {
      backend: dsh ? 'dsh' : 'builtin',
      autoContext: $('#agContext', root).checked
    };
    if (dsh) {
      const url = dshUrl ? dshUrl.value.trim() : '';
      if (url) patch.dshUrl = url;
      const token = dshToken ? dshToken.value.trim() : '';
      if (token) patch.dshToken = token;
      patch.dshProvider = dshProviderEl ? dshProviderEl.value : '';
      patch.dshModel = dshModelEl ? dshModelEl.value : '';
      return patch;
    }
    Object.assign(patch, {
      provider: provider.value,
      baseUrl: base.value.trim(),
      model: model.value.trim(),
      temperature: Number($('#agTemp', root).value) || 0.3,
      toolRounds: Math.max(1, Math.min(200, Number($('#agRounds', root).value) || 40)),
      streaming: $('#agStream', root).checked
    });
    return patch;
  };

  const saveAgent = async (patch, silent) => {
    const key = $('#agKey', root).value.trim();
    if (key && patch.backend !== 'dsh') patch.apiKey = key;
    const res = await agent('AGENT_CONFIG_SET', { patch });
    if (!res || !res.ok) {
      toast((res && res.error) || '保存失败', 'error');
      return null;
    }
    state.agentConfig = res.config;
    const tag = $('#agentTag', root);
    if (tag) {
      const dsh = (res.config.backend || 'builtin') === 'dsh';
      tag.textContent = agentTagOf(res.config);
      tag.classList.toggle('ok', agentReady(res.config));
      if (dsh) tag.textContent = 'Harness';
    }
    const keyInput = $('#agKey', root);
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = res.config.hasKey ? '已保存 ' + res.config.keyHint + '，留空不修改' : 'sk-...';
    }
    if (dshToken) {
      dshToken.value = '';
      dshToken.placeholder = res.config.hasDshToken
        ? '已保存 ' + res.config.dshTokenHint + '，留空不修改'
        : 'dsh-mapus 启动时打印的 Token';
    }
    if (dshUrl && res.config.dshUrl) dshUrl.value = res.config.dshUrl;
    if (!silent) {
      toast((res.config.backend || 'builtin') === 'dsh'
        ? '执行后端已切换为 DeepSeek Harness'
        : '模型配置已保存', 'ok');
    }
    emitChange('model');
    return res.config;
  };

  $('#btnAgentSave', root).addEventListener('click', async () => {
    const saved = await saveAgent(collect());
    if (saved) await refreshAgent();
  });

  $('#btnAgentTest', root).addEventListener('click', async () => {
    const patch = collect();
    const dsh = patch.backend === 'dsh';
    if (dsh) {
      const url = patch.dshUrl || (state.agentConfig && state.agentConfig.dshUrl) || '';
      if (!url && !(dshUrl && dshUrl.value.trim())) { toast('先填 DSH 桥地址', 'error'); return; }
    } else if (!patch.baseUrl || !patch.model) {
      toast('先填接口地址与模型名称', 'error'); return;
    }
    if (!dsh) {
      const key = $('#agKey', root).value.trim();
      if (key) patch.apiKey = key;
    }
    const button = $('#btnAgentTest', root);
    button.disabled = true;
    button.textContent = '测试中…';
    const note = $('#agentNote', root);
    if (note) note.textContent = dsh ? '正在请求本地 Harness 桥…' : '正在请求模型…';
    const res = await agent('AGENT_TEST', { patch });
    button.disabled = false;
    button.textContent = '测试连接';
    if (res && res.ok) {
      if (dsh) {
        toast('Harness 桥连通', 'ok');
        if (note) note.textContent = `桥正常，已声明 ${Number(res.tools) || 0} 个工具；模型与 Provider 由 dsh 的 profile 决定。`;
      } else {
        toast('连接成功 · ' + res.model, 'ok');
        if (note) note.textContent = '连通正常，模型返回：' + (res.sample || '(空)');
      }
      await saveAgent(patch, true);
      await refreshAgent();
    } else {
      const message = (res && res.error) || '连接失败';
      toast(message, 'error');
      if (note) note.textContent = message;
    }
  });

  $('#btnAgentClearKey', root).addEventListener('click', async () => {
    if (!confirm('清除本机保存的模型 API Key？')) return;
    const res = await agent('AGENT_CONFIG_SET', { patch: { clearKey: true, apiKey: '' } });
    if (!res || !res.ok) { toast('清除失败', 'error'); return; }
    state.agentConfig = res.config;
    $('#agKey', root).value = '';
    $('#agKey', root).placeholder = 'sk-...';
    $('#btnAgentClearKey', root).disabled = true;
    toast('已清除密钥', 'ok');
    emitChange('model');
  });

  $$('[data-tool]', root).forEach(button => {
    button.addEventListener('click', () => injectTool(button.dataset.tool));
  });

  $('#btnWhitelist', root).addEventListener('click', async () => {
    const list = $('#whitelist', root).value.split('\n')
      .map(item => item.trim()).filter(Boolean)
      .map(item => item.replace(/^\*\./, ''));
    await saveStore({ customWhitelist: list });
    toast(`已保存 ${list.length} 条白名单`, 'ok');
  });

  $('#adbLang', root).addEventListener('change', async event => {
    await saveStore({ adb_language: event.target.value });
    toast('语言已更新', 'ok');
  });

  $('#btnMcpSave', root).addEventListener('click', async () => {
    const url = $('#mcpUrl', root).value.trim() || 'ws://127.0.0.1:19876/extension';
    const token = $('#mcpToken', root).value.trim();
    if (token.length < 32) { toast('配对密钥至少 32 位', 'error'); return; }
    await saveStore({ adb_mcp: { enabled: true, url, token } });
    refreshSettings();
    const tag = $('#mcpTag', root);
    if (tag) { tag.textContent = '已启用'; tag.classList.add('ok'); }
    toast('已启用 MCP', 'ok');
  });

  $('#btnMcpStop', root).addEventListener('click', async () => {
    await saveStore({ adb_mcp: { enabled: false, url: 'ws://127.0.0.1:19876/extension', token: '' } });
    const tag = $('#mcpTag', root);
    if (tag) { tag.textContent = '未启用'; tag.classList.remove('ok'); }
    toast('已停止 MCP');
  });

  $('#btnOpenAbout', root).addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') + '#about' });
  });

  $('#btnCopyEnv', root).addEventListener('click', async () => {
    let page = '—';
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].url) page = tabs[0].url;
    } catch (_) {   }
    const info = [
      'MAPUS ' + chrome.runtime.getManifest().version,
      'Chrome ' + navigator.userAgent,
      '当前页: ' + page
    ].join('\n');
    toast(await copyText(info) ? '环境信息已复制' : '复制失败', 'ok');
  });

  $('#btnReset', root).addEventListener('click', async () => {
    if (!confirm('将清除 MAPUS 的全部配置（扫描设置、白名单、脚本、模型与风险记录），确定继续？')) return;
    await clearStore();
    toast('已重置，正在重新加载…', 'ok');
    setTimeout(() => location.reload(), 600);
  });
}

async function injectTool(tool) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    toast('当前没有可注入的页面（请切到一个 http 页面）', 'error');
    return;
  }
  const rules = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'MAPUS_RULES_RUNTIME' }, res => resolve(res || {}));
  });
  if (!rules || !rules.ok || !rules.rules) {
    toast('规则配置读取失败', 'error');
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: self.MAPUS_PAGEFN ? self.MAPUS_PAGEFN.applyConfig : null,
      args: [rules.rules]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', files: ['content/modules/toolkit.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', files: [`content/modules/${tool}.js`]
    });
    toast('工具已注入页面右下角', 'ok');
  } catch (error) {
    toast('注入失败：' + error.message, 'error');
  }
}
