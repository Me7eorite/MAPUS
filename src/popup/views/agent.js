import { ICON, escapeHtml } from '../ui.js';

let mounted = null;
let loading = null;
let pending = null;

export function renderAgent(root, ctx) {
  if (mounted) {
    mounted(root, ctx);
    return;
  }
  pending = ctx;
  if (loading) return;
  if (!root.dataset.booting) {
    root.dataset.booting = '1';
    root.innerHTML = `<div class="agent-loading">${ICON.agent}<span>正在加载智能体界面…</span></div>`;
  }
  loading = import(chrome.runtime.getURL('popup/agent.bundle.js'))
    .then(module => {
      mounted = module.mountAgent;
      delete root.dataset.booting;
      mounted(root, pending);
    })
    .catch(error => {
      delete root.dataset.booting;
      loading = null;
      root.innerHTML = `<div class="notice danger">智能体界面加载失败：${escapeHtml(error.message)}<br>请先执行 npm run build:ui</div>`;
    });
}
