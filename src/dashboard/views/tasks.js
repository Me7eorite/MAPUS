import { $, esc, timeOf, harness, toast, STATUS_TEXT } from '../lib.js';
import { state, refreshTasks, emitChange } from '../store.js';
import { launchHtml, bindLaunch, refreshModelOptions } from './launch.js';

function logLines(task) {
  const list = state.taskLogs.get(task.id) || task.logs || [];
  if (!list.length) return '<div class="log-line dim">（暂无日志）</div>';
  return list.map(line => `<div class="log-line ${line.level || 'info'}">${esc(line.text)}</div>`).join('');
}

export function renderTasks(root) {
  root.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h3>批量下发</h3><p>一行一个站点，任务串行执行，可随时停止或重跑</p></div>
        <button class="btn ghost sm" id="btnRefreshModels">刷新模型列表</button>
      </div>
      ${launchHtml(false)}
    </section>

    <section class="card">
      <div class="card-head">
        <div><h3>扫描任务</h3><p>点「日志」展开智能体的实时执行过程（含思考链）</p></div>
        <button class="btn ghost sm" id="btnClearDone">清理已结束</button>
      </div>
      <div id="taskList" class="task-list"></div>
    </section>`;

  bindLaunch(root);
  const refreshBtn = $('#btnRefreshModels', root);
  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshModelOptions(root));

  $('#btnClearDone', root).addEventListener('click', async () => {
    await harness('HARNESS_CLEAR_DONE');
    await refreshTasks();
    emitChange('task');
  });

  $('#taskList', root).addEventListener('click', async event => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const taskEl = button.closest('.task');
    if (!taskEl) return;
    const id = taskEl.dataset.id;
    const action = button.dataset.act;
    if (action === 'stop' || action === 'retry') {
      await harness('HARNESS_CONTROL', { id, action });
      await refreshTasks();
      emitChange('task');
      return;
    }
    if (action === 'log') {
      taskEl.classList.toggle('open');
      if (taskEl.classList.contains('open')) {
        const box = taskEl.querySelector('.task-log');
        if (box) box.scrollTop = box.scrollHeight;
      }
    }
  });

  renderTaskList($('#taskList', root));
}

export function renderTaskList(box) {
  if (!box) return;
  const openIds = Array.from(box.querySelectorAll('.task.open')).map(node => node.dataset.id);
  if (!state.tasks.length) {
    box.innerHTML = '<div class="empty">还没有任务，在上面填站点开始</div>';
    return;
  }
  box.innerHTML = state.tasks.map(task => {
    const percent = task.steps ? Math.min(100, Math.round((task.step || 0) / task.steps * 100)) : 0;
    const modelLabel = task.modelMode === 'settings' ? '设置模型' : (task.profileName || '档案');
    return `
      <div class="task${task.status === 'running' ? ' running' : ''}${openIds.includes(task.id) ? ' open' : ''}" data-id="${task.id}">
        <div class="task-head">
          <span class="status ${task.status}">${STATUS_TEXT[task.status] || task.status}</span>
          <span class="task-url" title="${esc(task.url)}">${esc(task.url)}</span>
          <span class="spacer"></span>
          <span class="task-tag">${esc(modelLabel)}</span>
          ${task.findings && task.findings.length ? `<span class="sev high">${task.findings.length} 风险</span>` : ''}
          <span class="task-progress">${esc(task.phase || '')} ${task.step || 0}/${task.steps}</span>
          ${['queued', 'running', 'stopping'].includes(task.status) ? '<button class="btn small danger-ghost" data-act="stop">停止</button>' : ''}
          ${['done', 'error', 'stopped'].includes(task.status) ? '<button class="btn small" data-act="retry">重跑</button>' : ''}
          <button class="btn small ghost" data-act="log">日志</button>
        </div>
        <div class="task-bar"><i style="width:${percent}%"></i></div>
        ${task.error ? `<div class="task-error">${esc(task.error)}</div>` : ''}
        <div class="task-log">${logLines(task)}</div>
      </div>`;
  }).join('');
}

export function appendLog(box, taskId, line) {
  if (!box) return;
  const task = box.querySelector(`.task[data-id="${taskId}"]`);
  if (!task || !task.classList.contains('open')) return;
  const logBox = task.querySelector('.task-log');
  if (!logBox) return;
  const node = document.createElement('div');
  node.className = 'log-line ' + (line.level || 'info');
  node.textContent = line.text;
  logBox.appendChild(node);
  while (logBox.children.length > 300) logBox.removeChild(logBox.firstChild);
  logBox.scrollTop = logBox.scrollHeight;
}

export function refreshTaskMeta(box, task) {
  if (!box || !task) return;
  const el = box.querySelector(`.task[data-id="${task.id}"]`);
  if (!el) return;
  const head = el.querySelector('.task-progress');
  if (head) head.textContent = `${task.phase || ''} ${task.step || 0}/${task.steps}`;
  const bar = el.querySelector('.task-bar i');
  if (bar) bar.style.width = `${Math.min(100, Math.round((task.step || 0) / (task.steps || 1) * 100))}%`;
  const stamp = el.querySelector('.task-stamp');
  if (stamp) stamp.textContent = timeOf(Date.now());
}
