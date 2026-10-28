import { escapeHtml, toast, send, copyText } from '../ui.js';

const MAX_TEXTAREA = 200000;

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

function setPath(target, path, value) {
  const keys = path.split('.');
  let node = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
}

const lines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean);

function parseJsonField(raw, label) {
  try {
    const value = JSON.parse(raw);
    return { value };
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${error.message}`);
  }
}

function sectionAcc(open, title, badge, body) {
  return `
    <details class="acc"${open ? ' open' : ''}>
      <summary><span class="acc-title">${escapeHtml(title)}</span><span class="tag">${escapeHtml(badge)}</span></summary>
      <div class="acc-body">${body}</div>
    </details>`;
}

function serviceBox(key, label, conf, opts = {}) {
  const idField = opts.icp
    ? `<input class="input" data-svc-id type="text" value="${escapeHtml(conf.id || '')}" placeholder="接口 ID（部分服务需要）" spellcheck="false">`
    : '';
  return `
    <div class="svc-box" data-svc="${key}">
      <label class="svc-head">
        <input type="checkbox" data-svc-enabled ${conf.enabled ? 'checked' : ''}>
        <span class="svc-name">${escapeHtml(label)}</span>
        <span class="tag ${conf.enabled ? 'ok' : ''}" data-svc-state>${conf.enabled ? '启用' : '关闭'}</span>
      </label>
      <input class="input" data-svc-url type="text" value="${escapeHtml(conf.url || '')}" placeholder="接口地址，用 {domain} 占位" spellcheck="false">
      ${idField}
      <input class="input" data-svc-key type="password" value="${escapeHtml(conf.key || '')}" placeholder="接口密钥（仅存本机）" spellcheck="false" autocomplete="off">
      <p class="tiny muted svc-hint">占位符：{domain} 域名、{key} 密钥、{id} 接口 ID。不填密钥时该服务自动跳过，不会发起请求。</p>
    </div>`;
}

function shell(rules) {
  const probe = rules.probe || {};
  const honeypot = rules.honeypot || {};
  const ua = rules.ua || {};
  const services = rules.services || {};
  const agent = rules.agent || {};
  const trackers = (rules.trackers && rules.trackers.rules) || [];

  return `
    <div class="rules-toolbar">
      <button class="btn ghost sm" data-rules-act="export">导出全部</button>
      <button class="btn ghost sm" data-rules-act="import">从文件导入</button>
      <button class="btn ghost sm" data-rules-act="reset">恢复默认</button>
      <span class="rules-stat tiny muted" data-rules-stat></span>
    </div>

    ${sectionAcc(true, '目录探测', `${(probe.wordlist || []).length} 条路径`, `
      <div class="rules-grid">
        <label class="field-row"><span class="label">并发数</span>
          <input class="input" type="number" min="1" max="20" data-num="probe.concurrency" value="${Number(probe.concurrency) || 5}"></label>
        <label class="field-row"><span class="label">单次超时 ms</span>
          <input class="input" type="number" min="1000" max="60000" data-num="probe.timeoutMs" value="${Number(probe.timeoutMs) || 6000}"></label>
      </div>
      <label class="field-row"><span class="label">接受的状态码（逗号分隔）</span>
        <input class="input" type="text" data-text="probe.acceptStatus" value="${escapeHtml((probe.acceptStatus || []).join(', '))}" spellcheck="false"></label>
      <label class="field-row"><span class="label">路径字典（一行一条，可整段粘贴 / 清空）</span>
        <textarea class="input" rows="8" data-list="probe.wordlist" spellcheck="false">${escapeHtml((probe.wordlist || []).join('\n'))}</textarea></label>
    `)}

    ${sectionAcc(false, '追踪与混淆特征', `${(honeypot.features || []).length} 组特征`, `
      <p class="tiny muted" style="margin-top:0">每项：<code>{ "name": "名称", "signs": ["页面特征词"], "detail": "说明", "level": "danger|warn|info" }</code></p>
      <textarea class="input" rows="9" data-json="honeypot.features" spellcheck="false">${escapeHtml(JSON.stringify(honeypot.features || [], null, 2))}</textarea>
      <label class="field-row"><span class="label">可疑脚本关键词（一行一条，命中动态脚本与请求）</span>
        <textarea class="input" rows="4" data-list="honeypot.suspectScriptKeys" spellcheck="false">${escapeHtml((honeypot.suspectScriptKeys || []).join('\n'))}</textarea></label>
      <label class="field-row"><span class="label">混淆特征正则（JSON）</span>
        <textarea class="input" rows="6" data-json="honeypot.obfuscation" spellcheck="false">${escapeHtml(JSON.stringify(honeypot.obfuscation || [], null, 2))}</textarea></label>
      <div class="rules-grid">
        <label class="check-line"><input type="checkbox" data-bool="honeypot.watchClipboard" ${honeypot.watchClipboard !== false ? 'checked' : ''}>监控剪贴板</label>
        <label class="check-line"><input type="checkbox" data-bool="honeypot.watchEval" ${honeypot.watchEval !== false ? 'checked' : ''}>监控 eval</label>
        <label class="check-line"><input type="checkbox" data-bool="honeypot.watchFetch" ${honeypot.watchFetch !== false ? 'checked' : ''}>监控 fetch / XHR</label>
      </div>
    `)}

    ${sectionAcc(false, '自定义扫描规则', `${(rules.scan && rules.scan.customPatterns || []).length} 条`, `
      <p class="tiny muted" style="margin-top:0">给自己关心的站点特征加正则，命中后统一显示在「信息 → 敏感数据 → 自定义命中」。每项：<code>{ "name": "名称", "pattern": "正则源码", "flags": "g" }</code></p>
      <textarea class="input" rows="8" data-json="scan.customPatterns" spellcheck="false">${escapeHtml(JSON.stringify((rules.scan && rules.scan.customPatterns) || [], null, 2))}</textarea>
      <label class="field-row"><span class="label">单条规则最多保留命中数</span>
        <input class="input" type="number" min="1" max="500" data-num="scan.maxHitsPerRule" value="${Number(rules.scan && rules.scan.maxHitsPerRule) || 40}"></label>
    `)}

    ${sectionAcc(false, '追踪器拦截', `${trackers.length} 条域名`, `
      <p class="tiny muted" style="margin-top:0">一行一个域名或子串，命中即由 declarativeNetRequest 拦截。改完会自动重建拦截规则。</p>
      <textarea class="input" rows="10" data-list="trackers.hosts" spellcheck="false">${escapeHtml(trackers.map(item => item.host).join('\n'))}</textarea>
    `)}

    ${sectionAcc(false, 'UA 伪装池', `${(ua.pool || []).length} 条`, `
      <p class="tiny muted" style="margin-top:0">一行一个 User-Agent，按站点随机挑选。清空则自动跳过 UA 伪装。</p>
      <textarea class="input" rows="8" data-list="ua.pool" spellcheck="false">${escapeHtml((ua.pool || []).join('\n'))}</textarea>
      <label class="field-row"><span class="label">生效的资源类型（逗号分隔）</span>
        <input class="input" type="text" data-list-text="ua.resourceTypes" value="${escapeHtml((ua.resourceTypes || []).join(', '))}" spellcheck="false"></label>
    `)}

    ${sectionAcc(false, '第三方数据服务', '权重 / IP / ICP', `
      <p class="tiny muted" style="margin-top:0">这些接口需要自备密钥。未启用或未填密钥时不会发起任何请求，界面会显示未配置。</p>
      ${serviceBox('weight', services.weight && services.weight.label || '域名权重', services.weight || {})}
      ${serviceBox('ip', services.ip && services.ip.label || 'IP 归属', services.ip || {})}
      ${serviceBox('icp', services.icp && services.icp.label || 'ICP 备案', services.icp || {}, { icp: true })}
      <label class="field-row"><span class="label">搜索引擎收录图标（JSON，image 支持 {domain} 占位）</span>
        <textarea class="input" rows="7" data-json="services.seoEngines" spellcheck="false">${escapeHtml(JSON.stringify(services.seoEngines || [], null, 2))}</textarea></label>
    `)}

    ${sectionAcc(false, '模型预设与提示词', `${(agent.providers || []).length} 个预设`, `
      <p class="tiny muted" style="margin-top:0">每项：<code>{ "id": "唯一标识", "label": "显示名", "baseUrl": "接口根地址", "model": "默认模型" }</code></p>
      <textarea class="input" rows="9" data-json="agent.providers" spellcheck="false">${escapeHtml(JSON.stringify(agent.providers || [], null, 2))}</textarea>
      <label class="field-row"><span class="label">工具调用最大步数（一步一个动作）</span>
        <input class="input" type="number" min="1" max="200" data-num="agent.maxToolRounds" value="${Number(agent.maxToolRounds) || 40}"></label>
      <label class="field-row"><span class="label">系统提示词（智能体的角色与工作原则）</span>
        <textarea class="input" rows="10" data-text="agent.systemPrompt" spellcheck="false">${escapeHtml(agent.systemPrompt || '')}</textarea></label>
    `)}

    ${sectionAcc(false, '高级：整份规则 JSON', '谨慎修改', `
      <p class="tiny muted" style="margin-top:0">包含端点发现、DOM XSS、原型污染等全部规则。修改后点「应用 JSON」整体替换。</p>
      <textarea class="input" rows="14" data-advanced spellcheck="false">${escapeHtml(JSON.stringify(rules, null, 2))}</textarea>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn ghost sm" data-rules-act="apply-json">应用 JSON</button>
        <button class="btn ghost sm" data-rules-act="copy-json">复制</button>
      </div>
    `)}

    <div class="rules-save">
      <button class="btn primary" data-rules-act="save">保存规则</button>
      <span class="tiny muted">保存后新打开的页面立即生效，已打开页面刷新一次</span>
    </div>`;
}

function collect(root, original) {
  const patch = {};
  const originalTrackers = new Map(
    ((original && original.trackers && original.trackers.rules) || []).map(item => [item.host, item.type])
  );

  root.querySelectorAll('[data-num]').forEach(input => {
    const value = Number(input.value);
    if (Number.isFinite(value)) setPath(patch, input.dataset.num, value);
  });

  root.querySelectorAll('[data-bool]').forEach(input => {
    setPath(patch, input.dataset.bool, input.checked);
  });

  root.querySelectorAll('[data-text]').forEach(input => {
    setPath(patch, input.dataset.text, input.value);
  });

  root.querySelectorAll('[data-list]').forEach(input => {
    const path = input.dataset.list;
    if (path === 'trackers.hosts') {
      patch.trackers = {
        rules: lines(input.value).map(host => ({ host, type: originalTrackers.get(host) || 'custom' }))
      };
      return;
    }
    setPath(patch, path, lines(input.value));
  });

  root.querySelectorAll('[data-list-text]').forEach(input => {
    const value = input.value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean);
    setPath(patch, input.dataset.listText, value);
  });

  root.querySelectorAll('[data-text="probe.acceptStatus"]').forEach(input => {
    const value = input.value.split(/[,，\s]+/).map(item => Number(item.trim())).filter(n => Number.isInteger(n) && n >= 100 && n <= 599);
    setPath(patch, 'probe.acceptStatus', value);
  });

  root.querySelectorAll('[data-json]').forEach(input => {
    const path = input.dataset.json;
    const { value } = parseJsonField(input.value, path);
    setPath(patch, path, value);
  });

  root.querySelectorAll('[data-svc]').forEach(box => {
    const key = box.dataset.svc;
    const idInput = box.querySelector('[data-svc-id]');
    patch.services = patch.services || {};
    patch.services[key] = {
      enabled: box.querySelector('[data-svc-enabled]').checked,
      url: box.querySelector('[data-svc-url]').value.trim(),
      key: box.querySelector('[data-svc-key]').value.trim()
    };
    if (idInput) patch.services[key].id = idInput.value.trim();
  });

  return patch;
}

async function saveRules(root, original) {
  let patch;
  try {
    patch = collect(root, original);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const button = root.querySelector('[data-rules-act="save"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '保存中…';
  const reply = await send({ type: 'MAPUS_RULES_SET', patch });
  button.disabled = false;
  button.textContent = label;

  if (!reply || !reply.ok) {
    toast('保存失败：' + ((reply && reply.error) || '未知错误'), 'error');
    return;
  }
  const warnings = reply.warnings || [];
  if (warnings.length) {
    toast(`已保存，${warnings.length} 项被修正：${warnings[0]}`, 'warn');
  } else {
    toast('规则已保存', 'ok');
  }
  await mount(root);
}

function download(rules) {
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mapus-rules-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      if (file.size > MAX_TEXTAREA) {
        toast('文件过大', 'error');
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

function bind(root, original) {
  root.querySelector('[data-rules-act="save"]').addEventListener('click', () => saveRules(root, original));

  root.querySelector('[data-rules-act="export"]').addEventListener('click', async () => {
    const reply = await send({ type: 'MAPUS_RULES_EXPORT' });
    if (!reply || !reply.ok) return toast('导出失败', 'error');
    download(reply.rules);
    toast('已导出 JSON', 'ok');
  });

  root.querySelector('[data-rules-act="import"]').addEventListener('click', async () => {
    const text = await pickFile();
    if (!text) return;
    let value;
    try { value = JSON.parse(text); } catch (_) { return toast('文件不是合法 JSON', 'error'); }
    if (!confirm('导入会覆盖当前全部规则，确定继续？')) return;
    const reply = await send({ type: 'MAPUS_RULES_IMPORT', value });
    if (!reply || !reply.ok) return toast('导入失败：' + ((reply && reply.error) || ''), 'error');
    toast('规则已导入', 'ok');
    await mount(root);
  });

  root.querySelector('[data-rules-act="reset"]').addEventListener('click', async () => {
    if (!confirm('恢复全部默认规则？自定义的字典、UA、拦截列表与服务密钥都会被清除。')) return;
    const reply = await send({ type: 'MAPUS_RULES_RESET' });
    if (!reply || !reply.ok) return toast('重置失败', 'error');
    toast('已恢复默认', 'ok');
    await mount(root);
  });

  root.querySelector('[data-rules-act="apply-json"]').addEventListener('click', async () => {
    const raw = root.querySelector('[data-advanced]').value;
    let value;
    try { value = JSON.parse(raw); } catch (error) { return toast('JSON 解析失败：' + error.message, 'error'); }
    if (!confirm('用这份 JSON 覆盖全部规则？')) return;
    const reply = await send({ type: 'MAPUS_RULES_IMPORT', value });
    if (!reply || !reply.ok) return toast('应用失败：' + ((reply && reply.error) || ''), 'error');
    const warnings = reply.warnings || [];
    toast(warnings.length ? `已应用，${warnings.length} 项被修正` : '已应用', warnings.length ? 'warn' : 'ok');
    await mount(root);
  });

  root.querySelector('[data-rules-act="copy-json"]').addEventListener('click', () => {
    copyText(root.querySelector('[data-advanced]').value);
    toast('已复制', 'ok');
  });

  root.querySelectorAll('[data-svc-enabled]').forEach(input => {
    input.addEventListener('change', () => {
      const state = input.closest('[data-svc]').querySelector('[data-svc-state]');
      state.textContent = input.checked ? '启用' : '关闭';
      state.className = 'tag' + (input.checked ? ' ok' : '');
    });
  });
}

export async function mount(host) {
  host.innerHTML = `<div class="rules-loading"><span class="spinner"></span>正在读取规则…</div>`;
  const reply = await send({ type: 'MAPUS_RULES_EXPORT' });
  if (!reply || !reply.ok || !reply.rules) {
    host.innerHTML = `<p class="tiny" style="color:var(--danger)">规则读取失败：${escapeHtml((reply && reply.error) || '后台无响应')}。请重新加载扩展后再试。</p>`;
    return;
  }
  host.innerHTML = shell(reply.rules);
  bind(host, reply.rules);
  const count = host.querySelectorAll('[data-list], [data-json]').length;
  const stat = host.querySelector('[data-rules-stat]');
  if (stat) stat.textContent = `${count} 组可编辑项`;
}
