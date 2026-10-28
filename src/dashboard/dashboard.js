import { mountApp } from './app.js';

mountApp().catch(error => {
  const box = document.querySelector('.panel.active') || document.body;
  box.innerHTML = `<div class="notice danger">控制大屏启动失败：${String(error && error.message)}</div>`;
});
