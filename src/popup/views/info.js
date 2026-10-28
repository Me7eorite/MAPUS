import { escapeHtml, emptyState, spinner, toast, copyText, send, shortUrl } from '../ui.js';

const SECTIONS = [
  { key: 'absoluteApis', label: 'API 绝对路径', tone: 'accent', api: true },
  { key: 'apis', label: 'API 相对路径', tone: 'accent', api: true },
  { key: 'urls', label: 'URL', tone: 'accent' },
  { key: 'domains', label: '域名' },
  { key: 'moduleFiles', label: '模块路径' },
  { key: 'jsFiles', label: 'JS 文件' },
  { key: 'vueFiles', label: 'Vue 文件' },
  { key: 'docFiles', label: '文档文件' },
  { key: 'imageFiles', label: '音视频 / 图片' },
  { key: 'credentials', label: '用户名密码', tone: 'danger' },
  { key: 'cookies', label: 'Cookie', tone: 'danger' },
  { key: 'idKeys', label: 'ID / 密钥', tone: 'danger' },
  { key: 'jwts', label: 'JWT Token', tone: 'danger' },
  { key: 'idcards', label: '身份证号', tone: 'danger' },
  { key: 'phones', label: '手机号', tone: 'warn' },
  { key: 'emails', label: '邮箱', tone: 'warn' },
  { key: 'ips', label: 'IP 地址' },
  { key: 'companies', label: '公司机构' },
  { key: 'githubUrls', label: 'GitHub 链接' },
  { key: 'customHits', label: '自定义命中', tone: 'accent' }
];

const FP_LABELS = {
  server: '服务器', os: '系统', framework: '框架', technology: '技术',
  component: '组件', cdn: 'CDN', panel: '面板', security: '安全',
  analytics: '分析', builder: '构建'
};

const SKIP_LABELS = {
  'not-configured': '未配置接口',
  disabled: '未启用',
  'no-url': '缺少接口地址',
  'no-key': '缺少密钥'
};

function ui(state) {
  if (!state.ui.info) state.ui.info = { sub: 'scan', query: '', type: 'all', limit: 120, analysis: null, loading: false };
  return state.ui.info;
}

export function renderInfo(root, ctx) {
  const { state } = ctx;
  const view = ui(state);
  const subs = [
    { id: 'scan', label: '敏感数据' },
    { id: 'fingerprint', label: '技术栈' },
    { id: 'analysis', label: '站点画像' }
  ];

  if (!state.tab || !/^(https?|file):/i.test(state.tab.url || '')) {
    root.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/></svg>',
      '当前页面不可检测', '请切换到普通网页后再查看信息。');
    return;
  }

  const segHtml = `<div class="seg" data-seg>${subs.map(sub =>
    `<button data-sub="${sub.id}" class="${view.sub === sub.id ? 'active' : ''}">${sub.label}</button>`).join('')}</div>`;

  root.innerHTML = segHtml + '<div data-body></div>';
  root.querySelector('[data-seg]').onclick = event => {
    const button = event.target.closest('[data-sub]');
    if (!button || button.dataset.sub === view.sub) return;
    view.sub = button.dataset.sub;
    renderInfo(root, ctx);
    if (view.sub === 'analysis' && !view.analysis && !view.loading) loadAnalysis(root, ctx);
  };

  const body = root.querySelector('[data-body]');
  if (view.sub === 'scan') renderScan(body, ctx);
  else if (view.sub === 'fingerprint') renderFingerprints(body, ctx);
  else {
    renderAnalysis(body, ctx);
    if (!view.analysis && !view.loading) loadAnalysis(root, ctx);
  }
}

function renderScan(body, ctx) {
  const { state } = ctx;
  const view = ui(state);
  if (!state.contentReady) {
    body.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
      '内容脚本未就绪', '刷新页面后 MAPUS 会重新扫描。');
    return;
  }
  const results = state.results || {};
  const available = SECTIONS.map(section => ({
    ...section,
    items: Array.isArray(results[section.key]) ? results[section.key] : []
  })).filter(section => section.items.length);

  const total = available.reduce((sum, section) => sum + section.items.length, 0);
  if (!total) {
    body.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>',
      '未发现敏感数据', '可尝试开启“深度扫描”，或在设置里减少白名单限制。');
    return;
  }

  const chips = [{ key: 'all', label: '全部', count: total }].concat(
    available.map(section => ({ key: section.key, label: section.label, count: section.items.length }))
  );
  if (!chips.some(chip => chip.key === view.type)) view.type = 'all';

  const active = view.type === 'all' ? null : available.find(section => section.key === view.type);
  const list = active ? active.items : available.flatMap(section => section.items.map(item => ({ item, section })));
  const query = (view.query || '').trim().toLowerCase();
  const filtered = query
    ? list.filter(entry => {
      const item = entry.item || entry;
      const value = Array.isArray(item) ? item[0] : item;
      return String(value).toLowerCase().includes(query);
    })
    : list;

  body.innerHTML = `
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>
      <input type="text" data-query placeholder="搜索结果…" value="${escapeHtml(view.query || '')}">
    </div>
    <div class="chips">
      ${chips.map(chip => `<button class="chip ${chip.key === view.type ? 'on' : ''}" data-chip="${chip.key}">${escapeHtml(chip.label)}<i>${chip.count}</i></button>`).join('')}
    </div>
    <div class="card">
      <div class="section-head">
        <span class="name">${active ? escapeHtml(active.label) : '全部结果'}</span>
        <span class="count">${filtered.length}</span>
        <span class="spacer"></span>
        <button data-copy-all title="复制当前列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>
        </button>
        ${active && active.api ? `<button data-copy-url title="复制为完整 URL">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1H11V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12z"/><path d="M8 13h8v-2H8z"/><path d="M17 7h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>
        </button>` : ''}
      </div>
      <div class="card-body flush">
        <div class="item-list" data-items>
          ${filtered.slice(0, view.limit).map(entry => {
            const item = entry.item || entry;
            const value = Array.isArray(item) ? item[0] : String(item);
            const source = Array.isArray(item) ? item[1] : '';
            return `<div class="item" data-value="${escapeHtml(value)}" data-source="${escapeHtml(source || '')}" title="${escapeHtml(source || '点击复制')}">
              <span>${escapeHtml(value)}</span>
              <button title="复制"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></button>
            </div>`;
          }).join('')}
        </div>
        ${filtered.length > view.limit ? `<div style="padding:8px 12px"><button class="btn ghost sm wide" data-more>显示更多（剩余 ${filtered.length - view.limit} 条）</button></div>` : ''}
      </div>
    </div>
  `;

  const queryInput = body.querySelector('[data-query]');
  queryInput.addEventListener('input', () => {
    view.query = queryInput.value;
    view.limit = 120;
    const caret = queryInput.selectionStart;
    renderScan(body, ctx);
    const next = body.querySelector('[data-query]');
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
  });

  body.querySelectorAll('[data-chip]').forEach(button => {
    button.addEventListener('click', () => {
      view.type = button.dataset.chip;
      view.limit = 120;
      renderScan(body, ctx);
    });
  });

  body.querySelectorAll('.item').forEach(node => {
    node.addEventListener('click', async event => {
      const value = node.dataset.value;
      if (event.ctrlKey || event.metaKey) {
        const source = node.dataset.source;
        if (source) {
          chrome.tabs.create({ url: source });
          toast('已在新标签页打开来源');
          return;
        }
      }
      if (event.target.closest('button')) {
        event.stopPropagation();
      }
      toast(await copyText(value) ? '已复制：' + shortUrl(value, 32) : '复制失败', 'ok');
    });
  });

  const copyAll = body.querySelector('[data-copy-all]');
  copyAll.addEventListener('click', async () => {
    const text = filtered.map(entry => {
      const item = entry.item || entry;
      return Array.isArray(item) ? item[0] : String(item);
    }).join('\n');
    toast(await copyText(text) ? `已复制 ${filtered.length} 条` : '复制失败', 'ok');
  });

  const copyUrl = body.querySelector('[data-copy-url]');
  if (copyUrl) {
    copyUrl.addEventListener('click', async () => {
      let origin = '';
      try { origin = new URL(state.tab.url).origin; } catch (_) { origin = ''; }
      const text = filtered.map(entry => {
        const item = entry.item || entry;
        const value = Array.isArray(item) ? item[0] : String(item);
        if (view.type === 'absoluteApis') return origin + value;
        try { return new URL(value, state.tab.url).href; } catch (_) { return origin + value; }
      }).join('\n');
      toast(await copyText(text) ? '完整 URL 已复制' : '复制失败', 'ok');
    });
  }

  const more = body.querySelector('[data-more]');
  if (more) more.addEventListener('click', () => { view.limit += 200; renderScan(body, ctx); });
}

function renderFingerprints(body, ctx) {
  const { state } = ctx;
  const list = state.fingerprints || [];
  if (!list.length) {
    body.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3c3 0 5 2 5 5v4c0 5-2 8-5 8"/><path d="M8 8a4 4 0 0 1 8 0v3"/><path d="M12 12v3"/></svg>',
      '暂未识别到技术栈', '特征来自响应头、Cookie 与追踪脚本，重新加载页面后更准确。');
    return;
  }
  const groups = {};
  for (const item of list) (groups[item.type] = groups[item.type] || []).push(item);

  body.innerHTML = `
    <div class="notice info">共识别到 <b>${list.length}</b> 项特征，覆盖 ${Object.keys(groups).length} 类技术栈。</div>
    ${Object.entries(groups).map(([type, items]) => `
      <div style="margin-top:10px">
        <div class="group-title">${escapeHtml(FP_LABELS[type] || type)} · ${items.length}</div>
        <div class="fp-grid" style="margin-top:6px">
          ${items.map(item => `
            <div class="fp-item">
              <span class="fp-type">${escapeHtml(type)}</span>
              <div class="fp-body">
                <div class="fp-name">${escapeHtml(item.name)}${item.value && item.value !== item.name ? `<span class="muted tiny"> ${escapeHtml(item.value)}</span>` : ''}</div>
                <div class="fp-desc">${escapeHtml(item.description || '')}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  `;
}

function renderAnalysis(body, ctx) {
  const { state } = ctx;
  const view = ui(state);
  if (view.loading) {
    body.innerHTML = spinner('正在获取备案 / 权重 / IP 信息…');
    return;
  }
  const data = view.analysis;
  if (!data) {
    body.innerHTML = `
      ${emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16"/></svg>',
        '尚未获取站点画像', '包含 ICP 备案、搜索引擎权重与 IP 归属信息。')}
      <button class="btn primary wide" data-load>立即查询</button>`;
    body.querySelector('[data-load]').addEventListener('click', () => {
      const root = body.closest('.view');
      loadAnalysis(root, ctx);
    });
    return;
  }
  if (data.error) {
    body.innerHTML = `<div class="notice danger">${escapeHtml(data.error)}</div>`;
    return;
  }
  if (data.isPrivateIP) {
    body.innerHTML = `<div class="notice info">内网地址，无需查询备案与权重。</div>`;
    return;
  }
  const icp = data.icp || {};
  const ip = data.ip || {};
  const weight = data.weight || {};
  const skipped = (data.services && data.services.skipped) || {};
  const errors = (data.services && data.services.errors) || {};
  const services = view.services || {};
  const engines = Array.isArray(services.seoEngines) ? services.seoEngines : [];
  const seoImage = services.seoImage || '';
  const kv = (label, value) => `<div class="kv-row"><span class="k">${label}</span><span class="v">${escapeHtml(value || '未知')}</span></div>`;

  const notice = key => {
    if (errors[key]) return `<div class="notice warn">查询失败：${escapeHtml(errors[key])}</div>`;
    const reason = skipped[key];
    if (!reason) return '';
    return `<div class="notice info">${escapeHtml(SKIP_LABELS[reason] || '未配置')}——在「设置 → 字典与规则 → 第三方数据服务」里填写后即可显示。</div>`;
  };

  const engineCell = engine => {
    const value = weight[engine.id] || 'n';
    const src = seoImage
      ? seoImage.replace('{id}', encodeURIComponent(engine.id)).replace('{value}', encodeURIComponent(value))
      : '';
    return `<div class="weight">
      ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(engine.name)}" onerror="this.style.visibility='hidden'">` : ''}
      <div class="w-val">${escapeHtml(value)}</div>
      <div class="w-name">${escapeHtml(engine.name)}</div>
    </div>`;
  };

  body.innerHTML = `
    <section class="card">
      <div class="card-head"><div><h3>备案信息</h3><p>${escapeHtml(new URL(state.tab.url).hostname)}</p></div>
        <button class="btn ghost sm" data-reload>刷新</button>
      </div>
      <div class="card-body">
        ${notice('icp')}
        <div class="kv">
          ${kv('备案号', icp.icp)}
          ${kv('主办单位', icp.unit)}
          ${kv('备案时间', icp.time)}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>搜索引擎权重</h3><p>来源：第三方权重接口，仅供参考</p></div></div>
      <div class="card-body">
        ${notice('weight')}
        ${(skipped.weight || errors.weight) ? '' : (engines.length ? `<div class="weight-grid">${engines.map(engineCell).join('')}</div>` : '<p class="tiny muted">未配置搜索引擎列表</p>')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>IP 与网络</h3></div></div>
      <div class="card-body">
        ${notice('ip')}
        <div class="kv">
          ${kv('IP', ip.ip)}
          ${kv('地理位置', ip.location)}
          ${kv('运营商', ip.isp)}
          ${kv('邮政编码', ip.zipcode)}
          ${kv('协议', ip.protocol)}
          ${kv('网络类型', ip.net)}
        </div>
      </div>
    </section>
  `;
  const reload = body.querySelector('[data-reload]');
  if (reload) reload.addEventListener('click', () => {
    view.analysis = null;
    loadAnalysis(body.closest('.view'), ctx);
  });
}

async function loadAnalysis(root, ctx) {
  const { state } = ctx;
  const view = ui(state);
  if (!state.tab) return;
  view.loading = true;
  renderAnalysis(root.querySelector('[data-body]'), ctx);
  let domain = '';
  try { domain = new URL(state.tab.url).hostname; } catch (_) { domain = ''; }

  if (!view.services) {
    const rules = await send({ type: 'MAPUS_RULES_EXPORT' });
    if (rules && rules.ok && rules.rules && rules.rules.services) {
      view.services = rules.rules.services;
    }
  }

  const response = await send({ type: 'GET_SITE_ANALYSIS', to: 'background', domain, tabId: state.tab.id });
  view.loading = false;
  if (!response) {
    view.analysis = { error: '查询失败：网络不可用或接口限流，稍后重试。' };
  } else {
    view.analysis = response;
  }
  renderAnalysis(root.querySelector('[data-body]'), ctx);
}
