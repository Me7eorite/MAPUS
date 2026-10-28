import { escapeHtml, emptyState, spinner, toast, send, copyText, shortUrl } from '../ui.js';
import { refresh } from '../popup.js';

const GROUPS = [
  { id: 'antidebug', label: '调试防护', desc: '解除页面的无限断点、控制台被清屏、强制跳转等限制' },
  { id: 'hook', label: '脚本', desc: '监控 cookie、XHR、Storage、加密库等关键调用' },
  { id: 'routes', label: '框架路由', desc: '提取 Vue / React 路由表' },
  { id: 'library', label: '自定义脚本', desc: '注入自己的 MAIN 世界脚本' }
];

const SWITCH_LABELS = { debugger: '断点调试', stack: '打印调用栈' };

function ui(state) {
  if (!state.ui.hooks) {
    state.ui.hooks = { group: 'antidebug', expanded: {}, drafts: {}, framework: 'vue', routes: null, routesState: 'idle', library: null, libraryBusy: false };
  }
  return state.ui.hooks;
}

export function renderHooks(root, ctx) {
  const { state } = ctx;
  const view = ui(state);
  const group = GROUPS.some(item => item.id === view.group) ? view.group : 'antidebug';
  const adb = state.adb || {};
  const adbState = adb.state || {};
  const isGlobal = adbState.mode === 'global';
  const enabled = adbState.enabledScripts || [];
  const applied = adbState.appliedScripts || [];
  const host = adbState.hostname || (state.tab ? '' : '');

  const notices = [];
  if (adb.error) notices.push(`<div class="notice danger">脚本引擎异常：${escapeHtml(adb.error)}</div>`);
  if (adbState.registrationError) notices.push(`<div class="notice danger">脚本注册失败：${escapeHtml(adbState.registrationError.message || '')}</div>`);
  if (adbState.requiresReload) {
    notices.push(`<div class="notice">脚本配置已变更，<b>刷新页面后生效</b>。<button class="btn sm ghost" data-act="reload" style="margin-left:auto">刷新</button></div>`);
  } else if (adbState.pageReady === false && enabled.length) {
    notices.push(`<div class="notice">当前页面还没有注入脚本运行时（可能仍在加载），<b>刷新一次</b>即可生效。<button class="btn sm ghost" data-act="reload" style="margin-left:auto">刷新</button></div>`);
  } else if (!enabled.length && (group === 'antidebug' || group === 'hook')) {
    notices.push('<div class="notice info">当前域名还没有启用任何脚本。下面按需开启，刷新页面后注入；也可以在右上角切换为全局脚本。</div>');
  }

  root.innerHTML = `
    ${notices.join('')}
    <div class="seg" data-groups>
      ${GROUPS.map(item => `<button data-group="${item.id}" class="${group === item.id ? 'active' : ''}">${item.label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>生效范围</h3>
          <p>${isGlobal ? '全局模式：所有站点共享脚本组合' : '本域模式：脚本只对当前域名生效'}${host ? ' · ' + escapeHtml(host) : ''}</p>
        </div>
        <span class="tag ${enabled.length ? 'accent' : ''}">已启用 ${enabled.length}</span>
      </div>
      <div class="card-body">
        <div class="seg" data-mode>
          <button data-mode-value="standard" class="${isGlobal ? '' : 'active'}">本域脚本</button>
          <button data-mode-value="global" class="${isGlobal ? 'active' : ''}">全局脚本</button>
        </div>
        <div class="switch-row" style="margin-top:6px;border-bottom:0;padding-bottom:0">
          <span class="switch-text">
            <span class="switch-title">绕过注入检测（AntiAnti_Hook）</span>
            <span class="switch-desc">绕过页面对函数与属性的注入检测，配合上面的脚本使用</span>
          </span>
          <span class="switch">
            <input type="checkbox" data-antianti ${enabled.includes('AntiAnti_Hook') ? 'checked' : ''}>
            <span class="track"><span class="knob"></span></span>
          </span>
        </div>
      </div>
    </section>

    <div class="group-title">${escapeHtml(GROUPS.find(item => item.id === group).label)} · ${escapeHtml(GROUPS.find(item => item.id === group).desc)}</div>
    <div data-body></div>
  `;

  root.querySelector('[data-groups]').onclick = event => {
    const button = event.target.closest('[data-group]');
    if (!button) return;
    view.group = button.dataset.group;
    renderHooks(root, ctx);
    if (view.group === 'routes' && !view.routes) loadRoutes(root, ctx);
    if (view.group === 'library' && !view.library) loadLibrary(root, ctx);
  };

  root.querySelector('[data-mode]').onclick = async event => {
    const button = event.target.closest('[data-mode-value]');
    if (!button) return;
    const mode = button.dataset.modeValue;
    if ((mode === 'global') === isGlobal) return;
    try {
      await ctx.adbCommand('mode.set', { mode });
      toast(mode === 'global' ? '已切换为全局模式' : '已切换为本域模式', 'ok');
      ctx.refresh({ scan: false, fingerprints: false, anti: false, adb: true });
    } catch (error) {
      toast('切换失败：' + error.message, 'error');
    }
  };

  const antiAnti = root.querySelector('[data-antianti]');
  antiAnti.addEventListener('change', async () => {
    await toggleScript(ctx, 'AntiAnti_Hook', antiAnti.checked);
  });

  const body = root.querySelector('[data-body]');
  if (group === 'antidebug' || group === 'hook') renderScripts(body, ctx, group);
  else if (group === 'routes') renderRoutes(body, ctx);
  else renderLibrary(body, ctx);

  const reload = root.querySelector('[data-act="reload"]');
  if (reload) reload.addEventListener('click', () => {
    if (state.tab) chrome.tabs.reload(state.tab.id);
  });
}

async function applyScripts(ctx, changes, message) {
  const { state } = ctx;
  const scope = (state.adb.state && state.adb.state.mode === 'global') ? 'global' : 'hostname';
  try {
    await ctx.adbCommand('scripts.set', {
      tabId: state.tab.id,
      scope,
      changes,
      apply: 'next_navigation'
    });
    if (message) toast(message, 'ok');
  } catch (error) {
    toast('操作失败：' + error.message, 'error');
  }
  await ctx.refresh({ scan: false, fingerprints: false, anti: false, adb: true });
}

async function toggleScript(ctx, id, enabled) {
  await applyScripts(ctx, [{ id, enabled }], enabled ? '已启用，刷新页面后注入' : '已关闭');
}

function renderScripts(body, ctx, category) {
  const { state } = ctx;
  const view = ui(state);
  const catalog = (state.adb.catalog || []).filter(script => script.category === category);
  const adbState = state.adb.state || {};
  const enabled = adbState.enabledScripts || [];
  const applied = adbState.appliedScripts || [];

  if (!catalog.length) {
    body.innerHTML = spinner('正在读取脚本目录…');
    return;
  }

  body.innerHTML = catalog.map(script => {
    const isOn = enabled.includes(script.id);
    const isApplied = applied.includes(script.id);
    const expanded = view.expanded[script.id];
    const configurable = !!script.configSchema;
    const config = Object.assign({}, (adbState.configs && adbState.configs[script.id]) || view.drafts[script.id] || {});
    const props = (script.configSchema && script.configSchema.properties) || {};

    return `
      <div class="hook-card ${isOn ? 'on' : ''} ${expanded ? 'expanded' : ''}" data-card="${script.id}">
        <div class="hook-top" data-expand="${script.id}">
          <div class="hook-main">
            <div class="hook-name">
              ${escapeHtml(stripTags(script.name))}
              ${isApplied ? '<span class="tag ok">已注入</span>' : isOn ? '<span class="tag warn">待刷新</span>' : ''}
            </div>
            <div class="hook-desc">${escapeHtml(stripTags(script.description || ''))}</div>
          </div>
          <span class="switch">
            <input type="checkbox" data-toggle="${script.id}" ${isOn ? 'checked' : ''}>
            <span class="track"><span class="knob"></span></span>
          </span>
        </div>
        <div class="hook-config">
          ${configurable ? renderConfigFields(script, props, config) : `<div class="tiny muted">该脚本没有可配置参数，开启后刷新页面即可生效。</div>`}
          <div class="actions">
            ${configurable ? `<button class="btn sm ghost" data-reset="${script.id}">恢复默认</button>
            <button class="btn sm primary" data-save="${script.id}">保存配置</button>` : ''}
          </div>
          <div class="error" data-error="${script.id}"></div>
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('[data-expand]').forEach(node => {
    node.addEventListener('click', event => {
      if (event.target.closest('input')) return;
      const id = node.dataset.expand;
      view.expanded[id] = !view.expanded[id];
      node.closest('.hook-card').classList.toggle('expanded', view.expanded[id]);
    });
  });

  body.querySelectorAll('[data-toggle]').forEach(input => {
    input.addEventListener('change', event => {
      event.stopPropagation();
      const card = input.closest('.hook-card');
      if (card) card.classList.toggle('on', input.checked);
      toggleScript(ctx, input.dataset.toggle, input.checked);
    });
  });

  body.querySelectorAll('[data-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.save;
      const card = button.closest('.hook-card');
      const script = catalog.find(item => item.id === id);
      const props = (script.configSchema && script.configSchema.properties) || {};
      const patch = {};
      const valueInput = card.querySelector('[data-field="value"]');
      if (valueInput) patch.value = valueInput.value;
      const paramInput = card.querySelector('[data-field="param"]');
      if (paramInput) {
        patch.param = paramInput.value.split('\n').map(item => item.trim()).filter(Boolean);
        patch.keyword_filter_enabled = !!card.querySelector('[data-field="keyword_filter_enabled"]').checked;
      }
      for (const key of Object.keys(SWITCH_LABELS)) {
        if (!props[key]) continue;
        const toggle = card.querySelector(`[data-field="${key}"]`);
        if (toggle) patch[key] = toggle.checked ? 1 : 0;
      }
      try {
        await ctx.adbCommand('hooks.set', { scriptId: id, patch, tabId: state.tab.id, apply: 'next_navigation' });
        card.querySelector('[data-error]').textContent = '';
        toast('配置已保存，刷新页面后生效', 'ok');
        ctx.refresh({ scan: false, fingerprints: false, anti: false, adb: true });
      } catch (error) {
        card.querySelector('[data-error]').textContent = error.message;
      }
    });
  });

  body.querySelectorAll('[data-reset]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.reset;
      delete view.drafts[id];
      const card = button.closest('.hook-card');
      const paramInput = card.querySelector('[data-field="param"]');
      if (paramInput) paramInput.value = '';
      const valueInput = card.querySelector('[data-field="value"]');
      if (valueInput) valueInput.value = '';
      toast('已恢复界面默认值，保存后生效');
    });
  });
}

function renderConfigFields(script, props, config) {
  const parts = [];
  if (props.value) {
    parts.push(`
      <label class="field">
        <span class="field-name">固定返回值 value</span>
        <input type="text" data-field="value" value="${escapeHtml(config.value !== undefined ? config.value : (script.value || ''))}" placeholder="例如 0 或自定义字符串">
      </label>`);
  }
  if (props.param) {
    parts.push(`
      <label class="field">
        <span class="field-name">关注的关键字（每行一个，留空表示全部）</span>
        <textarea data-field="param" rows="3" placeholder="例如 token&#10;Authorization">${escapeHtml((config.param || []).join('\n'))}</textarea>
      </label>
      <label class="switch-row" style="border:0;padding:2px 0">
        <span class="switch-text"><span class="switch-title">仅显示命中关键字</span></span>
        <span class="switch">
          <input type="checkbox" data-field="keyword_filter_enabled" ${config.keyword_filter_enabled ? 'checked' : ''}>
          <span class="track"><span class="knob"></span></span>
        </span>
      </label>`);
  }
  for (const [key, label] of Object.entries(SWITCH_LABELS)) {
    if (!props[key]) continue;
    parts.push(`
      <label class="switch-row" style="border:0;padding:2px 0">
        <span class="switch-text"><span class="switch-title">${label}</span></span>
        <span class="switch">
          <input type="checkbox" data-field="${key}" ${Number(config[key]) === 1 ? 'checked' : ''}>
          <span class="track"><span class="knob"></span></span>
        </span>
      </label>`);
  }
  if (!parts.length) return '<div class="tiny muted">该脚本无需额外配置。</div>';
  return parts.join('');
}

function renderRoutes(body, ctx) {
  const { state } = ctx;
  const view = ui(state);
  const framework = view.framework || 'vue';
  const data = view.routes;

  body.innerHTML = `
    <div class="seg" data-fw>
      <button data-fw-value="vue" class="${framework === 'vue' ? 'active' : ''}">Vue Router</button>
      <button data-fw-value="react" class="${framework === 'react' ? 'active' : ''}">React Router</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn" data-act="scan-fw">${data ? '重新提取' : '提取路由'}</button>
      <button class="btn ghost" data-act="copy">复制</button>
    </div>
    <div data-routes style="margin-top:10px"></div>
  `;

  body.querySelector('[data-fw]').onclick = event => {
    const button = event.target.closest('[data-fw-value]');
    if (!button) return;
    view.framework = button.dataset.fwValue;
    view.routes = null;
    renderRoutes(body, ctx);
  };
  body.querySelector('[data-act="scan-fw"]').addEventListener('click', () => loadRoutes(body.closest('.view'), ctx, true));
  body.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const list = routesOf(view.routes, view.framework);
    if (!list.length) return toast('暂无可复制的路由', 'error');
    const text = list.map(item => item.path).filter(Boolean).join('\n');
    toast(await copyText(text) ? '路由已复制' : '复制失败', 'ok');
  });

  const container = body.querySelector('[data-routes]');
  if (view.routesState === 'loading') {
    container.innerHTML = spinner('正在从页面提取路由…首次可能需要几秒');
    return;
  }
  if (!data) {
    container.innerHTML = `<div class="notice info">需要先在“${framework === 'vue' ? '调试防护' : '框架路由'}”里启用对应脚本（Vue：获取路由 / React：获取路由），刷新页面后再提取。</div>`;
    return;
  }
  const list = routesOf(data, framework);
  if (!list.length) {
    const entry = entryOf(data, framework) || {};
    const required = Array.isArray(entry.requiredScripts) ? entry.requiredScripts : [];
    const reason = entry.status === 'script_disabled'
      ? `还需要先在「调试防护」分组启用路由脚本（${required.join(' / ') || 'Get_Vue'}），刷新页面后再提取`
      : entry.status === 'timeout'
        ? '提取超时，页面可能未使用该框架或尚未加载完成'
        : entry.status === 'content_unavailable'
          ? '内容脚本未就绪，请刷新页面'
          : entry.status === 'serialization_error'
            ? '路由数据无法序列化，换一个框架页面试试'
            : '未发现路由（可能未使用该框架的路由库）';
    const enabled = (state.adb.state && state.adb.state.enabledScripts) || [];
    const allOn = required.length > 0 && required.every(id => enabled.includes(id));
    container.innerHTML = `
      <div class="notice ${allOn ? 'info' : ''}">${allOn
        ? `路由脚本（${escapeHtml(required.join(' / '))}）已启用，刷新页面后点击“重新提取”`
        : escapeHtml(reason)}</div>
      <div class="btn-row" style="margin-top:8px">
        ${required.length && !allOn ? '<button class="btn primary" data-act="enable-routes">一键启用路由脚本</button>' : ''}
        <button class="btn ${required.length && !allOn ? 'ghost' : 'primary'}" data-act="reload-page">刷新页面</button>
      </div>`;
    const reload = container.querySelector('[data-act="reload-page"]');
    reload.addEventListener('click', () => {
      if (state.tab) chrome.tabs.reload(state.tab.id);
      toast('已刷新页面，稍后再提取一次');
    });
    const enable = container.querySelector('[data-act="enable-routes"]');
    if (enable) {
      enable.addEventListener('click', async () => {
        enable.disabled = true;
        enable.textContent = '正在启用…';
        await applyScripts(ctx, required.map(id => ({ id, enabled: true })), '已启用路由脚本，刷新页面后生效');
        view.routes = null;
        view.routesState = 'idle';
        const holder = body.isConnected ? body : document.querySelector('.view[data-view="hooks"] [data-body]');
        if (holder) renderRoutes(holder, ctx);
      });
    }
    return;
  }
  container.innerHTML = `
    <div class="card">
      <div class="section-head"><span class="name">${framework === 'vue' ? 'Vue' : 'React'} 路由</span><span class="count">${list.length}</span></div>
      <div class="route-list">
        ${list.map(item => `
          <div class="route-row" data-path="${escapeHtml(item.path || '')}">
            <span class="m">${escapeHtml(item.method || (framework === 'vue' ? 'ROUTE' : 'PATH'))}</span>
            <span class="p">${escapeHtml(item.path || '(未命名)')}</span>
            <span class="n">${escapeHtml(item.name || '')}</span>
          </div>`).join('')}
      </div>
    </div>`;
  container.querySelectorAll('.route-row').forEach(row => {
    row.addEventListener('click', async () => {
      const path = row.dataset.path;
      if (!path) return;
      toast(await copyText(path) ? '路由已复制' : '复制失败', 'ok');
    });
  });
}

function entryOf(routes, framework) {
  if (!routes) return null;
  const results = Array.isArray(routes.results) ? routes.results : [routes];
  return results.find(item => item && item.framework === framework) || results[0] || null;
}

function routesOf(routes, framework) {
  const target = entryOf(routes, framework);
  if (!target || !target.data) return [];
  const data = target.data;
  let list = [];
  if (Array.isArray(data.routes)) list = data.routes;
  else if (data.type === 'MULTIPLE_INSTANCES' && Array.isArray(data.instances)) {
    for (const instance of data.instances) {
      if (Array.isArray(instance.routes)) list = list.concat(instance.routes);
      else if (Array.isArray(instance)) list = list.concat(instance);
    }
  } else if (Array.isArray(data)) list = data;
  return list.map(item => {
    if (typeof item === 'string') return { path: item, name: '' };
    return { path: item.path || item.fullPath || item.route || '', name: item.name || '', method: item.method || '' };
  }).filter(item => item.path);
}

async function loadRoutes(root, ctx, rescan = false) {
  const { state } = ctx;
  const view = ui(state);
  view.routesState = 'loading';
  view.routes = view.routes || null;
  renderRoutes(root.querySelector('[data-body]'), ctx);
  try {
    const result = await ctx.adbCommand('routes.get', { tabId: state.tab.id, framework: view.framework, rescan });
    view.routes = result;
    view.routesState = 'done';
  } catch (error) {
    view.routes = { results: [{ framework: view.framework, status: 'error', message: error.message }] };
    view.routesState = 'done';
    toast('提取失败：' + error.message, 'error');
  }
  renderRoutes(root.querySelector('[data-body]'), ctx);
}

function renderLibrary(body, ctx) {
  const { state } = ctx;
  const view = ui(state);
  const library = view.library;

  if (view.libraryBusy && !library) {
    body.innerHTML = spinner('正在读取脚本库…');
    return;
  }
  if (!library) {
    body.innerHTML = `
      ${emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v4h4"/></svg>',
        '尚未读取脚本库', '脚本库会在匹配页面加载时以 MAIN 世界注入。')}
      <button class="btn primary wide" data-act="load">读取脚本库</button>
      <button class="btn wide" data-act="new" style="margin-top:8px">新建脚本</button>`;
    body.querySelector('[data-act="load"]').addEventListener('click', () => loadLibrary(body.closest('.view'), ctx));
    body.querySelector('[data-act="new"]').addEventListener('click', () => openEditor(body.closest('.view'), ctx, null));
    return;
  }

  const status = library.status || {};
  const scripts = library.scripts || [];
  body.innerHTML = `
    <div class="notice ${status.available === false ? 'danger' : 'info'}">
      ${status.available === false
        ? '用户脚本 API 不可用：请到 chrome://extensions 打开本扩展的“允许用户脚本”（Chrome 138+）或启用开发者模式。'
        : `脚本库共 ${scripts.length} 个脚本，启用后于下次页面加载时注入。`}
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn" data-act="refresh">刷新</button>
      <button class="btn primary" data-act="new">新建脚本</button>
    </div>
    <div data-lib style="margin-top:10px">
      ${scripts.length ? scripts.map(script => `
        <div class="hook-card ${script.enabled ? 'on' : ''}">
          <div class="hook-top">
            <div class="hook-main">
              <div class="hook-name">${escapeHtml(script.name || script.id)}</div>
              <div class="hook-desc">${escapeHtml((script.matches || []).join(' , ') || '未设置匹配规则')}</div>
            </div>
            <span class="switch">
              <input type="checkbox" data-lib-toggle="${escapeHtml(script.id)}" ${script.enabled ? 'checked' : ''}>
              <span class="track"><span class="knob"></span></span>
            </span>
          </div>
          <div class="actions" style="display:flex;gap:6px;padding:6px 10px;border-top:1px dashed var(--border)">
            <button class="btn sm ghost" data-lib-view="${escapeHtml(script.id)}">查看 / 编辑</button>
            <button class="btn sm danger" data-lib-del="${escapeHtml(script.id)}">删除</button>
          </div>
        </div>`).join('')
      : `<div class="notice">脚本库为空，点击“新建脚本”添加。</div>`}
    </div>
    <div data-modal></div>
  `;

  body.querySelector('[data-act="refresh"]').addEventListener('click', () => loadLibrary(body.closest('.view'), ctx));
  body.querySelector('[data-act="new"]').addEventListener('click', () => openEditor(body.closest('.view'), ctx, null));
  body.querySelectorAll('[data-lib-toggle]').forEach(input => {
    input.addEventListener('change', async () => {
      try {
        await ctx.adbCommand('library.setEnabled', { id: input.dataset.libToggle, enabled: input.checked, expectedRevision: library.revision });
        toast('已更新，下次页面加载生效', 'ok');
        loadLibrary(body.closest('.view'), ctx);
      } catch (error) {
        toast('更新失败：' + error.message, 'error');
        loadLibrary(body.closest('.view'), ctx);
      }
    });
  });
  body.querySelectorAll('[data-lib-view]').forEach(button => {
    button.addEventListener('click', () => openEditor(body.closest('.view'), ctx, button.dataset.libView));
  });
  body.querySelectorAll('[data-lib-del]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('确定删除该脚本？')) return;
      const response = await send({ type: 'ADB_LIBRARY_DELETE', id: button.dataset.libDel });
      if (response && response.ok) {
        toast('脚本已删除', 'ok');
        loadLibrary(body.closest('.view'), ctx);
      } else {
        toast('删除失败：' + ((response && response.error && response.error.message) || '未知错误'), 'error');
      }
    });
  });
}

async function loadLibrary(root, ctx) {
  const view = ui(ctx.state);
  view.libraryBusy = true;
  renderLibrary(root.querySelector('[data-body]'), ctx);
  try {
    const result = await ctx.adbCommand('library.list', {});
    view.library = result;
  } catch (error) {
    view.library = { revision: 0, scripts: [], status: { available: false, reason: error.message } };
    toast('读取失败：' + error.message, 'error');
  }
  view.libraryBusy = false;
  renderLibrary(root.querySelector('[data-body]'), ctx);
}

async function openEditor(root, ctx, id) {
  const view = ui(ctx.state);
  const revision = (view.library && view.library.revision) || 0;
  let draft = { id: '', name: '', matches: '', code: '', enabled: true };
  if (id) {
    try {
      const result = await ctx.adbCommand('library.get', { id });
      if (result && result.script) {
        draft = {
          id: result.script.id,
          name: result.script.name || '',
          matches: (result.script.matches || []).join('\n'),
          code: result.script.code || '',
          enabled: result.script.enabled !== false
        };
      }
    } catch (error) {
      toast('读取脚本失败：' + error.message, 'error');
      return;
    }
  } else {
    draft.id = 'custom_' + Date.now().toString(36);
  }

  const holder = root.querySelector('[data-modal]');
  holder.innerHTML = `
    <div class="card">
      <div class="card-head"><div><h3>${id ? '编辑脚本' : '新建脚本'}</h3><p>保存后在匹配页面下次加载时注入</p></div></div>
      <div class="card-body">
        <div class="field-row" style="margin-bottom:8px">
          <span class="label">脚本 ID</span>
          <input class="input" data-edit="id" value="${escapeHtml(draft.id)}" ${id ? 'disabled' : ''}>
        </div>
        <div class="field-row" style="margin-bottom:8px">
          <span class="label">名称</span>
          <input class="input" data-edit="name" value="${escapeHtml(draft.name)}" placeholder="例如：拦截目标站点的加解密">
        </div>
        <div class="field-row" style="margin-bottom:8px">
          <span class="label">匹配规则（每行一条）</span>
          <textarea class="input" data-edit="matches" rows="2" placeholder="https://example.com/*">${escapeHtml(draft.matches)}</textarea>
        </div>
        <div class="field-row">
          <span class="label">脚本内容</span>
          <textarea class="input" data-edit="code" rows="8" placeholder="// 在 MAIN 世界执行">${escapeHtml(draft.code)}</textarea>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost" data-act="cancel">取消</button>
          <button class="btn primary" data-act="save">保存</button>
        </div>
        <div class="error tiny" data-edit-error style="color:var(--danger);margin-top:6px"></div>
      </div>
    </div>`;

  holder.querySelector('[data-act="cancel"]').addEventListener('click', () => { holder.innerHTML = ''; });
  holder.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const payload = {
      type: 'ADB_LIBRARY_SAVE',
      id: holder.querySelector('[data-edit="id"]').value.trim(),
      name: holder.querySelector('[data-edit="name"]').value.trim(),
      matches: holder.querySelector('[data-edit="matches"]').value.split('\n').map(item => item.trim()).filter(Boolean),
      code: holder.querySelector('[data-edit="code"]').value,
      enabled: true
    };
    if (!payload.code.trim()) {
      holder.querySelector('[data-edit-error]').textContent = '脚本内容不能为空';
      return;
    }
    const response = await send(payload);
    if (response && response.ok) {
      toast('脚本已保存', 'ok');
      holder.innerHTML = '';
      loadLibrary(root, ctx);
    } else {
      holder.querySelector('[data-edit-error]').textContent = (response && response.error && response.error.message) || '保存失败';
    }
  });
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]+>/g, '').trim();
}
