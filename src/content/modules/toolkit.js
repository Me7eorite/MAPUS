(function () {
  'use strict';
  if (window.__mapusReport) return;

  const PANEL_CSS = `
    :host { all: initial; }
    .panel {
      width: 360px;
      max-width: calc(100vw - 24px);
      background: #ffffff;
      color: #101828;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
      box-shadow: 0 18px 48px rgba(16, 24, 40, .18), 0 2px 8px rgba(16, 24, 40, .08);
      font: 12px/1.5 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 62vh;
    }
    .head {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; background: #f9fafb; border-bottom: 1px solid #eef0f4;
      cursor: move; user-select: none;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #2f6bff; box-shadow: 0 0 0 3px rgba(47,107,255,.14); flex: 0 0 auto; }
    .titles { flex: 1; min-width: 0; }
    .title { font-weight: 700; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { color: #667085; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon-btn {
      border: 0; background: transparent; color: #667085; cursor: pointer;
      width: 22px; height: 22px; border-radius: 6px; font-size: 14px; line-height: 1;
    }
    .icon-btn:hover { background: #eef2f8; color: #101828; }
    .body { overflow: auto; padding: 6px 0; }
    .row { display: flex; gap: 8px; padding: 6px 12px; align-items: flex-start; border-bottom: 1px dashed #f2f4f7; }
    .row:last-child { border-bottom: 0; }
    .row:hover { background: #fafbff; }
    .badge {
      flex: 0 0 auto; min-width: 26px; text-align: center; padding: 1px 5px; border-radius: 5px;
      font-size: 10px; font-weight: 700; margin-top: 1px;
    }
    .ok { background: #e7f8ee; color: #087443; }
    .warn { background: #fff6e5; color: #b54708; }
    .danger { background: #fee4e2; color: #b42318; }
    .info { background: #eef4ff; color: #175cd3; }
    .label { flex: 1; min-width: 0; word-break: break-all; }
    .meta { color: #98a2b3; font-size: 10.5px; }
    .empty { padding: 18px 12px; color: #98a2b3; text-align: center; }
    .foot {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      border-top: 1px solid #eef0f4; background: #fcfcfd; color: #667085; font-size: 11px;
    }
    .foot .status { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btn { border: 1px solid #d0d5dd; background: #fff; color: #344054; border-radius: 7px; padding: 3px 8px; cursor: pointer; font-size: 11px; }
    .btn:hover { background: #f9fafb; }
    .bar { height: 3px; background: #eef0f4; border-radius: 2px; overflow: hidden; }
    .bar > i { display: block; height: 100%; width: 0; background: #2f6bff; transition: width .2s; }
  `;

  function ensureStack() {
    let stack = document.getElementById('nx-report-stack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'nx-report-stack';
    stack.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'display:flex', 'flex-direction:column', 'gap:10px', 'align-items:flex-end',
      'max-height:calc(100vh - 32px)', 'overflow:auto', 'pointer-events:none'
    ].join(';');
    (document.body || document.documentElement).appendChild(stack);
    return stack;
  }

  function releaseStack(stack) {
    if (stack && !stack.children.length) stack.remove();
  }

  function create(options) {
    const opt = options || {};
    const stack = ensureStack();

    const host = document.createElement('div');
    host.className = 'nx-report-host';
    host.style.cssText = 'pointer-events:auto;flex:0 0 auto;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="head">
        <span class="dot"></span>
        <div class="titles">
          <div class="title"></div>
          <div class="sub"></div>
        </div>
        <button class="icon-btn" data-act="copy" title="复制全部结果">⧉</button>
        <button class="icon-btn" data-act="close" title="关闭">✕</button>
      </div>
      <div class="bar"><i></i></div>
      <div class="body"><div class="empty">正在执行…</div></div>
      <div class="foot">
        <span class="status">就绪</span>
        <button class="btn" data-act="min">收起</button>
      </div>
    `;
    shadow.append(style, panel);
    stack.insertBefore(host, stack.firstChild);
    while (stack.children.length > 4) stack.lastElementChild.remove();

    const titleEl = panel.querySelector('.title');
    const subEl = panel.querySelector('.sub');
    const bodyEl = panel.querySelector('.body');
    const statusEl = panel.querySelector('.status');
    const barEl = panel.querySelector('.bar > i');
    titleEl.textContent = opt.title || 'MAPUS 取证';
    subEl.textContent = opt.subtitle || location.hostname;

    const rows = [];
    let collapsed = false;

    function removePanel() {
      host.remove();
      releaseStack(stack);
    }

    panel.addEventListener('click', event => {
      const act = event.target?.dataset?.act;
      if (!act) return;
      if (act === 'close') removePanel();
      if (act === 'min') {
        collapsed = !collapsed;
        bodyEl.style.display = collapsed ? 'none' : '';
        event.target.textContent = collapsed ? '展开' : '收起';
      }
      if (act === 'copy') {
        const text = rows.map(row => `[${row.level}] ${row.label}${row.meta ? '  (' + row.meta + ')' : ''}`).join('\n');
        try { navigator.clipboard.writeText(text); statusEl.textContent = '已复制 ' + rows.length + ' 条'; }
        catch (_) { statusEl.textContent = '复制失败'; }
      }
    });

    const head = panel.querySelector('.head');
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener('mousedown', event => {
      if (event.target.closest('button')) return;
      dragging = true;
      const rect = stack.getBoundingClientRect();
      sx = event.clientX; sy = event.clientY;
      ox = window.innerWidth - rect.right; oy = window.innerHeight - rect.bottom;
      event.preventDefault();
    });
    window.addEventListener('mousemove', event => {
      if (!dragging) return;
      stack.style.right = Math.max(0, ox - (event.clientX - sx)) + 'px';
      stack.style.bottom = Math.max(0, oy - (event.clientY - sy)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    function render() {
      if (!rows.length) {
        bodyEl.innerHTML = '<div class="empty">暂无结果</div>';
        return;
      }
      bodyEl.innerHTML = rows.map(row => `
        <div class="row">
          <span class="badge ${row.level}">${row.badge || row.level.toUpperCase()}</span>
          <div class="label">${escapeHtml(row.label)}${row.meta ? `<div class="meta">${escapeHtml(row.meta)}</div>` : ''}</div>
        </div>
      `).join('');
    }

    return {
      add(row) {
        rows.push({
          label: String(row.label ?? ''),
          meta: row.meta ? String(row.meta) : '',
          level: ['ok', 'warn', 'danger', 'info'].includes(row.level) ? row.level : 'info',
          badge: row.badge || ''
        });
        render();
        return this;
      },
      clear() { rows.length = 0; render(); },
      status(text) { statusEl.textContent = text; },
      progress(done, total) {
        barEl.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
      },
      minimize() { collapsed = true; bodyEl.style.display = 'none'; panel.querySelector('[data-act="min"]').textContent = '展开'; },
      destroy() { removePanel(); }
    };
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  window.__mapusReport = { create };
})();
