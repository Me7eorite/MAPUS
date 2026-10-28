import { $, esc, dayOf, timeOf, harness, toast, STATUS_TEXT, SEV_TEXT } from '../lib.js';
import { state, refreshTasks, emitChange, pushLog } from '../store.js';
import { openFinding } from './findings.js';
import { switchTab } from '../app.js';

const LEVELS = ['critical', 'high', 'medium', 'low', 'info'];

function groupByHost() {
  const map = new Map();
  const put = host => {
    if (!map.has(host)) map.set(host, { host, tasks: [], findings: [], levels: {}, lastAt: 0 });
    return map.get(host);
  };
  for (const task of state.tasks) {
    const item = put(task.host);
    item.tasks.push(task);
    item.lastAt = Math.max(item.lastAt, task.endedAt || task.startedAt || task.createdAt || 0);
  }
  for (const item of state.findings) {
    const group = put(item.host);
    group.findings.push(item);
    group.levels[item.severity] = (group.levels[item.severity] || 0) + 1;
    group.lastAt = Math.max(group.lastAt, item.createdAt || 0);
  }
  return Array.from(map.values()).sort((a, b) => b.lastAt - a.lastAt);
}

function taskStatusCount(tasks) {
  const count = { done: 0, running: 0, error: 0, queued: 0, stopped: 0 };
  for (const task of tasks) {
    const key = count[task.status] === undefined ? 'queued' : task.status;
    count[key] = (count[key] || 0) + 1;
  }
  return count;
}

function summaryCard(group) {
  const count = taskStatusCount(group.tasks);
  const total = group.findings.length;
  const risk = (group.levels.critical || 0) + (group.levels.high || 0);
  const running = group.tasks.some(task => ['running', 'queued', 'stopping'].includes(task.status));
  return `
    <div class="site-card${risk ? ' risky' : ''}${running ? ' running' : ''}" data-host="${esc(group.host)}">
      <div class="site-top">
        <span class="site-host" title="${esc(group.host)}">${esc(group.host)}</span>
        <span class="spacer"></span>
        ${running ? '<span class="status running">执行中</span>' : ''}
        <span class="site-findings">${total} 风险</span>
      </div>
      <div class="site-levels">
        ${LEVELS.map(level => (group.levels[level] ? `<span class="sev ${level}">${SEV_TEXT[level]} ${group.levels[level]}</span>` : '')).join('')}
        ${!total ? '<span class="muted tiny">暂无风险</span>' : ''}
      </div>
      <div class="site-foot">
        <span class="tiny muted">任务 ${group.tasks.length}（完成 ${count.done} · 出错 ${count.error}）</span>
        <span class="spacer"></span>
        <span class="tiny muted">${dayOf(group.lastAt)}</span>
        <button class="btn small ghost" data-act="open">查看</button>
      </div>
    </div>`;
}

function taskRow(task) {
  const percent = task.steps ? Math.min(100, Math.round((task.step || 0) / task.steps * 100)) : 0;
  const modelLabel = task.modelMode === 'settings' ? '设置模型' : (task.profileName || '档案');
  const open = state.openTaskIds.includes(task.id);
  const logs = state.taskLogs.get(task.id) || task.logs || [];
  return `
    <div class="task${task.status === 'running' ? ' running' : ''}${open ? ' open' : ''}" data-id="${task.id}">
      <div class="task-head">
        <span class="status ${task.status}">${STATUS_TEXT[task.status] || task.status}</span>
        <span class="task-url" title="${esc(task.url)}">${esc(task.url)}</span>
        <span class="spacer"></span>
        <span class="task-tag">${esc(modelLabel)}</span>
        <span class="task-progress">${esc(task.phase || '')} ${task.step || 0}/${task.steps}</span>
        ${['queued', 'running', 'stopping'].includes(task.status) ? '<button class="btn small danger-ghost" data-act="stop">停止</button>' : ''}
        ${['done', 'error', 'stopped'].includes(task.status) ? '<button class="btn small" data-act="retry">重跑</button>' : ''}
        <button class="btn small ghost" data-act="log">日志</button>
      </div>
      <div class="task-bar"><i style="width:${percent}%"></i></div>
      <div class="task-stamp tiny muted">
        创建 ${dayOf(task.createdAt)}${task.startedAt ? ` · 开始 ${timeOf(task.startedAt)}` : ''}${task.endedAt ? ` · 结束 ${timeOf(task.endedAt)}` : ''}
      </div>
      ${task.error ? `<div class="task-error">${esc(task.error)}</div>` : ''}
      <div class="task-log">${logs.length ? logs.map(line => `<div class="log-line ${line.level || 'info'}">${esc(line.text)}</div>`).join('') : '<div class="log-line dim">（暂无日志）</div>'}</div>
    </div>`;
}

function findingRow(item) {
  return `
    <div class="finding" data-severity="${item.severity}" data-id="${item.id}">
      <div class="finding-top">
        <span class="sev ${item.severity}">${SEV_TEXT[item.severity] || item.severity}</span>
        <span class="finding-title">${esc(item.title)}</span>
        <span class="spacer"></span>
        ${item.cwe ? `<span class="cwe-chip">${esc(item.cwe)}</span>` : ''}
      </div>
      <div class="finding-meta">${esc(item.url)} · ${dayOf(item.createdAt)}</div>
    </div>`;
}

export function renderSites(root) {
  const focus = state.siteFocus;
  const groups = groupByHost();
  const query = (state.siteQuery || '').trim().toLowerCase();
  const list = query ? groups.filter(group => group.host.toLowerCase().includes(query)) : groups;

  if (focus) {
    const group = groups.find(item => item.host === focus) || { host: focus, tasks: [], findings: [], levels: {} };
    root.innerHTML = `
      <section class="card">
        <div class="card-head">
          <div>
            <h3>${esc(group.host)}</h3>
            <p>该站点的全部扫描任务与结果</p>
          </div>
          <div class="card-tools">
            <button class="btn ghost sm" id="btnBack">返回站点列表</button>
            <button class="btn sm" id="btnRerun">重新扫描</button>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><span class="stat-label">风险</span><b class="stat-value">${group.findings.length}</b><span class="stat-foot">严重 ${group.levels.critical || 0} · 高危 ${group.levels.high || 0}</span></div>
          <div class="stat-card"><span class="stat-label">任务</span><b class="stat-value">${group.tasks.length}</b><span class="stat-foot">最近 ${dayOf(group.lastAt)}</span></div>
        </div>
        <div class="level-bar">
          ${LEVELS.map(level => {
            const count = group.levels[level] || 0;
            return `<div class="level-row" data-level="${level}">
              <span class="sev ${level}">${SEV_TEXT[level]}</span>
              <span class="level-track"><i style="width:${Math.round(count / Math.max(1, group.findings.length) * 100)}%"></i></span>
              <b>${count}</b>
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h3>任务时间线</h3><p>点「日志」看智能体的完整执行过程与思考链</p></div></div>
        <div id="siteTaskList" class="task-list">
          ${group.tasks.length ? group.tasks.slice().reverse().map(taskRow).join('') : '<div class="empty">这个站点还没有任务</div>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><h3>该站点的风险</h3><p>点任意一条看完整请求/响应包</p></div>
          <button class="btn ghost sm" id="btnSiteExport">导出 JSON</button>
        </div>
        <div id="siteFindingList" class="finding-list">
          ${group.findings.length ? group.findings.slice().reverse().map(findingRow).join('') : '<div class="empty">这个站点还没有发现风险</div>'}
        </div>
      </section>

      <div id="detailMask" class="mask hidden"><div class="detail" id="detailBox"></div></div>`;

    $('#btnBack', root).addEventListener('click', () => {
      state.siteFocus = '';
      switchTab('sites');
    });
    $('#btnRerun', root).addEventListener('click', async () => {
      const url = (group.tasks[group.tasks.length - 1] || {}).url || `https://${group.host}/`;
      const res = await harness('HARNESS_ENQUEUE', { urls: [url], options: { modelMode: state.launch.useSettingsModel ? 'settings' : 'profile', profileId: state.launch.profileId, steps: state.launch.steps } });
      toast(res && res.ok ? '已重新下发' : '下发失败');
      state.siteFocus = '';
      switchTab('tasks');
    });
    $('#btnSiteExport', root).addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(group.findings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mapus-${group.host}-${Date.now()}.json`;
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    const taskBox = $('#siteTaskList', root);
    taskBox.addEventListener('click', async event => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const el = button.closest('.task');
      if (!el) return;
      const id = el.dataset.id;
      const action = button.dataset.act;
      if (action === 'stop' || action === 'retry') {
        await harness('HARNESS_CONTROL', { id, action });
        await refreshTasks();
        emitChange('task');
        state.siteFocus = focus;
        switchTab('sites');
        return;
      }
      if (action === 'log') {
        const index = state.openTaskIds.indexOf(id);
        if (index >= 0) state.openTaskIds.splice(index, 1);
        else state.openTaskIds.push(id);
        el.classList.toggle('open');
        const box = el.querySelector('.task-log');
        if (box && el.classList.contains('open')) box.scrollTop = box.scrollHeight;
      }
    });

    $('#siteFindingList', root).addEventListener('click', event => {
      const item = event.target.closest('.finding');
      if (item) openFinding(item.dataset.id);
    });
    $('#detailMask', root).addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden');
    });
    return;
  }

  root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h3>站点</h3><p>按站点聚合扫描任务与风险项，点「查看」进入单站详情</p></div>
        <div class="card-tools">
          <input id="siteQuery" class="input inline-select" placeholder="搜索站点" value="${esc(state.siteQuery || '')}">
          <button class="btn ghost sm" id="btnSiteRefresh">刷新</button>
        </div>
      </div>
      <div class="site-grid" id="siteGrid">
        ${list.length ? list.map(summaryCard).join('') : '<div class="empty">还没有任何站点记录</div>'}
      </div>
    </section>`;

  const input = $('#siteQuery', root);
  input.addEventListener('input', () => {
    state.siteQuery = input.value;
    const filtered = groupByHost().filter(group => group.host.toLowerCase().includes(input.value.trim().toLowerCase()));
    $('#siteGrid', root).innerHTML = filtered.length ? filtered.map(summaryCard).join('') : '<div class="empty">没有匹配的站点</div>';
  });
  $('#btnSiteRefresh', root).addEventListener('click', async () => {
    await refreshTasks();
    emitChange('task');
  });
  $('#siteGrid', root).addEventListener('click', event => {
    const card = event.target.closest('.site-card');
    if (!card) return;
    state.siteFocus = card.dataset.host;
    switchTab('sites');
  });
}

export function refreshSitePanel(box) {
  if (!box || state.tab !== 'sites') return;
  renderSites(box);
}

export function siteLogLine(taskId, line) {
  const box = document.getElementById('siteTaskList');
  if (!box) return;
  const el = box.querySelector(`.task[data-id="${taskId}"]`);
  if (!el || !el.classList.contains('open')) {
    pushLog(taskId, line);
    return;
  }
  const logBox = el.querySelector('.task-log');
  if (!logBox) return;
  const node = document.createElement('div');
  node.className = 'log-line ' + (line.level || 'info');
  node.textContent = line.text;
  logBox.appendChild(node);
  while (logBox.children.length > 300) logBox.removeChild(logBox.firstChild);
  logBox.scrollTop = logBox.scrollHeight;
}
