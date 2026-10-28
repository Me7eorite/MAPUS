(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ADBDebugger = api;
})(globalThis, function () {
    'use strict';

    const METHODS = new Set([
        'Runtime.enable', 'Runtime.addBinding', 'Runtime.evaluate', 'Runtime.getProperties',
        'Page.enable', 'Page.setLifecycleEventsEnabled', 'Page.getFrameTree', 'Page.createIsolatedWorld',
        'Page.navigate', 'Page.reload', 'Page.getNavigationHistory', 'Page.navigateToHistoryEntry',
        'Page.addScriptToEvaluateOnNewDocument', 'Page.removeScriptToEvaluateOnNewDocument',
        'Page.getLayoutMetrics', 'Page.captureScreenshot',
        'Debugger.enable', 'Debugger.pause', 'Debugger.resume', 'Debugger.stepInto', 'Debugger.stepOver',
        'Debugger.stepOut', 'Debugger.setBreakpoint', 'Debugger.setBreakpointByUrl',
        'Debugger.removeBreakpoint', 'Debugger.getScriptSource', 'Debugger.searchInContent',
        'Debugger.evaluateOnCallFrame', 'Network.enable', 'Network.getResponseBody',
        'Storage.getCookies', 'Network.getCookies', 'Network.deleteCookies',
        'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText'
    ]);

    class DebuggerError extends Error {
        constructor(code, message) { super(message); this.name = 'DebuggerError'; this.code = code; }
    }
    const fail = (code, message) => { throw new DebuggerError(code, message); };
    const timeoutOf = (value, fallback) => {
        if (value === undefined) return fallback;
        if (!Number.isInteger(value) || value < 1 || value > 30000) {
            fail('INVALID_PARAMS', 'timeoutMs must be an integer between 1 and 30000.');
        }
        return value;
    };
    function bounded(promise, timeoutMs) {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new DebuggerError('DEBUGGER_TIMEOUT', 'The Chrome debugger operation timed out.')), timeoutMs);
        })]).finally(() => clearTimeout(timer));
    }

    class DebuggerController {
        constructor(chrome, options = {}) {
            this.chrome = chrome;
            this.emit = options.emit || (() => {});
            this.isConnected = options.isConnected || (() => false);
            this.getUserAgent = options.getUserAgent || (() => globalThis.navigator?.userAgent || '');
            this.commandTimeoutMs = timeoutOf(options.commandTimeoutMs, 30000);
            this.records = new Map();
            this.creations = new Set();
            this.generation = 0;
            this.controlRevoked = false;
            this._onEvent = (source, method, params) => {
                if (source?.sessionId || this.controlRevoked || !this.isConnected()) return;
                const record = this.records.get(source?.tabId);
                if (record?.state !== 'ready') return;
                this._emit('debugger.event', { ...this._describe(record), method, params: params || {} });
            };
            this._onDetach = (source, reason) => {
                if (source?.sessionId) return;
                const record = this.records.get(source?.tabId);
                if (!record) return;
                record.attached = false;
                if (reason === 'canceled_by_user') {
                    this.controlRevoked = true;
                    void this._invoke(this.chrome.storage?.local, 'set', [{ adb_browser_control: { enabled: false } }],
                        'DEBUGGER_CONTROL_DISABLED').catch(() => {});
                    void this.detachAll(reason);
                    return;
                }
                this._cancel(record, new DebuggerError('DEBUGGER_DETACHED', `Chrome detached the debugger: ${reason}.`), reason);
                if (!record.attachPending && !record.detachPending) this._forget(record);
            };
            this._onRemoved = tabId => {
                const record = this.records.get(tabId);
                if (!record) return;
                this._cancel(record, new DebuggerError('TAB_NOT_FOUND', 'The debugged tab was closed.'), 'tab_closed');
                if (!record.attachPending) void this._release(record).catch(() => {});
            };
            this._onUpdated = (tabId, change) => {
                const record = this.records.get(tabId);
                if (!record || !change.url) return;
                record.url = change.url;
                void this._allowedUrl(change.url).catch(error => {
                    if (this.records.get(tabId) !== record || record.url !== change.url) return;
                    this._cancel(record, error, 'restricted_navigation');
                    if (!record.attachPending) void this._release(record).catch(() => {});
                });
            };
            this._onPermissionRemoved = permission => {
                if (permission.permissions?.includes('debugger')) void this.detachAll('permission_removed');
            };
            this._onPermissionAdded = () => this._listenDebugger();
            this._onStorageChanged = (changes, area) => {
                if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, 'adb_browser_control')) return;
                this.controlRevoked = changes.adb_browser_control.newValue?.enabled !== true;
                if (this.controlRevoked) void this.detachAll('control_disabled');
            };
            chrome.permissions?.onRemoved?.addListener(this._onPermissionRemoved);
            chrome.permissions?.onAdded?.addListener(this._onPermissionAdded);
            chrome.tabs?.onRemoved?.addListener(this._onRemoved);
            chrome.tabs?.onUpdated?.addListener(this._onUpdated);
            chrome.storage?.onChanged?.addListener(this._onStorageChanged);
            this._listenDebugger();
        }

        _listenDebugger() {
            const api = this.chrome.debugger;
            if (api === this.debuggerApi) return;
            this.debuggerApi?.onEvent?.removeListener(this._onEvent);
            this.debuggerApi?.onDetach?.removeListener(this._onDetach);
            this.debuggerApi = api;
            api?.onEvent?.addListener(this._onEvent);
            api?.onDetach?.addListener(this._onDetach);
        }
        _available() {
            this._listenDebugger();
            return ['attach', 'detach', 'sendCommand'].every(method => typeof this.chrome.debugger?.[method] === 'function');
        }
        _emit(event, data) { try { this.emit(event, data); } catch (_) {  } }
        _describe(record) { return { tabId: record.tabId, sessionId: record.sessionId, url: record.url }; }
        _tabId(tabId) {
            if (!Number.isInteger(tabId) || tabId < 0) fail('INVALID_TAB', 'A nonnegative integer tabId is required.');
        }
        _connected() {
            if (!this.isConnected()) fail('EXTENSION_DISCONNECTED', 'An authenticated MCP bridge connection is required.');
        }
        _chromeMajorVersion() {
            let agent;
            try { agent = this.getUserAgent(); } catch (_) { return null; }
            const match = typeof agent === 'string' && /(?:^|\s)(?:HeadlessChrome|Chrome)\/(\d+)\./.exec(agent);
            const major = match ? Number(match[1]) : NaN;
            return Number.isSafeInteger(major) && major > 0 ? major : null;
        }

        _invoke(owner, method, args, code) {
            return new Promise((resolve, reject) => {
                const failed = error => reject(new DebuggerError(code, error?.message || String(error)));
                try {
                    if (typeof owner?.[method] !== 'function') return failed(new Error(`Chrome ${method} is unavailable.`));
                    const returned = owner[method](...args, result => {
                        const error = this.chrome.runtime?.lastError;
                        if (error) failed(error); else resolve(result);
                    });
                    if (returned?.then) returned.then(resolve, failed);
                } catch (error) { failed(error); }
            });
        }
        async _permission() {
            return Boolean(await bounded(this._invoke(this.chrome.permissions, 'contains', [{ permissions: ['debugger'] }],
                'DEBUGGER_PERMISSION_REQUIRED'), this.commandTimeoutMs));
        }
        async _controlEnabled() {
            if (this.controlRevoked) return false;
            const data = await bounded(this._invoke(this.chrome.storage?.local, 'get', ['adb_browser_control'],
                'DEBUGGER_CONTROL_DISABLED'), this.commandTimeoutMs);
            return !this.controlRevoked && data?.adb_browser_control?.enabled === true;
        }
        async _authorize() {
            this._connected();
            if (!await this._permission()) {
                void this.detachAll('permission_removed');
                fail('DEBUGGER_PERMISSION_REQUIRED', 'The extension needs the debugger manifest permission. Reload the current extension build.');
            }
            if (!await this._controlEnabled()) {
                void this.detachAll('control_disabled');
                fail('DEBUGGER_CONTROL_DISABLED', 'Open the extension MCP panel and click "Re-enable browser control", or "Enable MCP and allow browser control" if MCP is stopped.');
            }
            this._connected();
            if (!this._available()) fail('DEBUGGER_UNAVAILABLE', 'The Chrome debugger API is unavailable.');
        }
        async _allowedUrl(value) {
            let url;
            try { url = new URL(value); } catch (_) { fail('RESTRICTED_TAB', 'The tab does not have a supported URL.'); }
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                if (url.hostname === 'chromewebstore.google.com' ||
                    (url.hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/.test(url.pathname))) {
                    fail('RESTRICTED_TAB', 'Chrome Web Store pages cannot be debugged.');
                }
                return;
            }
            if (url.protocol === 'about:' && url.pathname === 'blank' && !url.search) return;
            if (url.protocol === 'file:') {
                const allowed = await bounded(this._invoke(this.chrome.extension, 'isAllowedFileSchemeAccess', [], 'FILE_ACCESS_REQUIRED'), this.commandTimeoutMs);
                if (!allowed) fail('FILE_ACCESS_REQUIRED', 'Enable access to file URLs in the extension details before debugging a local file.');
                return;
            }
            fail('RESTRICTED_TAB', 'Only HTTP, HTTPS, allowed file URLs and about:blank tabs can be debugged.');
        }
        async _tab(tabId) {
            const tab = await bounded(this._invoke(this.chrome.tabs, 'get', [tabId], 'TAB_NOT_FOUND'), this.commandTimeoutMs);
            await this._allowedUrl(tab.url);
            if (tab.pendingUrl) await this._allowedUrl(tab.pendingUrl);
            return tab;
        }
        _cookieCommand(method, params, tab) {
            let page;
            try { page = new URL(tab.url); } catch (_) {  }
            if (!page || !['http:', 'https:'].includes(page.protocol)) {
                fail('RESTRICTED_TAB', 'Cookie operations require a current HTTP(S) page.');
            }
            if (method === 'Storage.getCookies') {
                if (Object.keys(params).length) fail('INVALID_PARAMS', 'Storage.getCookies does not accept parameters.');
                return;
            }
            if (method === 'Network.getCookies') {
                if (Object.keys(params).some(key => key !== 'urls') || !Array.isArray(params.urls) ||
                    !params.urls.length || params.urls.length > 1000) {
                    fail('INVALID_PARAMS', 'Network.getCookies requires between 1 and 1000 current-origin URLs.');
                }
                for (const value of params.urls) {
                    let url;
                    try { if (typeof value === 'string') url = new URL(value); } catch (_) {  }
                    if (!url || url.username || url.password || url.hash || value.includes('#')) {
                        fail('INVALID_PARAMS', 'Cookie URLs must be absolute URLs without credentials or fragments.');
                    }
                    if (url.origin !== page.origin) fail('COOKIE_SCOPE_MISMATCH', 'Cookie URLs must use the current page origin.');
                }
                return;
            }
            if ((this._chromeMajorVersion() || 0) < 138) {
                fail('UNSUPPORTED_COOKIE_ISOLATION', 'Cookie clearing requires Chrome 138 or newer to preserve other cookie partitions.');
            }
            if (Object.keys(params).some(key => !['name', 'domain', 'path', 'partitionKey'].includes(key)) ||
                typeof params.name !== 'string' || typeof params.domain !== 'string' ||
                typeof params.path !== 'string' || !params.path.startsWith('/')) {
                fail('INVALID_PARAMS', 'Cookie deletion requires an exact name, domain and path, with an optional partitionKey.');
            }
            const domain = params.domain.toLowerCase();
            const domainHost = domain.startsWith('.') ? domain.slice(1) : domain;
            let parsedDomain;
            try { parsedDomain = new URL(`https://${domainHost}/`); } catch (_) {  }
            if (!domainHost || domainHost.startsWith('.') || !parsedDomain || parsedDomain.hostname !== domainHost ||
                parsedDomain.username || parsedDomain.password || parsedDomain.port ||
                parsedDomain.pathname !== '/' || parsedDomain.search || parsedDomain.hash) {
                fail('INVALID_PARAMS', 'The cookie domain must be an exact hostname, optionally prefixed with a dot.');
            }
            if (page.hostname !== domainHost && !(domain.startsWith('.') && page.hostname.endsWith(`.${domainHost}`))) {
                fail('COOKIE_SCOPE_MISMATCH', 'Only cookies matching the current page hostname can be deleted.');
            }
            if (params.partitionKey !== undefined) {
                const key = params.partitionKey;
                if (!key || typeof key !== 'object' || Array.isArray(key) ||
                    Object.keys(key).some(field => !['topLevelSite', 'hasCrossSiteAncestor'].includes(field)) ||
                    typeof key.topLevelSite !== 'string' || key.hasCrossSiteAncestor !== false) {
                    fail('INVALID_PARAMS', 'partitionKey requires topLevelSite and hasCrossSiteAncestor: false.');
                }
                let site;
                try { site = new URL(key.topLevelSite); } catch (_) {  }
                if (!site || !['http:', 'https:'].includes(site.protocol) || site.origin !== key.topLevelSite ||
                    site.username || site.password || site.port) {
                    fail('INVALID_PARAMS', 'partitionKey.topLevelSite must be an HTTP(S) site without credentials, port or path.');
                }
                if (site.protocol !== page.protocol || (page.hostname !== site.hostname && !page.hostname.endsWith(`.${site.hostname}`))) {
                    fail('COOKIE_SCOPE_MISMATCH', 'Only the current top-level site cookie partition can be deleted.');
                }
            }
        }
        _cookieMetadata(result, tab) {
            if (!Array.isArray(result?.cookies)) fail('CDP_COMMAND_FAILED', 'Chrome did not return a cookie list.');
            const hostname = new URL(tab.url).hostname;
            return { cookies: result.cookies.filter(cookie => {
                if (typeof cookie?.domain !== 'string') return false;
                const domain = cookie.domain.toLowerCase();
                return hostname === domain || (domain.startsWith('.') &&
                    (hostname === domain.slice(1) || hostname.endsWith(domain)));
            }).map(({ value, ...metadata }) => metadata) };
        }
        _current(record) {
            this._connected();
            if (record.cancelError) throw record.cancelError;
            if (this.records.get(record.tabId) !== record || record.generation !== this.generation) {
                fail('STALE_DEBUGGER_SESSION', 'The debugger session changed. Attach the tab again.');
            }
        }
        _session(tabId, sessionId) {
            this._tabId(tabId);
            const record = this.records.get(tabId);
            if (typeof sessionId !== 'string' || !sessionId || record?.sessionId !== sessionId || record.state !== 'ready') {
                fail('STALE_DEBUGGER_SESSION', 'Use the sessionId returned by the current debugger attach.');
            }
            this._current(record);
            return record;
        }
        _cancel(record, error, reason) {
            if (record.cancelError) return;
            const visible = record.state === 'ready';
            record.cancelError = error;
            record.state = 'cancelled';
            for (const reject of record.cancelListeners) reject(error);
            record.cancelListeners.clear();
            if (visible) this._emit('debugger.detached', { ...this._describe(record), reason });
        }
        _cancellable(record, promise, timeoutMs) {
            let rejectCancelled;
            let timer;
            const cancelled = new Promise((_, reject) => {
                rejectCancelled = reject;
                if (record.cancelError) reject(record.cancelError);
                else {
                    record.cancelListeners.add(reject);
                    timer = setTimeout(() => reject(new DebuggerError('DEBUGGER_TIMEOUT', 'The Chrome debugger operation timed out.')), timeoutMs);
                }
            });
            return Promise.race([promise, cancelled]).finally(() => {
                clearTimeout(timer);
                record.cancelListeners.delete(rejectCancelled);
            });
        }
        _forget(record) {
            if (this.records.get(record.tabId) === record) this.records.delete(record.tabId);
        }
        async _release(record) {
            if (record.release) return record.release;
            record.release = (async () => {
                try {
                    if (record.attached) {
                        record.detachPending = true;
                        await this._invoke(this.chrome.debugger, 'detach', [{ tabId: record.tabId }], 'DEBUGGER_DETACH_FAILED');
                        record.attached = false;
                    }
                } finally {
                    record.detachPending = false;
                    this._forget(record);
                }
            })();
            return record.release;
        }

        async status() {
            let permissionGranted = false;
            let controlEnabled = false;
            try { permissionGranted = await this._permission(); } catch (_) {  }
            try { controlEnabled = await this._controlEnabled(); } catch (_) {  }
            if (!permissionGranted && this.records.size) void this.detachAll('permission_removed');
            if (!controlEnabled && this.records.size) void this.detachAll('control_disabled');
            return { available: this._available(), permissionGranted, controlEnabled, connected: Boolean(this.isConnected()),
                chromeMajorVersion: this._chromeMajorVersion(),
                sessions: [...this.records.values()].filter(record => record.state === 'ready').map(record => this._describe(record)) };
        }

        async createTab(params = {}) {
            if (!params || typeof params !== 'object' || Array.isArray(params) ||
                Object.keys(params).some(key => !['url', 'active'].includes(key)) ||
                typeof params.url !== 'string' || !params.url.trim() ||
                (params.active !== undefined && typeof params.active !== 'boolean')) {
                fail('INVALID_PARAMS', 'New tabs require an absolute url and an optional boolean active.');
            }
            this._connected();
            const operation = { generation: this.generation, state: 'creating', started: false,
                tab: null, cancelError: null, cancelListeners: new Set() };
            this.creations.add(operation);
            const current = () => {
                this._connected();
                if (operation.cancelError) throw operation.cancelError;
                if (operation.generation !== this.generation) {
                    fail('TAB_CREATE_CANCELLED', 'Browser control changed while creating the tab.');
                }
            };
            const work = (async () => {
                await this._allowedUrl(params.url);
                current();
                await this._authorize();
                current();
                operation.started = true;
                const tab = await this._invoke(this.chrome.tabs, 'create',
                    [{ url: 'about:blank', active: params.active ?? true }], 'TAB_CREATE_FAILED');
                if (!Number.isInteger(tab?.id) || tab.id < 0) {
                    fail('TAB_CREATE_FAILED', 'Chrome did not return the new tab identity. Check the tab list before retrying.');
                }
                operation.tab = { created: true, tabId: tab.id, windowId: tab.windowId,
                    active: tab.active, url: 'about:blank' };
                if (operation.cancelError) this._emit('page.created', { ...operation.tab, late: true });
                current();
                while (true) {
                    current();
                    const observed = await this._invoke(this.chrome.tabs, 'get', [tab.id], 'TAB_NOT_FOUND');
                    current();
                    if ((observed.url && observed.url !== 'about:blank') ||
                        (observed.pendingUrl && observed.pendingUrl !== 'about:blank')) {
                        fail('TAB_CREATE_CANCELLED', 'Tab creation was cancelled: tab_navigated.');
                    }
                    if (observed.url === 'about:blank') break;
                    await new Promise((resolve, reject) => {
                        const cancelled = error => { clearTimeout(timer); reject(error); };
                        const timer = setTimeout(() => {
                            operation.cancelListeners.delete(cancelled);
                            resolve();
                        }, 25);
                        operation.cancelListeners.add(cancelled);
                    });
                }
                await this._authorize();
                current();
                return operation.tab;
            })();
            try {
                return await this._cancellable(operation, work, Math.min(this.commandTimeoutMs, 10000));
            } catch (error) {
                if (error.code === 'DEBUGGER_TIMEOUT') {
                    error = new DebuggerError('TAB_CREATE_TIMEOUT', 'Tab creation timed out. Check the tab list before retrying.');
                }
                error.details = operation.tab ? { ...operation.tab } : operation.started ?
                    { created: 'unknown', mayHaveCreated: true } : { created: false };
                this._cancel(operation, error, 'create_failed');
                throw error;
            } finally {
                this.creations.delete(operation);
            }
        }

        async attach(params = {}) {
            const { tabId } = params;
            this._tabId(tabId);
            this._connected();
            const timeoutMs = timeoutOf(params.timeoutMs, this.commandTimeoutMs);
            const known = this.records.get(tabId);
            if (known) {
                if (known.state === 'cancelled') fail('DEBUGGER_BUSY', 'The previous debugger attachment is still being released. Retry shortly.');
                if (known.state === 'attaching') return known.promise;
                await this._authorize();
                this._current(known);
                return this._describe(known);
            }
            const record = { tabId, sessionId: globalThis.crypto.randomUUID(), generation: this.generation,
                state: 'attaching', attached: false, attachPending: false, url: '', cancelError: null, cancelListeners: new Set() };
            this.records.set(tabId, record);
            const worker = this._attach(record);
            record.promise = this._cancellable(record, worker, timeoutMs).catch(error => {
                this._cancel(record, error, 'attach_failed');
                throw error;
            });
            return record.promise;
        }
        async _attach(record) {
            try {
                await this._authorize();
                this._current(record);
                record.url = (await this._tab(record.tabId)).url;
                this._current(record);
                record.attachPending = true;
                try {
                    await this._invoke(this.chrome.debugger, 'attach', [{ tabId: record.tabId }, '1.3'], 'DEBUGGER_ATTACH_FAILED');
                    record.attached = true;
                } finally { record.attachPending = false; }
                this._current(record);
                await this._authorize();
                record.url = (await this._tab(record.tabId)).url;
                this._current(record);
                record.state = 'ready';
                return this._describe(record);
            } catch (error) {
                this._cancel(record, error, 'attach_failed');
                await this._release(record).catch(() => {});
                throw error;
            }
        }

        async command(params = {}) {
            this._connected();
            const record = this._session(params.tabId, params.sessionId);
            if (!METHODS.has(params.method)) fail('CDP_METHOD_NOT_ALLOWED', 'This CDP method is not available through the extension transport.');
            if (params.params !== undefined && (!params.params || typeof params.params !== 'object' || Array.isArray(params.params))) {
                fail('INVALID_PARAMS', 'CDP params must be an object.');
            }
            if (params.targetId !== undefined || params.debuggee !== undefined || params.childSessionId !== undefined) {
                fail('INVALID_PARAMS', 'Only the attached tab root session can receive commands.');
            }
            const timeoutMs = timeoutOf(params.timeoutMs, this.commandTimeoutMs);
            let settled = false;
            const work = (async () => {
                await this._authorize();
                this._current(record);
                const tab = await this._tab(record.tabId);
                record.url = tab.url;
                if (params.method === 'Page.navigate') await this._allowedUrl(params.params?.url);
                if (['Storage.getCookies', 'Network.getCookies', 'Network.deleteCookies'].includes(params.method)) {
                    this._cookieCommand(params.method, params.params || {}, tab);
                }
                this._current(record);
                if (settled) fail('DEBUGGER_TIMEOUT', 'The command expired before it could be sent to Chrome.');
                if (params.method === 'Network.deleteCookies' && params.params?.partitionKey) {
                    const cookie = params.params;
                    const pageUrl = tab.url;
                    const lookup = new URL(new URL(pageUrl).origin);
                    lookup.pathname = cookie.path;
                    const applicable = await this._invoke(this.chrome.debugger, 'sendCommand',
                        [{ tabId: record.tabId }, 'Network.getCookies', { urls: [lookup.href] }], 'CDP_COMMAND_FAILED');
                    this._current(record);
                    if (settled) fail('DEBUGGER_TIMEOUT', 'The command expired before cookie partition verification finished.');
                    const matched = Array.isArray(applicable?.cookies) && applicable.cookies.some(item => item.name === cookie.name &&
                        item.domain === cookie.domain && item.path === cookie.path && !Object.prototype.hasOwnProperty.call(item, 'partitionKeyOpaque') &&
                        item.partitionKey?.topLevelSite === cookie.partitionKey.topLevelSite &&
                        item.partitionKey?.hasCrossSiteAncestor === cookie.partitionKey.hasCrossSiteAncestor &&
                        Object.keys(item.partitionKey).every(key => ['topLevelSite', 'hasCrossSiteAncestor'].includes(key)));
                    if (!matched) fail('COOKIE_SCOPE_MISMATCH', 'Chrome could not verify this cookie belongs to the current page partition.');
                    await this._authorize();
                    this._current(record);
                    const currentTab = await this._tab(record.tabId);
                    this._current(record);
                    if (currentTab.url !== pageUrl) fail('COOKIE_SCOPE_MISMATCH', 'The page changed while verifying the cookie partition.');
                    this._cookieCommand(params.method, cookie, currentTab);
                    if (settled) fail('DEBUGGER_TIMEOUT', 'The command expired before the cookie could be deleted.');
                }
                const result = await this._invoke(this.chrome.debugger, 'sendCommand',
                    [{ tabId: record.tabId }, params.method, params.params || {}], 'CDP_COMMAND_FAILED');
                this._current(record);
                if (params.method === 'Storage.getCookies' || params.method === 'Network.getCookies') return this._cookieMetadata(result, tab);
                return result || {};
            })();
            return this._cancellable(record, work, timeoutMs).finally(() => { settled = true; });
        }
        async detach(params = {}) {
            this._connected();
            const record = this._session(params.tabId, params.sessionId);
            this._cancel(record, new DebuggerError('DEBUGGER_DETACHED', 'The MCP debugger session was detached.'), 'requested');
            await bounded(this._release(record), Math.min(this.commandTimeoutMs, 5000));
            return { detached: true, ...this._describe(record) };
        }
        async detachAll(reason = 'bridge_disconnected') {
            this.generation++;
            for (const operation of this.creations) {
                const code = reason === 'permission_removed' ? 'DEBUGGER_PERMISSION_REQUIRED' :
                    ['control_disabled', 'canceled_by_user'].includes(reason) ? 'DEBUGGER_CONTROL_DISABLED' : 'TAB_CREATE_CANCELLED';
                this._cancel(operation, new DebuggerError(code, `Tab creation was cancelled: ${reason}.`), reason);
            }
            const records = [...this.records.values()];
            for (const record of records) {
                const code = reason === 'permission_removed' ? 'DEBUGGER_PERMISSION_REQUIRED' :
                    ['control_disabled', 'canceled_by_user'].includes(reason) ? 'DEBUGGER_CONTROL_DISABLED' : 'DEBUGGER_ATTACH_CANCELLED';
                this._cancel(record, new DebuggerError(code, `The debugger session ended: ${reason}.`), reason);
            }
            await Promise.allSettled(records.filter(record => !record.attachPending).map(record =>
                bounded(this._release(record), Math.min(this.commandTimeoutMs, 5000))));
            return { detached: true, count: records.length };
        }
    }

    return { DebuggerController, DebuggerError };
});
