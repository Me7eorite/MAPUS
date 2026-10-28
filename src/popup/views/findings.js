import { send, escapeHtml, toast, copyText } from '../ui.js';

const SEV_TEXT = { critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息' };
const ui = { findings: [], summary: null, openId: null, filter: '', lastHost: null, root: null };

function packetText(side, packet, url) {
  if (!packet) return '';
  const lines = [];
  if (side === 'request') {
    let path = String(packet.url || url || '/');
    try { const u = new URL(packet.url || url); path = u.pathname + u.search; } catch (_) {  }
    lines.push(`${packet.method || 'GET'} ${path} HTTP/1.1`);
    try { lines.push(`Host: ${new URL(packet.url || url).host}`); } catch (_) {  }
  } else {
    lines.push(`HTTP/1.1 ${packet.status || 0} ${packet.statusText || ''}`.trim());
  }
  if (packet.headers) lines.push(...String(packet.headers).split('\n').filter(Boolean));
  lines.push('');
  if (packet.body) lines.push(packet.body);
  return lines.join('\n');
}

function bindEvents(root) {
  root.onclick = event => {
    const delBtn = event.target.closest('[data-del]');
    if (delBtn) {
      event.stopPropagation();
      const id = delBtn.dataset.del;
      const item = ui.findings.find(entry => entry.id === id);
      if (item && confirm(`删除风险项「${item.title}」？`)) {
        send({ to: 'findings', type: 'FINDINGS_DELETE', id }).then(() => {
          if (ui.openId === id) ui.openId = null;
          toast(root, '已删除');
          load(root);
        });
      }
      return;
    }
    const card = event.target.closest('[data-finding]');
    if (card) {
      ui.openId = ui.openId === card.dataset.finding ? null : card.dataset.finding;
      paint(root);
      return;
    }
    const copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      const pre = copyBtn.closest('.fd-section').querySelector('pre');
      if (pre) copyText(pre.textContent).then(() => toast(root, '已复制'));
    }
  };
  const filter = root.querySelector('#fdFilter');
  if (filter) filter.onchange = () => { ui.filter = filter.value; paint(root); load(root); };
  const clearBtn = root.querySelector('#fdClear');
  if (clearBtn) clearBtn.onclick = async () => {
    if (!confirm(ui.filter ? `清空 ${ui.filter} 的全部风险记录？` : '清空全部风险记录？')) return;
    await send({ to: 'findings', type: 'FINDINGS_CLEAR', host: ui.filter });
    ui.openId = null;
    await load(root);
  };
  const dashBtn = root.querySelector('#fdDashboard');
  if (dashBtn) dashBtn.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

async function load(root) {
  const reply = await send({ to: 'findings', type: 'FINDINGS_LIST', host: ui.filter });
  if (!root.isConnected) return;
  if (reply && reply.ok) {
    ui.findings = reply.findings || [];
    ui.summary = reply.summary || null;
  }
  paint(root);
}

function paint(root) {
  const summary = ui.summary || { total: 0, levels: {}, sites: [] };
  const siteList = (summary.sites || []).slice();
  if (ui.filter && !siteList.some(site => site.host === ui.filter)) {
    siteList.unshift({ host: ui.filter, total: 0 });
  }
  const list = ui.findings.slice().reverse();
  const open = ui.findings.find(item => item.id === ui.openId) || null;
  const levels = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of ui.findings) levels[item.severity] = (levels[item.severity] || 0) + 1;
  const levelChips = ['critical', 'high', 'medium', 'low', 'info']
    .filter(level => levels[level])
    .map(level => `<span class="fd-chip sev-${level}">${SEV_TEXT[level]} ${levels[level]}</span>`)
    .join(' ');

  root.innerHTML = `
    <section class="card fd-summary">
      <div class="fd-head">
        <h2 class="fd-title">风险报告</h2>
        <button class="btn ghost sm" id="fdDashboard">控制大屏 →</button>
      </div>
      <div class="fd-stats">
        <div class="fd-total"><b>${ui.findings.length}</b><span>条风险${ui.filter ? `<i class="fd-site-tag">${escapeHtml(ui.filter)}</i>` : ''}</span></div>
        <div class="fd-chips">${levelChips || '<span class="fd-chip">暂无数据</span>'}</div>
      </div>
      <div class="fd-tools">
        <select id="fdFilter" class="input fd-filter" title="切换站点">
          <option value="">全部站点（${summary.total}）</option>
          ${(siteList).map(site => `<option value="${escapeHtml(site.host)}"${site.host === ui.filter ? ' selected' : ''}>${escapeHtml(site.host)}（${site.total}）</option>`).join('')}
        </select>
        <button class="btn danger sm" id="fdClear">清空</button>
      </div>
    </section>
    ${open ? detailHtml(open) : ''}
    <section class="card">
      ${list.length ? list.map(item => `
        <div class="fd-item" data-finding="${item.id}" data-severity="${item.severity}">
          <div class="fd-row">
            <span class="sev sev-${item.severity}">${SEV_TEXT[item.severity] || item.severity}</span>
            <span class="fd-name">${escapeHtml(item.title)}</span>
            <button class="fd-del" data-del="${item.id}" title="删除这条风险">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>
            </button>
            <span class="fd-arrow">${open && open.id === item.id ? '▾' : '▸'}</span>
          </div>
          <div class="fd-sub">${escapeHtml(item.host)} · ${escapeHtml(item.cwe || '—')} · ${new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</div>
        </div>`).join('') : emptyHtml()}
    </section>`;
  bindEvents(root);
}

function emptyHtml() {
  const title = ui.filter
    ? `站点 ${escapeHtml(ui.filter)} 还没有风险记录`
    : '还没有风险记录';
  return `
    <div class="fd-empty">
      <p class="fd-empty-title">${title}</p>
      <p class="fd-empty-desc">到「智能体」让它测当前站点，确认风险会自动出现在这里。</p>
    </div>`;
}

function detailHtml(item) {
  return `
    <section class="card fd-detail">
      <div class="fd-detail-head">
        <span class="sev sev-${item.severity}">${SEV_TEXT[item.severity]}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <button class="btn danger sm" data-del="${item.id}">删除</button>
      </div>
      <div class="fd-kv">
        <span>站点</span><b>${escapeHtml(item.host)}</b>
        <span>URL</span><b class="fd-mono">${escapeHtml(item.url)}</b>
        <span>CWE</span><b>${escapeHtml(item.cwe || '—')}</b>
        <span>参数</span><b>${escapeHtml(item.param || '—')}</b>
        <span>置信</span><b>${item.confidence === 'confirmed' ? '已确认' : item.confidence === 'probable' ? '很可能' : '存疑'}</b>
      </div>
      ${item.description ? `<p class="fd-desc">${escapeHtml(item.description)}</p>` : ''}
      ${item.reproduction ? `<div class="fd-section"><h4>复现步骤</h4><p class="fd-desc">${escapeHtml(item.reproduction)}</p></div>` : ''}
      ${item.remediation ? `<div class="fd-section"><h4>修复建议</h4><p class="fd-desc">${escapeHtml(item.remediation)}</p></div>` : ''}
      <div class="fd-section">
        <h4>HTTP 请求 <button class="btn ghost sm" data-copy="req">复制</button></h4>
        <pre class="fd-packet">${escapeHtml(packetText('request', item.request, item.url)) || '（无）'}</pre>
      </div>
      <div class="fd-section">
        <h4>HTTP 响应 <button class="btn ghost sm" data-copy="resp">复制</button></h4>
        <pre class="fd-packet">${escapeHtml(packetText('response', item.response, item.url)) || '（无）'}</pre>
      </div>
      ${item.screenshot ? `<div class="fd-section"><h4>截图</h4><img class="fd-shot" src="${item.screenshot}" alt="风险截图"></div>` : ''}
    </section>`;
}

export function renderFindings(root, ctx) {
  const tab = (ctx.state && ctx.state.tab) || null;
  const url = String((tab && tab.url) || '');
  const host = /^https?:/i.test(url) ? hostOfUrl(url) : '';
  if (host !== ui.lastHost) {
    ui.lastHost = host;
    ui.filter = host;
    ui.openId = null;
  }
  ui.root = root;
  paint(root);
  load(root);
}

function hostOfUrl(url) {
  try { return new URL(String(url || '')).host || ''; } catch (_) { return ''; }
}

if (!globalThis.__mapusFindingsLive) {
  globalThis.__mapusFindingsLive = true;
  chrome.runtime.onMessage.addListener(message => {
    if (!message || message.type !== 'MAPUS_FINDINGS_CHANGED') return;
    const root = ui.root;
    if (!root || !root.isConnected) return;
    load(root);
  });
}
