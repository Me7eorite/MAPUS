import { escapeHtml, toast, copyText } from '../ui.js';

const UPSTREAM = [
  {
    name: 'AntiDebug_Breaker',
    by: '0xsdeo',
    url: 'https://github.com/0xsdeo/AntiDebug_Breaker',
    desc: '调试防护与脚本注入的思路、脚本库与注入方式'
  },
  {
    name: 'NextAnti',
    by: 'icecliffs',
    url: 'https://github.com/icecliffs/nextanti',
    desc: '隐私防护、追踪拦截与浏览器特征保护'
  },
  {
    name: 'Heimdallr',
    by: 'Ghr07h',
    url: 'https://github.com/Ghr07h/Heimdallr',
    desc: '浏览器特征采集与追踪脚本的判定思路'
  },
  {
    name: 'SnowEyes',
    by: 'SickleSec',
    url: 'https://github.com/SickleSec/SnowEyes',
    desc: '页面敏感数据的提取与归集'
  }
];

const ENGINES = [
  { tone: 'accent', name: '内容扫描', desc: '接口、路径、账号凭据、身份信息、文件与外链域名', meta: '总览 / 信息' },
  { tone: 'ok', name: '隐私防护', desc: '识别追踪脚本、拦截采集请求、隐藏浏览器特征与 UA', meta: '隐私' },
  { tone: 'warn', name: '脚本增强', desc: '解除页面调试限制、提取前端路由、注入自定义脚本', meta: '脚本' },
  { tone: 'accent', name: 'AI 助手', desc: '大模型读取当前页面数据，并代你完成页面上的操作', meta: '助手' }
];

export function renderAbout(root, ctx) {
  const { state } = ctx;
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  const scripts = Array.isArray(state.adb && state.adb.catalog) ? state.adb.catalog.length : 0;
  const scriptLine = scripts ? `内置 ${scripts} 个，随扩展包分发` : '随扩展包分发，可自行扩充';

  root.innerHTML = `
    <div class="about-hero">
      <img class="about-logo" src="../icons/logo.png" alt="MAPUS">
      <div class="about-tags">
        <span class="about-ver">v${escapeHtml(version)}</span>
        <span class="tag accent">四项能力合一</span>
        <span class="tag">MV3</span>
      </div>
      <p class="about-slogan">隐私防护、数据梳理、脚本增强，加上能读懂并操作页面的 AI 助手，装进同一个侧边栏工作台。</p>
    </div>

    <section class="card">
      <div class="card-head"><div><h3>四项能力</h3><p>共用一套规则中心，字典与特征都可以自己改</p></div></div>
      <div class="card-body">
        <div class="about-engines">
          ${ENGINES.map(item => `
            <div class="about-engine">
              <span class="about-dot" data-tone="${item.tone}"></span>
              <div class="about-engine-main">
                <div class="about-engine-name">${escapeHtml(item.name)}<span class="about-engine-meta">${escapeHtml(item.meta)}</span></div>
                <div class="about-engine-desc">${escapeHtml(item.desc)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>本地优先</h3><p>不收集、不上报、不加载远程代码</p></div></div>
      <div class="card-body">
        <div class="kv">
          <div class="kv-row"><span class="k">数据存放</span><span class="v">全部在本机浏览器存储，卸载即清除</span></div>
          <div class="kv-row"><span class="k">联网行为</span><span class="v">只有你配置的大模型接口与手动触发的第三方查询会发请求</span></div>
          <div class="kv-row"><span class="k">统计埋点</span><span class="v">无</span></div>
          <div class="kv-row"><span class="k">远程代码</span><span class="v">无，所有脚本随扩展包分发</span></div>
          <div class="kv-row"><span class="k">脚本规模</span><span class="v">${escapeHtml(scriptLine)}</span></div>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost" data-act="copy-env">复制环境信息</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h3>上游与致谢</h3><p>站在这些开源项目的基础上，建议给它们点个 Star</p></div></div>
      <div class="card-body">
        <div class="about-links">
          ${UPSTREAM.map(item => `
            <button class="about-link" data-link="${escapeHtml(item.url)}">
              <span class="about-link-main">
                <span class="about-link-name">${escapeHtml(item.name)}</span>
                <span class="about-link-desc">${escapeHtml(item.desc)}</span>
              </span>
              <span class="about-link-by">${escapeHtml(item.by)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"/></svg>
            </button>`).join('')}
        </div>
      </div>
    </section>

    <div class="notice">请只在<b>你有权访问的页面</b>上使用；涉及他人系统时，请先取得明确授权。</div>

    <div class="about-foot">
      <span>MAPUS ${escapeHtml(version)}</span>
      <span class="about-foot-dot">·</span>
      <span>闭源分发</span>
      <span class="about-foot-dot">·</span>
      <span>${escapeHtml(manifest.minimum_chrome_version ? 'Chrome ' + manifest.minimum_chrome_version + '+' : 'Chromium')}</span>
    </div>
  `;

  root.querySelectorAll('[data-link]').forEach(button => {
    button.addEventListener('click', () => {
      chrome.tabs.create({ url: button.dataset.link }).catch(() => toast('打开链接失败', 'error'));
    });
  });

  const copy = root.querySelector('[data-act="copy-env"]');
  if (copy) {
    copy.addEventListener('click', async () => {
      const ua = navigator.userAgent;
      const chromeVersion = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || '未知';
      const env = [
        `MAPUS ${version}`,
        `Chrome ${chromeVersion}`,
        `平台 ${navigator.platform || '未知'}`,
        `内置脚本 ${scripts || '未知'} 个`
      ].join('\n');
      toast(await copyText(env) ? '环境信息已复制' : '复制失败', 'ok');
    });
  }
}
