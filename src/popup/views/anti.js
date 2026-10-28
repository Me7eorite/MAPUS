import { escapeHtml, toast, send, copyText, timeAgo, shortUrl } from '../ui.js';
import { refresh } from '../popup.js';

const SWITCHES = [
  { key: 'isEnabled', title: '隐私防护总开关', desc: '关闭后停止拦截与特征保护，仅保留检测面板' },
  { key: 'fingerprintEnabled', title: '特征保护', desc: 'Canvas / Audio / WebGL / 设备枚举 返回扰动值' },
  { key: 'webrtcEnabled', title: 'WebRTC 防泄漏', desc: '阻断 RTCPeerConnection，避免真实 IP 暴露' },
  { key: 'uaRotationEnabled', title: '按站点随机 UA', desc: '每个站点首次访问随机 UA 并附带伪造 X-Forwarded-For' },
  { key: 'notifyOnBlock', title: '拦截系统通知', desc: '命中追踪器时弹出系统通知（默认关闭，避免打扰）' },
  { key: 'autoCleanPrevDomain', title: '切换主域自动清理', desc: '风险项：切换主域会清除上一个主域的 Cookie 与存储', tone: 'danger' }
];

export function renderAnti(root, ctx) {
  const { state } = ctx;
  const anti = state.anti || {};
  const enabled = anti.isEnabled !== false;
  const blocks = anti.blocks || 0;
  const recent = anti.recent || [];
  const findings = anti.findings || [];
  const ua = anti.ua && anti.ua.ua ? anti.ua.ua : '';

  const switchRows = SWITCHES.map(item => `
    <label class="switch-row ${item.tone ? 'tone-' + item.tone : ''}">
      <span class="switch-text">
        <span class="switch-title">${escapeHtml(item.title)}</span>
        <span class="switch-desc">${escapeHtml(item.desc)}</span>
      </span>
      <span class="switch">
        <input type="checkbox" data-switch="${item.key}" ${anti[item.key] !== false ? 'checked' : ''} ${item.key !== 'isEnabled' && !enabled ? 'disabled' : ''}>
        <span class="track"><span class="knob"></span></span>
      </span>
    </label>`).join('');

  root.innerHTML = `
    <div class="hero">
      <div class="ring" style="--p:${blocks ? Math.min(100, blocks * 10) : 0}">
        <div><b>${blocks}</b><span>本站拦截</span></div>
      </div>
      <div class="hero-main">
        <div class="hero-title">${enabled ? '隐私防护运行中' : '隐私防护已停用'}</div>
        <div class="hero-desc">${enabled
          ? '已拦截追踪脚本与特征采集请求，并对本域请求改写 UA / X-Forwarded-For。'
          : '所有拦截与特征保护均已停止，仅保留页面特征检测。'}</div>
        <div class="hero-tags">
          <span class="tag ${enabled ? 'ok' : 'danger'}">${enabled ? '防护开启' : '防护关闭'}</span>
          ${findings.length ? `<span class="tag warn">页面特征 ${findings.length}</span>` : ''}
          ${ua ? '<span class="tag accent">UA 已伪装</span>' : ''}
        </div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><div><h3>防护开关</h3><p>立即生效，无需刷新页面</p></div></div>
      <div class="card-body" style="padding-top:2px">${switchRows}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>当前站点</h3><p>${escapeHtml(anti.site || '—')}${anti.mainDomain && anti.mainDomain !== anti.site ? ' · 主域 ' + escapeHtml(anti.mainDomain) : ''}</p></div>
        <button class="btn ghost sm" data-act="copy-ua">复制 UA</button>
      </div>
      <div class="card-body">
        <div class="kv">
          <div class="kv-row"><span class="k">伪装 UA</span><span class="v mono tiny">${escapeHtml(ua ? shortUrl(ua, 64) : '尚未改写（进入站点后自动生成）')}</span></div>
          <div class="kv-row"><span class="k">XFF</span><span class="v mono tiny">${escapeHtml((anti.ua && anti.ua.forwardedFor) || '—')}</span></div>
          <div class="kv-row"><span class="k">拦截次数</span><span class="v">${blocks}</span></div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>最近拦截</h3><p>命中追踪器 / 分析平台的请求</p></div>
        <button class="btn ghost sm" data-act="reset">清空</button>
      </div>
      <div class="card-body flush">
        ${recent.length ? `<div class="rows">${recent.map(item => `
          <div class="row">
            <span class="row-badge danger">BLOCK</span>
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.host || item.url)}</div>
              <div class="row-sub">${escapeHtml(item.rule || '规则命中')} · ${escapeHtml(timeAgo(item.ts))}</div>
            </div>
          </div>`).join('')}</div>`
        : `<div class="rows"><div class="row"><span class="row-badge ok">无</span><div class="row-main"><div class="row-title">当前站点暂无拦截记录</div><div class="row-sub">页面未请求已列入拦截表的主机</div></div></div></div>`}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>页面内检测</h3><p>追踪痕迹 / 特征采集 / 隐藏内嵌框架 / 代码混淆</p></div></div>
      <div class="card-body flush">
        ${findings.length ? `<div class="rows">${findings.map(item => `
          <div class="row">
            <span class="row-badge ${item.level === 'danger' ? 'danger' : item.level === 'warn' ? 'warn' : 'accent'}">${escapeHtml(item.name)}</span>
            <div class="row-main">
              <div class="row-title">${escapeHtml(item.detail)}</div>
              <div class="row-sub">${escapeHtml(timeAgo(item.ts))}</div>
            </div>
          </div>`).join('')}</div>`
        : `<div class="rows"><div class="row"><span class="row-badge ok">干净</span><div class="row-main"><div class="row-title">未命中追踪特征库</div><div class="row-sub">特征库：HFish / BeEF / Canary / FingerprintJS / Canvas / Audio / WebRTC</div></div></div></div>`}
      </div>
    </section>

    <div class="btn-row">
      <button class="btn danger" data-act="clear">清站点数据</button>
      <button class="btn" data-act="reload">刷新页面</button>
    </div>
    <div class="notice info">拦截基于 declarativeNetRequest 规则表（京东埋点、百度统计、GA、GTM、FingerprintJS、CNZZ、GrowingIO、Clarity、Hotjar 等）。清站点数据会清除 Cookie、缓存与本地存储，请谨慎操作。</div>
  `;

  root.querySelectorAll('[data-switch]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.switch;
      if (key === 'autoCleanPrevDomain' && input.checked && !confirm('开启后，切换主域会自动清除上一个主域的 Cookie 与本地存储，确定开启？')) {
        input.checked = false;
        return;
      }
      const response = await send({ type: 'ANTI_SET', to: 'anti', patch: { [key]: input.checked } });
      if (response && response.ok) {
        toast('已更新', 'ok');
        state.anti = Object.assign({}, state.anti, response.config);
        refresh({ scan: false, fingerprints: false, adb: false });
      } else {
        toast('更新失败', 'error');
        input.checked = !input.checked;
      }
    });
  });

  root.querySelector('[data-act="copy-ua"]').addEventListener('click', async () => {
    if (!ua) return toast('当前站点还没有伪装 UA', 'error');
    toast(await copyText(ua) ? 'UA 已复制' : '复制失败', 'ok');
  });

  root.querySelector('[data-act="reset"]').addEventListener('click', async () => {
    await send({ type: 'ANTI_RESET_STATS', to: 'anti' });
    toast('统计已清空', 'ok');
    refresh({ scan: false, fingerprints: false, adb: false });
  });

  root.querySelector('[data-act="clear"]').addEventListener('click', async () => {
    if (!state.tab) return;
    if (!confirm('确定清除当前站点的 Cookie、缓存与本地存储？')) return;
    const response = await send({ type: 'ANTI_CLEAR_SITE', to: 'anti', url: state.tab.url });
    toast(response && response.ok ? '站点数据已清除' : '清除失败', response && response.ok ? 'ok' : 'error');
    refresh({ scan: false, fingerprints: false, adb: false });
  });

  root.querySelector('[data-act="reload"]').addEventListener('click', () => {
    if (!state.tab) return;
    chrome.tabs.reload(state.tab.id);
    toast('正在刷新页面');
  });
}
