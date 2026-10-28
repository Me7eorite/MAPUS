import { $, esc, harness, agent, toast } from '../lib.js';
import { state, refreshProfiles, refreshAgent, emitChange } from '../store.js';
import { switchTab } from '../app.js';

let editingId = '';

export function renderModels(root) {
  root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h3>设置里的智能体模型</h3><p>这是插件设置页里配好的模型，大屏可以直接选它跑任务，也可以一键存成档案</p></div>
        <button class="btn ghost sm" id="btnGotoSettings">去设置里改</button>
      </div>
      <div id="agentModelCard" class="agent-model-card"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>模型档案</h3><p>可保存多个模型，下发任务时任选一个；不配置也能直接用上面设置里的模型</p></div>
        <button class="btn ghost sm" id="btnReloadModels">刷新</button>
      </div>
      <div id="profileList" class="profile-list"></div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>${editingId ? '编辑档案' : '新增档案'}</h3><p>选服务商会自动填入地址与模型名，只填密钥即可</p></div>
        ${editingId ? '<button class="btn ghost sm" id="btnCancelEdit">取消编辑</button>' : ''}
      </div>
      <form id="profileForm" class="profile-form">
        <input type="hidden" id="pfId" value="${esc(editingId)}">
        <div class="pf-grid">
          <label>名称<input id="pfName" placeholder="主力模型" required></label>
          <label>服务商
            <select id="pfProvider"><option value="">自定义</option></select>
          </label>
          <label>接口地址<input id="pfBase" placeholder="https://api.deepseek.com/v1"></label>
          <label>模型<input id="pfModel" placeholder="deepseek-chat"></label>
          <label>API Key<input id="pfKey" type="password" placeholder="留空则沿用已保存的"></label>
          <label>温度<input id="pfTemp" type="number" min="0" max="2" step="0.1" value="0.3"></label>
          <label>max_tokens<input id="pfMax" type="number" min="256" max="32000" value="4096"></label>
        </div>
        <div class="pf-actions">
          <button type="submit" class="btn primary">保存档案</button>
          <button type="button" class="btn" id="pfTest">测试连通</button>
          <button type="button" class="btn ghost" id="pfReset">清空表单</button>
          <span id="pfMsg" class="pf-msg"></span>
        </div>
      </form>
    </section>`;

  renderAgentCard($('#agentModelCard', root));
  renderProfiles($('#profileList', root));
  fillProviders($('#pfProvider', root));
  bindForm(root);
  const cancel = $('#btnCancelEdit', root);
  if (cancel) cancel.addEventListener('click', () => { editingId = ''; renderModels(root); });
  $('#btnGotoSettings', root).addEventListener('click', () => switchTab('settings'));
  $('#btnReloadModels', root).addEventListener('click', async () => {
    await Promise.all([refreshProfiles(), refreshAgent()]);
    renderModels(root);
  });
}

function renderAgentCard(box) {
  const config = state.agentConfig;
  if (config && (config.backend || 'builtin') === 'dsh') {
    box.innerHTML = `
      <div class="am-row">
        <div class="am-main">
          <b>DeepSeek Harness（本地 DSH）</b>
          <span class="am-sub">桥 ${esc(config.dshUrl || '（未填）')} · 模型与密钥在 dsh 的 profile 里配，不能存成档案</span>
        </div>
      </div>`;
    return;
  }
  if (!config || !config.baseUrl || !config.model) {
    box.innerHTML = '<div class="empty">设置里还没配置智能体模型，点右上「去设置里改」配置，或直接在下面新建档案。</div>';
    return;
  }
  box.innerHTML = `
    <div class="am-row">
      <div class="am-main">
        <b>${esc(config.model)}</b>
        <span class="am-sub">${esc(config.baseUrl)} · 密钥 ${esc(config.hasKey ? config.keyHint : '未配置')}</span>
      </div>
      <span class="spacer"></span>
      <span class="am-actions">
        <button class="btn small" id="btnImportAgent">存为档案</button>
      </span>
    </div>`;
  const button = $('#btnImportAgent', box);
  if (button) button.addEventListener('click', () => importAgentModel(box));
}

async function importAgentModel(box) {
  const config = state.agentConfig;
  const secret = await agent('AGENT_CONFIG_SECRET');
  const key = secret && secret.ok ? String(secret.apiKey || '') : '';
  const res = await harness('PROFILE_SAVE', {
    profile: {
      name: `${config.model}（来自设置）`,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: key,
      temperature: Number(config.temperature) || 0.3,
      maxTokens: Number(config.maxTokens) || 4096
    },
    makeActive: false
  });
  if (res && res.ok) {
    toast('已存为档案', 'ok');
    await refreshProfiles();
    renderProfiles($('#profileList', box.closest('.card').parentElement));
  } else {
    toast((res && res.error) || '保存失败', 'error');
  }
}

function renderProfiles(box) {
  if (!box) return;
  if (!state.profiles.length) {
    box.innerHTML = '<div class="empty">还没有模型档案。可以直接用设置里的模型，或在下面新增。</div>';
    return;
  }
  box.innerHTML = state.profiles.map(profile => `
    <div class="profile-item${profile.id === state.activeId ? ' active' : ''}" data-id="${profile.id}">
      <span class="profile-name">${esc(profile.name)}</span>
      ${profile.id === state.activeId ? '<span class="profile-badge">默认</span>' : ''}
      <span class="spacer"></span>
      <span class="profile-meta">${esc(profile.model)} · ${esc(profile.baseUrl)}</span>
      <button class="btn small" data-act="use">设为默认</button>
      <button class="btn small" data-act="edit">编辑</button>
      <button class="btn small" data-act="test">测试</button>
      <button class="btn small danger-ghost" data-act="del">删除</button>
    </div>`).join('');
  bindProfileActions(box);
}

function bindProfileActions(box) {
  box.addEventListener('click', async event => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const id = button.closest('.profile-item').dataset.id;
    const action = button.dataset.act;
    if (action === 'use') {
      await harness('PROFILE_ACTIVE', { id });
      await refreshProfiles();
      renderProfiles(box);
      toast('已设为默认', 'ok');
      return;
    }
    if (action === 'test') {
      button.disabled = true;
      const res = await harness('PROFILE_TEST', { id });
      button.disabled = false;
      toast(res && res.ok ? `连通正常：${res.model}` : (res && res.error) || '连接失败', res && res.ok ? 'ok' : 'error');
      return;
    }
    if (action === 'del') {
      if (!confirm('删除该模型档案？')) return;
      await harness('PROFILE_DELETE', { id });
      await refreshProfiles();
      renderProfiles(box);
      return;
    }
    if (action === 'edit') {
      const full = await harness('PROFILE_GET_FULL', { id });
      const profile = (full && full.ok && full.profile) || state.profiles.find(item => item.id === id);
      if (!profile) return;
      editingId = id;
      const root = box.closest('.panel') || document;
      const form = $('#profileForm', root);
      if (!form) return;
      $('#pfId', root).value = profile.id;
      $('#pfName', root).value = profile.name || '';
      $('#pfBase', root).value = profile.baseUrl || '';
      $('#pfModel', root).value = profile.model || '';
      $('#pfKey', root).value = '';
      $('#pfKey', root).placeholder = profile.apiKey ? '已保存，留空沿用' : '';
      $('#pfTemp', root).value = profile.temperature || 0.3;
      $('#pfMax', root).value = profile.maxTokens || 4096;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function fillProviders(select) {
  if (!select) return;
  const providers = (state.agentConfig && state.agentConfig.providers) || {};
  select.innerHTML = '<option value="">自定义</option>' +
    Object.entries(providers).map(([id, meta]) => `<option value="${id}">${esc(meta.label)}</option>`).join('');
}

function bindForm(root) {
  const provider = $('#pfProvider', root);
  const base = $('#pfBase', root);
  const model = $('#pfModel', root);
  provider.addEventListener('change', () => {
    const meta = state.agentConfig && state.agentConfig.providers ? state.agentConfig.providers[provider.value] : null;
    if (!meta) return;
    if (meta.baseUrl) base.value = meta.baseUrl;
    if (meta.model) model.value = meta.model;
  });

  const msg = $('#pfMsg', root);
  const say = (text, ok) => {
    msg.textContent = text;
    msg.className = 'pf-msg ' + (ok ? 'ok' : 'bad');
    setTimeout(() => { if (msg.textContent === text) msg.textContent = ''; }, 5000);
  };

  const collect = () => ({
    id: $('#pfId', root).value || undefined,
    name: $('#pfName', root).value.trim(),
    model: model.value.trim(),
    baseUrl: base.value.trim(),
    apiKey: $('#pfKey', root).value,
    temperature: Number($('#pfTemp', root).value) || 0,
    maxTokens: Number($('#pfMax', root).value) || 4096
  });

  $('#pfReset', root).addEventListener('click', () => {
    editingId = '';
    $('#pfId', root).value = '';
    $('#profileForm', root).reset();
    $('#pfTemp', root).value = 0.3;
    $('#pfMax', root).value = 4096;
  });

  $('#pfTest', root).addEventListener('click', async () => {
    const id = $('#pfId', root).value;
    say('测试中…', true);
    const res = await harness('PROFILE_TEST', id ? { id } : { profile: collect() });
    say(res && res.ok ? `连通正常：${res.model}` : (res && res.error) || '失败', res && res.ok);
  });

  $('#profileForm', root).addEventListener('submit', async event => {
    event.preventDefault();
    const profile = collect();
    if (!profile.name || !profile.model || !profile.baseUrl) {
      say('名称、模型、接口地址都要填', false);
      return;
    }
    const res = await harness('PROFILE_SAVE', { profile, makeActive: !state.profiles.length });
    if (!res || !res.ok) { say((res && res.error) || '保存失败', false); return; }
    say('已保存', true);
    editingId = '';
    $('#profileForm', root).reset();
    $('#pfId', root).value = '';
    $('#pfTemp', root).value = 0.3;
    $('#pfMax', root).value = 4096;
    await refreshProfiles();
    renderProfiles($('#profileList', root));
    emitChange('model');
  });
}
