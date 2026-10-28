(function () {
  if (window !== window.top) return;

  const LABELS = {
    domains: '域名',
    absoluteApis: '绝对API',
    apis: '相对API',
    moduleFiles: '模块',
    docFiles: '文档',
    credentials: '凭据',
    cookies: 'Cookie',
    idKeys: 'ID/密钥',
    phones: '手机',
    emails: '邮箱',
    idcards: '身份证',
    ips: 'IP',
    companies: '公司',
    jwts: 'JWT',
    imageFiles: '图片/音视频',
    githubUrls: 'GitHub',
    vueFiles: 'Vue',
    jsFiles: 'JS',
    urls: 'URL',
    fingers: '特征'
  };

  function runSecurityChecks() {
    const getFindings = window.__mapus_getSecurityFindings;
    if (typeof getFindings === 'function') {
      const list = getFindings();
      if (list && list.length) return list.map(f => ({ level: f.level, text: f.text, detail: f.detail }));
    }
    if (window.__mapus_securityDetector) {
      const inlineScripts = document.querySelectorAll('script:not([src])');
      let inlineText = '';
      inlineScripts.forEach(s => { inlineText += (s.textContent || ''); });
      if (inlineText) {
        const list = window.__mapus_securityDetector.run(inlineText, 'inline');
        return (window.__mapus_securityDetector.dedupeFindings(list) || []).map(f => ({ level: f.level, text: f.text, detail: f.detail }));
      }
    }
    const scripts = document.querySelectorAll('script[src]');
    if (scripts.length > 25) return [{ level: 'info', text: '大量外部脚本', detail: '共 ' + scripts.length + ' 个 script[src]' }];
    return [];
  }

  function buildPanel() {
    const root = document.createElement('div');
    root.id = 'mapus-overview-panel';
    root.className = 'collapsed';
    root.style.cssText = 'right: 8px; top: 8px; left: auto;';
    root.innerHTML = `
      <div class="mapus-opener" title="展开/收起 Overview">◉</div>
      <div class="mapus-panel-inner">
        <div class="mapus-panel-header" id="mapus-drag-handle" title="拖动移动">
          <span>Overview</span>
          <button type="button" class="mapus-close" title="关闭">×</button>
        </div>
        <div class="mapus-section">
          <div class="mapus-section-title">扫描进度</div>
          <div class="mapus-progress" id="mapus-progress">-</div>
        </div>
        <div class="mapus-section">
          <div class="mapus-section-title">数量概览</div>
          <div class="mapus-counts" id="mapus-counts">-</div>
        </div>
        <div class="mapus-section">
          <div class="mapus-section-title">安全检测</div>
          <div class="mapus-security" id="mapus-security">检测中…</div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #mapus-overview-panel { position: fixed; z-index: 2147483646; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; min-width: 32px; min-height: 32px; }
      #mapus-overview-panel .mapus-opener { position: absolute; top: 0; right: 0; width: 32px; height: 32px; background: #1a1a2e; color: #eee; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: move; box-shadow: 0 2px 8px rgba(0,0,0,.3); z-index: 1; user-select: none; -webkit-user-select: none; }
      #mapus-overview-panel .mapus-opener:hover { background: #16213e; }
      #mapus-overview-panel .mapus-panel-inner { position: relative; width: 280px; max-height: 85vh; overflow: auto; background: #1a1a2e; color: #e2e8f0; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.4); padding: 10px; padding-top: 42px; }
      #mapus-overview-panel.collapsed .mapus-panel-inner { display: none; }
      #mapus-overview-panel.collapsed { width: 32px; height: 32px; }
      #mapus-overview-panel.collapsed .mapus-opener { border-radius: 8px; }
      #mapus-overview-panel .mapus-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #334155; cursor: move; user-select: none; -webkit-user-select: none; }
      #mapus-overview-panel .mapus-panel-header span { font-weight: 700; color: #f8fafc; }
      #mapus-overview-panel .mapus-close { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
      #mapus-overview-panel .mapus-close:hover { color: #f87171; }
      #mapus-overview-panel .mapus-section { margin-bottom: 10px; }
      #mapus-overview-panel .mapus-section-title { font-size: 11px; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; }
      #mapus-overview-panel .mapus-progress { font-size: 13px; font-weight: 600; color: #38bdf8; }
      #mapus-overview-panel .mapus-counts { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
      #mapus-overview-panel .mapus-count-item { display: flex; justify-content: space-between; }
      #mapus-overview-panel .mapus-count-item span:last-child { color: #38bdf8; font-weight: 600; }
      #mapus-overview-panel .mapus-security { display: flex; flex-direction: column; gap: 6px; }
      #mapus-overview-panel .mapus-finding { padding: 6px 8px; border-radius: 6px; font-size: 11px; }
      #mapus-overview-panel .mapus-finding.danger { background: rgba(248,113,113,.2); border-left: 3px solid #f87171; }
      #mapus-overview-panel .mapus-finding.warn { background: rgba(251,191,36,.15); border-left: 3px solid #fbbf24; }
      #mapus-overview-panel .mapus-finding.info { background: rgba(148,163,184,.15); border-left: 3px solid #94a3b8; }
      #mapus-overview-panel .mapus-finding-detail { color: #94a3b8; margin-top: 2px; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const opener = root.querySelector('.mapus-opener');
    const closeBtn = root.querySelector('.mapus-close');
    const dragHandle = root.querySelector('#mapus-drag-handle');

    let didDrag = false;
    opener.addEventListener('click', (e) => {
      if (didDrag) { didDrag = false; e.preventDefault(); return; }
      root.classList.toggle('collapsed');
    });
    closeBtn.addEventListener('click', () => root.remove());

    (function setupDrag() {
      let startX = 0, startY = 0, startRight = 0, startTop = 0;
      function parsePx(v) { return parseInt(v, 10) || 0; }
      function onMouseDown(e) {
        if (e.button !== 0 || e.target.closest('.mapus-close')) return;
        didDrag = false;
        startX = e.clientX;
        startY = e.clientY;
        startRight = parsePx(root.style.right);
        startTop = parsePx(root.style.top);
        if (!startRight && root.style.left) startRight = parsePx(root.style.left);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      }
      function onMouseMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
        root.style.left = 'auto';
        root.style.right = Math.max(0, startRight - dx) + 'px';
        root.style.top = Math.max(0, startTop + dy) + 'px';
      }
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
      dragHandle.addEventListener('mousedown', onMouseDown);
      opener.addEventListener('mousedown', onMouseDown);
    })();
  }

  function renderCounts(el, counts) {
    if (!counts || typeof counts !== 'object') { el.textContent = '暂无数据'; return; }
    const entries = Object.entries(counts).filter(([k, v]) => v > 0 && LABELS[k]);
    if (!entries.length) { el.textContent = '暂无数据'; return; }
    el.innerHTML = entries.map(([k, v]) => `<div class="mapus-count-item"><span>${LABELS[k]}</span><span>${v}</span></div>`).join('');
  }

  function renderSecurity(el, findings) {
    if (!findings || !findings.length) { el.innerHTML = '<div class="mapus-finding info">未发现上述风险项</div>'; return; }
    el.innerHTML = findings.map(f => `
      <div class="mapus-finding ${f.level}">
        <div>${f.text}</div>
        ${f.detail ? `<div class="mapus-finding-detail">${f.detail}</div>` : ''}
      </div>
    `).join('');
  }

  function updatePanel() {
    const countsEl = document.getElementById('mapus-counts');
    const progressEl = document.getElementById('mapus-progress');
    const securityEl = document.getElementById('mapus-security');
    if (!countsEl || !securityEl) return;

    const getOverview = window.__mapus_getOverview;
    if (typeof getOverview === 'function') {
      try {
        const data = getOverview();
        if (data) {
          if (data.counts) renderCounts(countsEl, data.counts);
          if (progressEl != null) progressEl.textContent = typeof data.progress === 'number' ? `扫描进度 ${data.progress}%` : '-';
        }
      } catch (e) {
        countsEl.textContent = '获取失败';
        if (progressEl) progressEl.textContent = '-';
      }
    } else {
      renderCounts(countsEl, null);
      if (progressEl) progressEl.textContent = '-';
    }

    try {
      const findings = runSecurityChecks();
      renderSecurity(securityEl, findings);
    } catch (e) {
      securityEl.textContent = '检测异常';
    }
  }

  function init() {
    buildPanel();
    updatePanel();
    if (window.__mapus_overviewUpdate) return;
    window.__mapus_overviewUpdate = function () {
      const countsEl = document.getElementById('mapus-counts');
      const securityEl = document.getElementById('mapus-security');
      if (countsEl && securityEl) updatePanel();
    };
    setInterval(updatePanel, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
