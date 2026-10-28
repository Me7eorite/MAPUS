importScripts(
  '/background/pagefn.js',
  '/background/core/gate.js',
  '/background/config/fingerprint.config.js',
  '/background/config/rules.defaults.js',
  '/background/core/rules-core.js',
  '/i18n/core.js',
  '/i18n/errors.js',
  '/i18n/catalog.js',
  '/background/adb/policy.js',
  '/background/adb/user-scripts.js',
  '/background/adb/service.js',
  '/background/adb/bridge.js',
  '/background/adb/debugger.js',
  '/background/core/scan-core.js',
  '/background/core/nextanti-core.js',
  '/background/core/adb-core.js',
  '/background/core/browser-core.js',
  '/background/core/findings-core.js',
  '/background/core/harness-core.js',
  '/background/core/agent-core.js',
  '/background/core/dsh-core.js'
);

self.MAPUS_GATE.boot();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.warn('[MAPUS] 侧边栏行为设置失败:', error.message));

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const defaults = {
      dynamicScan: false,
      deepScan: true,
      customWhitelist: [],
      autoScan: {},
      masterSwitch: true,
      mapus_enabled: true,
      ui: { activeView: 'overview' }
    };
    const existing = await chrome.storage.local.get(Object.keys(defaults));
    const patch = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (existing[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  } catch (error) {
    console.warn('[MAPUS] 默认配置写入失败:', error.message);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'MAPUS_ACTIVE_TAB') return false;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    if (!tab) {
      sendResponse({ ok: false });
      return;
    }
    sendResponse({
      ok: true,
      tab: { id: tab.id, url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl }
    });
  });
  return true;
});
