(function () {
  'use strict';
  if (self.MAPUS_ADB_CORE) return;
  self.MAPUS_ADB_CORE = true;

  let bridge = null;
  let serviceRef = null;

  const debuggerController = new ADBDebugger.DebuggerController(chrome, {
    isConnected: () => Boolean(bridge && bridge.connected),
    emit: (event, data) => { if (bridge) bridge.event(event, data); }
  });

  const serviceReady = fetch(chrome.runtime.getURL('scripts.json'))
    .then(response => {
      if (!response.ok) throw new Error('无法读取脚本目录 scripts.json');
      return response.json();
    })
    .then(async catalog => {
      await ADB_I18N.init(chrome);
      const service = new ADBService.ControlService(chrome, catalog, {
        debuggerController,
        emit(event, data) {
          if (bridge) bridge.event(event, data);
          if (event === 'routes.updated') {
            chrome.runtime.sendMessage({
              type: data.framework === 'vue' ? 'VUE_ROUTER_DATA_UPDATE' : 'REACT_ROUTER_DATA_UPDATE',
              hostname: (() => { try { return new URL(data.href).hostname; } catch (_) { return ''; } })(),
              tabId: data.tabId,
              documentId: data.documentId,
              data: data.data
            }).catch(() => {});
          }
          chrome.runtime.sendMessage({ type: 'ADB_EVENT', event, data }).catch(() => {});
        }
      });
      await service.ready;
      service.updateBadges = async () => {};
      serviceRef = service;

      bridge = new ADBBridge.LocalBridge(chrome, service, {
        serializeError: ADBPolicy.serializeError,
        onDisconnect: reason => debuggerController.detachAll(reason)
      });
      await bridge.configure();
      return service;
    });

  function isExtensionPage(sender) {
    return sender.id === chrome.runtime.id &&
      typeof sender.url === 'string' &&
      sender.url.startsWith(chrome.runtime.getURL(''));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    const command = message.type === 'ADB_COMMAND';
    const legacyCommand = ['clear_mode_scripts', 'update_scripts_registration', 'tab_updated'].includes(message.type);
    const contentMessage = [
      'ADB_DOCUMENT_READY', 'ADB_ROUTE_DATA', 'ADB_CONFIG_APPLIED', 'ADB_HOOK_EVENT',
      'VUE_ROUTER_DATA', 'REACT_ROUTER_DATA'
    ].includes(message.type);
    if (!command && !legacyCommand && !contentMessage) return false;

    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }

    if ((command || legacyCommand) && !isExtensionPage(sender)) {
      sendResponse({ ok: false, error: { code: 'FORBIDDEN', message: '只接受来自扩展页面的控制指令。' } });
      return false;
    }
    if (contentMessage && (sender.id !== chrome.runtime.id || !sender.tab)) {
      sendResponse({ ok: false, error: { code: 'FORBIDDEN', message: '需要可信的扩展内容脚本发送方。' } });
      return false;
    }

    serviceReady.then(async service => {
      if (command) {
        const result = await service.execute(message.method, message.params || {}, { source: 'extension' });
        if (message.method === 'capabilities') result.bridge = bridge ? bridge.status() : { enabled: false, connected: false };
        return { ok: true, result };
      }
      if (legacyCommand) {
        if (message.type === 'tab_updated') await service.updateBadges(await chrome.storage.local.get(null));
        else await service.legacyRegistration(message);
        return { ok: true, success: true };
      }
      if (message.type === 'ADB_DOCUMENT_READY') return { ok: true, result: await service.documentReady(sender, message) };
      if (message.type === 'ADB_ROUTE_DATA' || message.type === 'VUE_ROUTER_DATA' || message.type === 'REACT_ROUTER_DATA') {
        await service.receiveRoutes(sender, {
          ...message,
          framework: message.framework || (message.type === 'VUE_ROUTER_DATA' ? 'vue' : 'react')
        });
      } else if (message.type === 'ADB_CONFIG_APPLIED') {
        await service.receiveApplied(sender, message);
      } else if (message.type === 'ADB_HOOK_EVENT') {
        await service.receiveHookEvent(sender, message);
      }
      return { ok: true };
    }).then(sendResponse, error => sendResponse({ ok: false, error: ADBPolicy.serializeError(error) }));
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !['ADB_LIBRARY_SAVE', 'ADB_LIBRARY_DELETE'].includes(message.type)) return false;
    if (!self.MAPUS_GATE.isEnabled()) {
      self.MAPUS_GATE.deny(sendResponse);
      return false;
    }
    if (!isExtensionPage(sender)) {
      sendResponse({ ok: false, error: { code: 'FORBIDDEN', message: '脚本库仅接受扩展页面的操作。' } });
      return false;
    }
    serviceReady.then(async service => {
      const list = await service.scriptLibrary.execute({ action: 'list' });
      if (message.type === 'ADB_LIBRARY_SAVE') {
        const result = await service.scriptLibrary.execute({
          action: 'save',
          id: message.id,
          name: message.name,
          code: message.code,
          matches: message.matches,
          enabled: message.enabled !== false,
          expectedRevision: list.revision
        });
        return { ok: true, result };
      }
      const result = await service.scriptLibrary.execute({
        action: 'delete',
        id: message.id,
        expectedRevision: list.revision
      });
      return { ok: true, result };
    }).then(sendResponse, error => sendResponse({ ok: false, error: ADBPolicy.serializeError(error) }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {    if (namespace !== 'local') return;
    serviceReady.then(async service => {
      if (Object.prototype.hasOwnProperty.call(changes, 'adb_mcp') && bridge) await bridge.configure();
      await service.reconcileExternal(changes);
      if (Object.prototype.hasOwnProperty.call(changes, 'adb_language')) {
        for (const tab of await chrome.tabs.query({})) {
          chrome.tabs.sendMessage(tab.id, { type: 'ADB_LANGUAGE_CHANGED', locale: ADB_I18N.locale }).catch(() => {});
        }
      }
    }).catch(error => console.warn('[ADB] 配置同步失败:', error.message));
  });

  chrome.alarms.onAlarm.addListener(alarm => {
    serviceReady.then(() => bridge && bridge.alarm(alarm)).catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    serviceReady.then(service => service.tabUpdated(tabId, changeInfo)).catch(() => {});
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    serviceReady.then(async service => {
      service.invalidate(tabId, 'TAB_CLOSED');
      await service.persistDocuments();
    }).catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => { serviceReady.catch(() => {}); });

  chrome.runtime.onInstalled.addListener(() => {
    serviceReady.then(service => service.scriptLibrary.reconcile())
      .catch(error => console.warn('[ADB] 脚本库恢复失败:', error.message));
  });

  serviceReady.catch(error => console.error('[ADB] 后台初始化失败:', error.message));

  self.MAPUS_ADB_MASTER = async function (enabled) {
    const service = await serviceReady.catch(() => null);
    if (!service) return;
    if (enabled) {
      await service.reconcile(await chrome.storage.local.get(null));
      return;
    }
    const existing = (await chrome.scripting.getRegisteredContentScripts())
      .filter(item => item.id.startsWith('ad_') || item.id.startsWith('ad2_'));
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(item => item.id) });
    try { debuggerController.detachAll('MAPUS 已停用'); } catch (_) {  }
  };

  self.MAPUS_ADB = {
    get service() { return serviceRef; },
    get bridge() { return bridge; },
    ready: serviceReady
  };
})();
