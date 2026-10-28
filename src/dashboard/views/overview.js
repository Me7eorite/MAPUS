import { $, esc, dayOf } from '../lib.js';
import { state, stats, filteredFindings } from '../store.js';
import { launchHtml, bindLaunch } from './launch.js';
import { openFinding } from './findings.js';
import { switchTab } from '../app.js';

const LEVELS = ['critical', 'high', 'medium', 'low', 'info'];

export function renderOverview(root) {
  const info = stats();
  const active = state.tasks.filter(task => ['running', 'queued', 'stopping'].includes(task.status));
  const recent = state.findings.slice().reverse().slice(0, 6);

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">覆盖站点</span>
        <b class="stat-value">${info.sites}</b>
        <span class="stat-foot">任务 ${info.tasks} 个</span>
      </div>
      <div class="stat-card accent">
        <span class="stat-label">风险总数</span>
        <b class="stat-value">${info.findings}</b>
        <span class="stat-foot">严重 ${info.levels.critical || 0} · 高危 ${info.levels.high || 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">执行中</span>
        <b class="stat-value">${info.running}</b>
        <span class="stat-foot">${info.running ? '智能体正在跑' : '当前空闲'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">模型档案</span>
        <b class="stat-value">${info.profiles}</b>
        <span class="stat-foot">${state.agentConfig && state.agentConfig.model ? `设置模型 ${esc(state.agentConfig.model)}` : '设置里还没配模型'}</span>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <div><h3>快速下发</h3><p>填站点、选模型、点开始，智能体会逐个站点跑</p></div>
      </div>
      ${launchHtml(true)}
    </section>

    <div class="two-col">
      <section class="card">
        <div class="card-head">
          <div><h3>进行中的任务</h3><p>点「查看」跳到任务页看实时日志</p></div>
          <button class="btn ghost sm" data-goto="tasks">全部任务</button>
        </div>
        <div class="mini-list">
          ${active.length ? active.map(task => `
            <div class="mini-row">
              <span class="status ${task.status}">${task.status === 'running' ? '执行中' : task.status === 'queued' ? '排队' : '停止中'}</span>
              <span class="mini-url" title="${esc(task.url)}">${esc(task.url)}</span>
              <span class="spacer"></span>
              <span class="mini-meta">${esc(task.phase || '')} ${task.step || 0}/${task.steps}</span>
            </div>`).join('') : '<div class="empty">当前没有运行中的任务</div>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><h3>最近风险</h3><p>点任意一条看完整 HTTP 报文</p></div>
          <button class="btn ghost sm" data-goto="findings">全部风险</button>
        </div>
        <div class="mini-list">
          ${recent.length ? recent.map(item => `
            <div class="mini-row finding-row" data-id="${item.id}">
              <span class="sev ${item.severity}">${item.severity}</span>
              <span class="mini-url" title="${esc(item.title)}">${esc(item.title)}</span>
              <span class="spacer"></span>
              <span class="mini-meta">${dayOf(item.createdAt)}</span>
            </div>`).join('') : '<div class="empty">还没有风险记录</div>'}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><div><h3>等级分布</h3><p>按当前全部风险统计</p></div></div>
      <div class="level-bar">
        ${LEVELS.map(level => {
          const count = info.levels[level] || 0;
          const total = Math.max(1, info.findings);
          return `<div class="level-row" data-level="${level}">
            <span class="sev ${level}">${level}</span>
            <span class="level-track"><i style="width:${Math.round(count / total * 100)}%"></i></span>
            <b>${count}</b>
          </div>`;
        }).join('')}
      </div>
    </section>`;

  bindLaunch(root);
  root.querySelectorAll('[data-goto]').forEach(node => {
    node.addEventListener('click', () => switchTab(node.dataset.goto));
  });
  root.querySelectorAll('.finding-row').forEach(node => {
    node.addEventListener('click', () => openFinding(node.dataset.id));
  });
  void filteredFindings;
}
