import { $, escapeHtml, emptyState, shortUrl, toast, send, copyText, timeAgo } from '../ui.js';
import { countFindings, securityFindings, refresh, switchView } from '../popup.js';

function sum(results, keys) {
  if (!results) return 0;
  return keys.reduce((total, key) => total + (Array.isArray(results[key]) ? results[key].length : 0), 0);
}

const LEVEL_TEXT = { danger: '高危', warn: '关注', info: '提示' };

export function renderOverview(root, ctx) {
  const { state } = ctx;
  const tab = state.tab;
  const inspectable = tab && /^(https?|file):/i.test(tab.url || '');

  if (!tab) {
    root.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
      '没有可检测的标签页', '打开一个网页后点击扩展图标即可开始。');
    return;
  }
  if (!inspectable) {
    root.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/></svg>',
      '当前页面不支持检测', 'chrome:// 与扩展商店等内部页面无法注入脚本，请切换到普通网页。');
    return;
  }
  if (!state.contentReady) {
    root.innerHTML = emptyState('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
      '内容脚本未就绪', '刷新当前页面后 MAPUS 会自动重新扫描。');
    return;
  }

  const results = state.results;
  const total = countFindings(results);
  const findings = securityFindings();
  const antiFindings = (state.anti && state.anti.findings) || [];
  const blocks = (state.anti && state.anti.blocks) || 0;
  const enabledHooks = (state.adb.state && state.adb.state.enabledScripts) || [];
  const fingerprints = state.fingerprints || [];
  const critical = sum(results, ['idcards', 'credentials', 'idKeys', 'cookies']);
  const dangerFindings = findings.filter(item => item.level === 'danger').length;
  const dangerAnti = antiFindings.filter(item => item.level === 'danger').length;

  const conclusion = (() => {
    if (dangerFindings || dangerAnti || critical > 0) {
      return { title: '发现高风险特征', tone: 'danger', desc: '页面存在凭据类敏感数据或调试防护/追踪特征，建议结合 脚本与网络面板进一步确认。' };
    }
    if (total > 0 || antiFindings.length) {
      return { title: '已收集到可分析线索', tone: 'warn', desc: '存在可用的接口、路径或浏览器特征信息，可继续在信息与 脚本面板中深挖。' };
    }
    return { title: '暂未发现明显风险', tone: 'ok', desc: '当前页面未命中敏感数据规则，可手动重新扫描或降低扫描深度限制。' };
  })();

  const tags = [
    total ? `<span class="tag accent">敏感数据 ${total}</span>` : '',
    dangerFindings ? `<span class="tag danger">调试防护 ${dangerFindings}</span>` : '',
    dangerAnti ? `<span class="tag danger">追踪特征 ${dangerAnti}</span>` : '',
    blocks ? `<span class="tag warn">已拦截 ${blocks}</span>` : '',
    fingerprints.length ? `<span class="tag">特征 ${fingerprints.length}</span>` : '',
    enabledHooks.length ? `<span class="tag">脚本 ${enabledHooks.length}</span>` : ''
  ].filter(Boolean).join('') || '<span class="tag ok">干净</span>';

  const stats = [
    { key: 'api', label: 'API / 路径', value: sum(results, ['apis', 'absoluteApis', 'urls']), tone: 'accent', view: 'info', sub: 'scan' },
    { key: 'leak', label: '凭据 / 身份', value: critical, tone: critical ? 'danger' : 'ok', view: 'info', sub: 'scan' },
    { key: 'fp', label: '技术栈', value: fingerprints.length, tone: 'accent', view: 'info', sub: 'fingerprint' },
    { key: 'block', label: '拦截追踪', value: blocks, tone: blocks ? 'warn' : 'ok', view: 'anti', sub: '' }
  ];

  const findingRows = findings.length
    ? findings.slice(0, 6).map(item => `
      <div class="row">
        <span class="row-badge ${item.level === 'danger' ? 'danger' : item.level === 'warn' ? 'warn' : 'accent'}">${LEVEL_TEXT[item.level] || '提示'}</span>
        <div class="row-main">
          <div class="row-title">${escapeHtml(item.text || '')}</div>
          <div class="row-sub">${escapeHtml(item.detail || '')}${item.source ? ' · ' + escapeHtml(shortUrl(item.source, 40)) : ''}</div>
        </div>
      </div>`).join('')
    : `<div class="row"><span class="row-badge ok">正常</span><div class="row-main"><div class="row-title">未检出无限 debugger / 混淆 / DevTools 检测</div><div class="row-sub">扫描覆盖内联脚本与外链 JS</div></div></div>`;

  const antiRows = antiFindings.length
    ? antiFindings.slice(0, 5).map(item => `
      <div class="row">
        <span class="row-badge ${item.level === 'danger' ? 'danger' : item.level === 'warn' ? 'warn' : 'accent'}">${escapeHtml(item.name)}</span>
        <div class="row-main">
          <div class="row-title">${escapeHtml(item.detail)}</div>
          <div class="row-sub">${escapeHtml(timeAgo(item.ts))}</div>
        </div>
      </div>`).join('')
    : `<div class="row"><span class="row-badge ok">无</span><div class="row-main"><div class="row-title">未命中追踪 / 特征采集迹象</div><div class="row-sub">特征库：HFish · BeEF · Canary · FingerprintJS · Canvas/Audio</div></div></div>`;

  root.innerHTML = `
    <div class="hero">
      <div class="ring" style="--p:${state.progress}">
        <div><b>${state.progress}%</b><span>扫描进度</span></div>
      </div>
      <div class="hero-main">
        <div class="hero-title">${conclusion.title}</div>
        <div class="hero-desc">${escapeHtml(conclusion.desc)}</div>
        <div class="hero-tags">${tags}</div>
      </div>
    </div>

    <div class="metrics">
      ${stats.map(item => `
        <div class="metric" data-tone="${item.tone}" data-goto="${item.view}" data-sub="${item.sub}">
          <div class="metric-label">${item.label}</div>
          <div class="metric-value">${item.value}<small>${item.key === 'fp' ? '类' : '项'}</small></div>
        </div>`).join('')}
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>JS 安全检测</h3>
          <p>无限 debugger · 混淆 · DevTools 检测 · 防篡改</p>
        </div>
        <button class="btn ghost sm" data-act="scan">重扫</button>
      </div>
      <div class="card-body flush"><div class="rows">${findingRows}</div></div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>反追踪特征</h3>
          <p>页面内检测到的追踪与特征采集迹象</p>
        </div>
        <button class="btn ghost sm" data-act="anti">查看</button>
      </div>
      <div class="card-body flush"><div class="rows">${antiRows}</div></div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>快捷操作</h3></div></div>
      <div class="card-body">
        <div class="btn-row">
          <button class="btn" data-act="copy">复制摘要</button>
          <button class="btn" data-act="hooks">脚本</button>
          <button class="btn danger" data-act="clear">清站点数据</button>
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-goto]').forEach(node => {
    node.addEventListener('click', () => {
      if (node.dataset.sub) state.ui.info = Object.assign({}, state.ui.info, { sub: node.dataset.sub });
      switchView(node.dataset.goto);
    });
  });

  root.querySelector('[data-act="scan"]').addEventListener('click', async () => {
    await sendTabScan(ctx);
  });
  root.querySelector('[data-act="anti"]').addEventListener('click', () => switchView('anti'));
  root.querySelector('[data-act="hooks"]').addEventListener('click', () => switchView('hooks'));
  root.querySelector('[data-act="clear"]').addEventListener('click', async () => {
    if (!confirm('确定清除当前站点的 Cookie、缓存与本地存储？')) return;
    const response = await send({ type: 'ANTI_CLEAR_SITE', to: 'anti', url: state.tab.url });
    toast(response && response.ok ? '站点数据已清除' : '清除失败', response && response.ok ? 'ok' : 'error');
    refresh({ adb: false });
  });
  root.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const lines = [
      `# MAPUS 摘要 · ${tab.title || ''}`,
      `URL: ${tab.url}`,
      `敏感数据: ${total} 项`,
      `API/路径: ${sum(results, ['apis', 'absoluteApis', 'urls'])} 条`,
      `凭据/身份: ${critical} 项`,
      `技术栈: ${fingerprints.map(f => f.name).join(', ') || '无'}`,
      `JS 安全: ${findings.map(f => f.text).join(' / ') || '无'}`,
      `追踪特征: ${antiFindings.map(f => f.name).join(', ') || '无'}`,
      `拦截追踪: ${blocks} 次`,
      `脚本: ${enabledHooks.length} 个`
    ].join('\n');
    toast(await copyText(lines) ? '摘要已复制' : '复制失败', 'ok');
  });
}

async function sendTabScan(ctx) {
  const { state } = ctx;
  if (!state.tab) return;
  const tabId = state.tab.id;
  await new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'RUN_SCAN', tabId }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (_) { resolve(); }
  });
  toast('已触发重新扫描，结果将自动刷新');
}
