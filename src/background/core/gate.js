(function () {
  'use strict';
  if (self.MAPUS_GATE) return;

  const KEY = 'mapus_enabled';
  let enabled = true;
  let applying = Promise.resolve();

  const ready = (async () => {
    try {
      const data = await chrome.storage.local.get([KEY]);
      enabled = data[KEY] !== false;
    } catch (_) {  }
    return enabled;
  })();

  function isEnabled() {
    return enabled;
  }

  function deny(sendResponse) {
    sendResponse({ ok: false, error: { code: 'DISABLED', message: 'MAPUS 已停用，请先在侧边栏重新启用。' } });
  }

  async function applyEngines(on) {
    if (typeof self.MAPUS_ANTI_MASTER === 'function') {
      try { await self.MAPUS_ANTI_MASTER(on); } catch (error) { console.warn('[MAPUS] 隐私防护切换失败:', error && error.message); }
    }
    if (typeof self.MAPUS_ADB_MASTER === 'function') {
      try { await self.MAPUS_ADB_MASTER(on); } catch (error) { console.warn('[MAPUS] 脚本引擎切换失败:', error && error.message); }
    }
    if (typeof self.MAPUS_AGENT_MASTER === 'function') {
      try { self.MAPUS_AGENT_MASTER(on); } catch (error) { console.warn('[MAPUS] 智能体切换失败:', error && error.message); }
    }
  }

  async function broadcast(on) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        chrome.tabs.sendMessage(tab.id, { type: 'MAPUS_MASTER', enabled: on }).catch(() => {});
      }
    } catch (_) {  }
    try {
      chrome.runtime.sendMessage({ type: 'MAPUS_MASTER_STATE', enabled: on }).catch(() => {});
    } catch (_) {  }
  }

  function apply(on) {
    applying = applying.then(async () => {
      enabled = on !== false;
      await applyEngines(enabled);
      await broadcast(enabled);
    }).catch(error => { console.warn('[MAPUS] 停用切换失败:', error && error.message); });
    return applying;
  }

  async function boot() {
    await ready;
    if (!enabled) await apply(false);
  }

  async function setEnabled(on) {
    await chrome.storage.local.set({ [KEY]: on !== false });
    await apply(on);
    return enabled;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.prototype.hasOwnProperty.call(changes, KEY)) return;
    const next = changes[KEY].newValue !== false;
    if (next === enabled) return;
    apply(next);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'MAPUS_MASTER_PING') return false;
    ready.then(() => sendResponse({ ok: true, enabled }));
    return true;
  });

  self.MAPUS_GATE = { ready, isEnabled, apply, boot, setEnabled, deny, KEY };
})();
