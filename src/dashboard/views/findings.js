import { $, esc, dayOf, findings, packetText, download, CONF_TEXT } from '../lib.js';
import { state, filteredFindings, refreshFindings, emitChange } from '../store.js';

const SEV_TEXT = { critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息' };
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function renderFindings(root) {
  const summary = state.summary || { sites: [] };
  root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h3>风险汇总</h3><p>点任意一条查看完整请求/响应包与截图</p></div>
        <div class="card-tools">
          <select id="fltHost"><option value="">全部站点</option></select>
          <select id="fltSev"><option value="">全部等级</option>${SEV_ORDER.map(level => `<option value="${level}">${SEV_TEXT[level]}</option>`).join('')}</select>
          <button class="btn ghost sm" id="btnExport">导出 JSON</button>
          <button class="btn danger-ghost sm" id="btnClear">清空</button>
        </div>
      </div>
      <div id="findingList" class="finding-list"></div>
    </section>

    <div id="detailMask" class="mask hidden"><div class="detail" id="detailBox"></div></div>`;

  const hostBox = $('#fltHost', root);
  hostBox.innerHTML = '<option value="">全部站点</option>' +
    (summary.sites || []).map(site => `<option value="${esc(site.host)}">${esc(site.host)}（${site.total}）</option>`).join('');
  hostBox.value = state.filterHost || '';
  hostBox.addEventListener('change', () => { state.filterHost = hostBox.value; renderList($('#findingList', root)); });

  const sevBox = $('#fltSev', root);
  sevBox.value = state.filterSev || '';
  sevBox.addEventListener('change', () => { state.filterSev = sevBox.value; renderList($('#findingList', root)); });

  $('#btnExport', root).addEventListener('click', () => {
    const list = filteredFindings();
    if (!list.length) return;
    download(`mapus-findings-${state.filterHost || 'all'}-${Date.now()}.json`, JSON.stringify(list, null, 2));
  });

  $('#btnClear', root).addEventListener('click', async () => {
    const host = state.filterHost;
    if (!confirm(host ? `清空 ${host} 的全部风险记录？` : '清空全部风险记录？')) return;
    await findings('FINDINGS_CLEAR', { host });
    await refreshFindings();
    emitChange('finding');
  });

  $('#findingList', root).addEventListener('click', event => {
    const del = event.target.closest('[data-del]');
    if (del) {
      event.stopPropagation();
      const id = del.dataset.del;
      const item = (state.findings || []).find(entry => entry.id === id);
      if (item && confirm(`删除风险项「${item.title}」？`)) {
        findings('FINDINGS_DELETE', { id }).then(async () => {
          await refreshFindings();
          emitChange('finding');
          renderList($('#findingList', root));
        });
      }
      return;
    }
    const item = event.target.closest('.finding');
    if (item) openFinding(item.dataset.id);
  });

  $('#detailMask', root).addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden');
    const button = event.target.closest('.copy-btn');
    if (button) {
      const pre = button.closest('.detail-section').querySelector('.http-packet');
      if (pre) navigator.clipboard.writeText(pre.textContent).catch(() => { });
    }
  });

  renderList($('#findingList', root));
}

export function renderList(box) {
  if (!box) return;
  const list = filteredFindings();
  if (!list.length) {
    box.innerHTML = '<div class="empty">还没有符合筛选条件的风险</div>';
    return;
  }
  box.innerHTML = list.slice().reverse().map(item => `
    <div class="finding" data-severity="${item.severity}" data-id="${item.id}">
      <div class="finding-top">
        <span class="sev ${item.severity}">${SEV_TEXT[item.severity] || item.severity}</span>
        <span class="finding-title">${esc(item.title)}</span>
        <span class="spacer"></span>
        ${item.cwe ? `<span class="cwe-chip">${esc(item.cwe)}</span>` : ''}
        ${item.screenshot ? '<span class="shot-chip">含截图</span>' : ''}
        <button class="finding-del" data-del="${item.id}" title="删除这条风险">删除</button>
      </div>
      <div class="finding-meta">
        <span class="finding-host">${esc(item.host)}</span> · ${esc(item.url)} · ${esc(CONF_TEXT[item.confidence] || item.confidence || '')} · ${dayOf(item.createdAt)}
      </div>
    </div>`).join('');
}

function activeMask() {
  return document.querySelector('.panel.active #detailMask') || document.getElementById('detailMask');
}

export async function openFinding(id) {
  const mask = activeMask();
  const box = mask ? mask.querySelector('#detailBox') : null;
  if (!mask || !box) return;
  const res = await findings('FINDINGS_GET', { id });
  if (!res || !res.ok) return;
  const item = res.finding;
  box.innerHTML = `
    <div class="detail-head">
      <h3>${esc(item.title)}</h3>
      <button class="btn danger-ghost sm" id="btnDelDetail">删除</button>
      <button class="btn ghost sm" id="btnCloseDetail">关闭</button>
    </div>
    <div class="detail-sub">${esc(item.host)} · ${esc(item.url)}</div>
    <div class="kv">
      <div><b>等级</b><span><span class="sev ${item.severity}">${SEV_TEXT[item.severity] || item.severity}</span></span></div>
      <div><b>CWE</b><span>${esc(item.cwe || '—')}</span></div>
      <div><b>参数</b><span>${esc(item.param || '—')}</span></div>
      <div><b>置信</b><span>${esc(CONF_TEXT[item.confidence] || item.confidence || '—')}</span></div>
      <div><b>时间</b><span>${dayOf(item.createdAt)}</span></div>
    </div>
    ${item.description ? `<div class="detail-section"><h4>描述</h4><div>${esc(item.description)}</div></div>` : ''}
    ${item.reproduction ? `<div class="detail-section"><h4>复现步骤</h4><pre class="plain">${esc(item.reproduction)}</pre></div>` : ''}
    ${item.remediation ? `<div class="detail-section"><h4>修复建议</h4><div>${esc(item.remediation)}</div></div>` : ''}
    <div class="detail-section">
      <h4>HTTP 请求<button class="btn small ghost copy-btn" data-copy="req">复制</button></h4>
      <pre class="http-packet">${esc(packetText('request', item.request, item.url)) || '（无）'}</pre>
    </div>
    <div class="detail-section">
      <h4>HTTP 响应<button class="btn small ghost copy-btn" data-copy="resp">复制</button></h4>
      <pre class="http-packet">${esc(packetText('response', item.response, item.url)) || '（无）'}</pre>
    </div>
    ${item.screenshot ? `<div class="detail-section"><h4>截图</h4><img class="shot" src="${item.screenshot}"></div>` : ''}`;
  mask.classList.remove('hidden');
  const close = mask.querySelector('#btnCloseDetail');
  if (close) close.addEventListener('click', () => mask.classList.add('hidden'));
  const del = mask.querySelector('#btnDelDetail');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(`删除风险项「${item.title}」？`)) return;
    await findings('FINDINGS_DELETE', { id: item.id });
    mask.classList.add('hidden');
    await refreshFindings();
    emitChange('finding');
    const list = document.querySelector('.panel.active #findingList');
    if (list) renderList(list);
  });
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const mask = activeMask();
  if (mask && !mask.classList.contains('hidden')) mask.classList.add('hidden');
});
