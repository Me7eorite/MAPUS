(function (root, factory) {
    const policy = typeof module === 'object' && module.exports ? require('./policy.js') : root.ADBPolicy;
    const userScripts = typeof module === 'object' && module.exports ? require('./user-scripts.js') : root.ADBUserScripts;
    const i18n = typeof module === 'object' && module.exports ? require('../i18n/core.js') : root.ADB_I18N;
    if (typeof module === 'object' && module.exports) require('../i18n/catalog.js');
    const api = factory(policy, userScripts, i18n);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ADBService = api;
})(globalThis, function (P, U, I) {
    'use strict';
    const REVISION = 'adb_revision';
    const SESSION = 'adb_browser_session';
    const TARGETS = 'adb_documents';
    const METHODS = ['capabilities', 'pages.list', 'scripts.list', 'scripts.prepare', 'state.get', 'scripts.set', 'hooks.set', 'mode.set', 'routes.get', 'page.mark', 'library.list', 'library.get', 'library.update', 'library.delete', 'library.setEnabled', 'library.manage'];
    const DEBUGGER_METHODS = ['debugger.status', 'debugger.attach', 'debugger.command', 'debugger.detach', 'debugger.detachAll'];
    const uid = () => globalThis.crypto.randomUUID();
    const modeOf = data => data.antidebug_mode === 'global' ? 'global' : 'standard';
    const revisionOf = data => Number.isSafeInteger(data[REVISION]) ? data[REVISION] : 0;
    const isHost = host => {
        if (typeof host !== 'string' || !host || host.length > 255 || /[\s/\\?#@]/.test(host)) return false;
        try { return new URL(`http://${host}`).hostname === host; } catch (_) { return false; }
    };
    const hostOf = tab => {
        try { return new URL(tab.url).hostname; } catch (_) { return ''; }
    };

    class ControlService {
        constructor(chrome, catalog, options = {}) {
            this.chrome = chrome;
            this.catalog = catalog;
            this.emit = options.emit || (() => {});
            this.scriptLibrary = new U.UserScriptLibrary(chrome, { emit: this.emit });
            this.debuggerController = options.debuggerController;
            this.now = options.now || Date.now;
            this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
            this.scriptSources = new Map();
            this.documents = new Map();
            this.routes = new Map();
            this.waiters = new Map();
            this.staleDocuments = new Set();
            this.queue = Promise.resolve();
            this.registrationError = null;
            this.ready = this.initialize();
        }
        async initialize() {
            const session = await this.chrome.storage.session.get([SESSION, TARGETS]);
            this.browserSessionId = session[SESSION] || uid();
            for (const record of session[TARGETS] || []) {
                if (Number.isInteger(record.tabId) && record.documentId) this.documents.set(record.tabId, record);
            }
            await this.chrome.storage.session.set({ [SESSION]: this.browserSessionId });
            const data = await this.chrome.storage.local.get(null);
            if (self.MAPUS_GATE) await self.MAPUS_GATE.ready;
            if (!self.MAPUS_GATE || self.MAPUS_GATE.isEnabled()) {
                try { await this.reconcile(data); }
                catch (error) { this.registrationError = P.serializeError(error); }
            }
            await this.scriptLibrary.ready;
        }
        exclusive(work) {
            const next = this.queue.then(() => this.ready).then(work);
            this.queue = next.catch(() => {});
            return next;
        }
        async persistDocuments() {
            await this.chrome.storage.session.set({ [TARGETS]: [...this.documents.values()].slice(-200) });
        }
        async tab(tabId) {
            if (!Number.isInteger(tabId) || tabId < 0) P.fail('INVALID_PARAMS', 'A nonnegative integer tabId is required.');
            try { return await this.chrome.tabs.get(tabId); }
            catch (_) { P.fail('TAB_NOT_FOUND', 'The requested tab no longer exists.', { tabId }); }
        }
        target(record) {
            return { browserSessionId: this.browserSessionId, tabId: record.tabId, frameId: 0, documentId: record.documentId, locationRevision: record.locationRevision || 0 };
        }
        configFor(script, data) {
            return P.normalizeConfig(script, data[`${script.id}_config`]);
        }
        language(data) { return I.resolve(data.adb_language, this.chrome.i18n?.getUILanguage?.() || 'en'); }
        languageFiles(data) { return ['i18n/core.js', 'i18n/logs.js', `i18n/page-${this.language(data)}.js`]; }
        snapshot(data, tab, record) {
            const mode = modeOf(data);
            const ids = P.normalize(mode === 'global' ? data.global_scripts : data[hostOf(tab)], this.catalog);
            const configs = {};
            const configErrors = {};
            for (const id of ids) {
                const script = this.catalog.find(item => item.id === id);
                if (P.configSchema(script)) {
                    try { configs[id] = this.configFor(script, data); }
                    catch (error) { configErrors[id] = P.serializeError(error); }
                }
            }
            return {
                browserSessionId: this.browserSessionId,
                tabId: tab.id,
                documentId: record ? record.documentId : null,
                frameId: 0,
                revision: revisionOf(data),
                locale: this.language(data),
                mode,
                hostname: hostOf(tab),
                enabledScripts: P.combine(ids, this.catalog),
                logicalEnabledScripts: ids,
                configs,
                configErrors,
                mergedHooks: P.mergedHooks(ids, this.catalog)
            };
        }
        async state(tabId) {
            const tab = await this.tab(tabId);
            const data = await this.chrome.storage.local.get(null);
            const record = this.documents.get(tabId);
            const snapshot = this.snapshot(data, tab, record);
            const applied = record && Array.isArray(record.appliedScripts) ? record.appliedScripts : [];
            const hasCurrentRevision = record && record.appliedRevision === snapshot.revision;
            const pageReady = !!record;
            return {
                ...snapshot,
                url: tab.url,
                target: record ? this.target(record) : null,
                enabledScripts: snapshot.logicalEnabledScripts,
                registeredScripts: snapshot.enabledScripts,
                appliedScripts: applied,
                appliedRevision: record ? record.appliedRevision : null,
                pageReady,
                pendingScripts: snapshot.enabledScripts.filter(id => !hasCurrentRevision || !applied.includes(id)),
                removedPendingReload: applied.filter(id => !snapshot.enabledScripts.includes(id)),
                requiresReload: pageReady && (!hasCurrentRevision || applied.some(id => !snapshot.enabledScripts.includes(id)) || snapshot.enabledScripts.some(id => !applied.includes(id))),
                hookConfigScope: 'global',
                registrationError: this.registrationError
            };
        }
        async packagedSource(id) {
            if (!/^[A-Za-z0-9_-]+$/.test(id) || (id !== 'adb_runtime' && !this.catalog.some(script => script.id === id))) {
                P.fail('UNKNOWN_SCRIPT', 'Only packaged catalog scripts can be prepared.', { scriptId: id });
            }
            return this.packagedFile(`scripts/${id}.js`);
        }
        async packagedFile(file) {
            if (!this.scriptSources.has(file)) {
                const loading = (async () => {
                    const response = await this.fetch(this.chrome.runtime.getURL(file));
                    if (!response.ok) P.fail('SCRIPT_SOURCE_UNAVAILABLE', 'Could not read a packaged script.', { file });
                    return response.text();
                })();
                this.scriptSources.set(file, loading);
                loading.catch(() => { this.scriptSources.delete(file); });
            }
            return this.scriptSources.get(file);
        }
        async prepareScripts(params) {
            const tab = await this.tab(params.tabId);
            let url;
            try {
                if (params.url !== undefined && typeof params.url !== 'string') throw new Error('Invalid URL type');
                url = new URL(params.url === undefined ? tab.url : params.url);
            } catch (_) { P.fail('INVALID_PARAMS', 'url must be an absolute HTTP(S) URL.'); }
            if (!['http:', 'https:'].includes(url.protocol)) P.fail('UNSUPPORTED_URL', 'Script preparation requires an HTTP(S) target URL.');
            const data = await this.chrome.storage.local.get(null);
            const snapshot = this.snapshot(data, { ...tab, url: url.href }, null);
            if (Object.keys(snapshot.configErrors).length) {
                P.fail('INVALID_CONFIG', 'Correct the invalid Hook settings before preparing navigation scripts.', { configErrors: snapshot.configErrors });
            }
            const ids = ['adb_runtime', ...snapshot.enabledScripts];
            const files = await Promise.all(ids.map(async id => ({ id, source: await this.packagedSource(id) })));
            const languageSources = await Promise.all(this.languageFiles(data).map(file => this.packagedFile(file)));
            files[0].source = languageSources.join('\n;\n') + '\n;\n' + files[0].source;
            return { hostname: snapshot.hostname, mode: snapshot.mode, revision: snapshot.revision,
                enabledScripts: snapshot.enabledScripts, configs: snapshot.configs, mergedHooks: snapshot.mergedHooks, files };
        }
        expected(params, data) {
            if (params.expectedRevision !== undefined && params.expectedRevision !== revisionOf(data)) {
                P.fail('REVISION_CONFLICT', 'Configuration changed; read state and retry.', { expectedRevision: params.expectedRevision, actualRevision: revisionOf(data) });
            }
        }
        applyMode(value) {
            const apply = value || 'next_navigation';
            if (!['next_navigation', 'reload'].includes(apply)) P.fail('INVALID_PARAMS', 'apply must be next_navigation or reload.');
            return apply;
        }
        desiredRegistrations(data) {
            const desired = [];
            const mode = modeOf(data);
            const scopes = mode === 'global' ? [['global', data.global_scripts, ['<all_urls>']]] :
                Object.entries(data).filter(([key, value]) => key !== 'global_scripts' && isHost(key) && Array.isArray(value))
                    .map(([key, value]) => [key, value, [`*://${key}/*`]]);
            for (const [scope, ids, matches] of scopes) {
                const scripts = P.combine(ids, this.catalog);
                if (!scripts.length) continue;
                desired.push({
                    id: `ad2_${encodeURIComponent(scope).replace(/%/g, '_')}`,
                    js: [...this.languageFiles(data), 'scripts/adb_runtime.js', ...scripts.map(id => `scripts/${id}.js`)],
                    matches,
                    runAt: 'document_start',
                    world: 'MAIN',
                    allFrames: false,
                    persistAcrossSessions: true
                });
            }
            return desired;
        }
        async reconcile(data) {
            const desired = this.desiredRegistrations(data);
            const existing = (await this.chrome.scripting.getRegisteredContentScripts())
                .filter(item => item.id.startsWith('ad_') || item.id.startsWith('ad2_'));
            const equal = (a, b) => a && b && JSON.stringify(a.js) === JSON.stringify(b.js) && JSON.stringify(a.matches) === JSON.stringify(b.matches)
                && a.world === b.world && a.runAt === b.runAt && !a.allFrames;
            const remove = existing.filter(item => !equal(item, desired.find(entry => entry.id === item.id)));
            try {
                if (remove.length) await this.chrome.scripting.unregisterContentScripts({ ids: remove.map(item => item.id) });
                const remaining = existing.filter(item => !remove.includes(item));
                const add = desired.filter(item => !equal(remaining.find(entry => entry.id === item.id), item));
                if (add.length) await this.chrome.scripting.registerContentScripts(add);
                this.registrationError = null;
            } catch (error) {
                const wrapped = new P.CommandError('REGISTRATION_FAILED', 'Script registration failed; the saved configuration will be retried.', { cause: error.message });
                this.registrationError = P.serializeError(wrapped);
                throw wrapped;
            }
        }
        async commit(data, changes, tabId, apply) {
            const revision = revisionOf(data) + 1;
            const next = { ...data, ...changes, [REVISION]: revision };
            await this.chrome.storage.local.set({ ...changes, [REVISION]: revision });
            try { await this.reconcile(next); }
            catch (error) {
                error.details = { ...error.details, saved: true, revision, requiresReload: true };
                throw error;
            }
            await this.updateBadges(next);
            this.emit('config.changed', { revision, mode: modeOf(next), requiresReload: true });
            if (tabId !== undefined && apply === 'reload') {
                try { await this.chrome.tabs.reload(tabId); }
                catch (error) { P.fail('RELOAD_FAILED', 'Configuration was saved, but the target could not be reloaded.', { saved: true, revision, cause: error.message }); }
            }
            return { revision, saved: true, registrationUpdated: true, apply, requiresReload: apply !== 'reload', reloadRequested: apply === 'reload' };
        }
        async setScripts(params) {
            const tab = await this.tab(params.tabId);
            const scope = params.scope || 'hostname';
            if (!['hostname', 'global'].includes(scope)) P.fail('INVALID_PARAMS', 'scope must be hostname or global.');
            const hostname = hostOf(tab);
            if (scope === 'hostname' && (!isHost(hostname) || !/^https?:/.test(tab.url))) {
                P.fail('UNSUPPORTED_SCOPE', 'Hostname script settings require an HTTP(S) page; use global scope for file URLs.');
            }
            const data = await this.chrome.storage.local.get(null);
            this.expected(params, data);
            const apply = this.applyMode(params.apply);
            const key = scope === 'global' ? 'global_scripts' : hostname;
            const ids = P.applyScriptChanges(data[key] || [], params.changes, this.catalog);
            const changes = { [key]: P.combine(ids, this.catalog) };
            for (const id of ids) {
                const script = this.catalog.find(item => item.id === id);
                if (P.configSchema(script) && !P.own(data, `${id}_config`)) changes[`${id}_config`] = this.configFor(script, data);
            }
            changes.antidebug_merged_hooks = P.mergedHooks(ids, this.catalog);
            const result = await this.commit(data, changes, tab.id, apply);
            return { ...result, scope, active: (modeOf(data) === 'global') === (scope === 'global'), enabledScripts: ids, registeredScripts: changes[key], state: await this.state(tab.id) };
        }
        async setHooks(params) {
            const script = this.catalog.find(item => item.id === params.scriptId);
            if (!script) P.fail('UNKNOWN_SCRIPT', 'Unknown script ID.', { scriptId: params.scriptId });
            const data = await this.chrome.storage.local.get(null);
            this.expected(params, data);
            const apply = this.applyMode(params.apply);
            if (params.tabId !== undefined) await this.tab(params.tabId);
            if (apply === 'reload' && params.tabId === undefined) P.fail('INVALID_PARAMS', 'tabId is required for apply=reload.');
            const config = P.normalizeConfig(script, data[`${script.id}_config`], params.patch);
            const result = await this.commit(data, { [`${script.id}_config`]: config }, params.tabId, apply);
            return { ...result, scriptId: script.id, scope: 'global', config };
        }
        async setMode(params) {
            if (!['standard', 'global'].includes(params.mode)) P.fail('INVALID_PARAMS', 'mode must be standard or global.');
            const data = await this.chrome.storage.local.get(null);
            this.expected(params, data);
            const result = await this.commit(data, { antidebug_mode: params.mode }, undefined, 'next_navigation');
            return { ...result, mode: params.mode };
        }
        async updateBadges(data) {
            if (!this.chrome.action) return;
            const tabs = await this.chrome.tabs.query({});
            await Promise.all(tabs.map(async tab => {
                const ids = modeOf(data) === 'global' ? data.global_scripts : data[hostOf(tab)];
                const count = P.combine(ids, this.catalog).length;
                try {
                    await this.chrome.action.setBadgeText({ tabId: tab.id, text: count ? String(count) : '' });
                    if (count) await this.chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#4688F1' });
                } catch (_) {  }
            }));
        }
        async resolveDocument(tab) {
            const known = this.documents.get(tab.id);
            if (known) return known;
            let results;
            try {
                results = await this.chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, injectImmediately: true, func: self.MAPUS_PAGEFN.href });
            } catch (_) { P.fail('PAGE_UNAVAILABLE', 'The extension cannot inspect this page. Reload an ordinary web page after enabling the extension.', { tabId: tab.id }); }
            const result = results.find(item => item.frameId === 0) || results[0];
            if (!result || !result.documentId) P.fail('DOCUMENT_UNAVAILABLE', 'The browser did not provide a document identity.');
            return this.rememberDocument(tab.id, result.documentId, result.result || tab.url);
        }
        async rememberDocument(tabId, documentId, href) {
            this.staleDocuments.delete(documentId);
            const previous = this.documents.get(tabId);
            if (previous && previous.documentId === documentId) return previous;
            if (previous) this.invalidate(tabId, 'DOCUMENT_CHANGED');
            const record = { tabId, documentId, href, locationRevision: 0, appliedScripts: [], appliedRevision: null };
            this.documents.set(tabId, record);
            await this.persistDocuments();
            return record;
        }
        async documentFromSender(sender, href) {
            if (!sender.tab || !Number.isInteger(sender.tab.id) || (sender.frameId || 0) !== 0) {
                P.fail('UNSUPPORTED_FRAME', 'Only the top frame of a browser tab is supported.');
            }
            const documentId = sender.documentId;
            if (!documentId) P.fail('DOCUMENT_UNAVAILABLE', 'A browser-supplied documentId is required.');
            if (this.staleDocuments.has(documentId)) P.fail('STALE_DOCUMENT', 'This document was replaced by navigation.');
            const current = this.documents.get(sender.tab.id);
            if (!current || current.documentId !== documentId) {
                const results = await this.chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] }, injectImmediately: true, func: self.MAPUS_PAGEFN.href });
                if (!results.some(item => item.documentId === documentId)) P.fail('STALE_DOCUMENT', 'A message came from an old document.');
                const latest = this.documents.get(sender.tab.id);
                if (latest && latest !== current && latest.documentId !== documentId) {
                    P.fail('STALE_DOCUMENT', 'A newer document became ready while this message was being verified.');
                }
            }
            return this.rememberDocument(sender.tab.id, documentId, sender.url || href || sender.tab.url);
        }
        async documentReady(sender, message) {
            await this.ready;
            const record = await this.documentFromSender(sender, message.href);
            const data = await this.chrome.storage.local.get(null);
            const snapshot = this.snapshot(data, sender.tab, record);
            this.emit('document.ready', { ...this.target(record), href: record.href, revision: snapshot.revision });
            return snapshot;
        }
        routeKey(tabId, documentId, framework) { return `${tabId}:${documentId}:${framework}`; }
        async receiveRoutes(sender, message) {
            await this.ready;
            if (!['vue', 'react'].includes(message.framework) || !P.object(message.data)) P.fail('INVALID_ROUTE_DATA', 'Invalid route data.');
            if (JSON.stringify(message.data).length > 2 * 1024 * 1024) P.fail('DATA_TOO_LARGE', 'Route data exceeds 2 MiB.');
            const record = await this.documentFromSender(sender, message.href);
            const result = { ...this.target(record), framework: message.framework, href: message.href || record.href,
                capturedAt: this.now(), snapshotId: uid(), data: message.data, stale: false };
            this.routes.set(this.routeKey(record.tabId, record.documentId, message.framework), result);
            for (const [requestId, waiter] of this.waiters) {
                if (waiter.tabId === record.tabId && waiter.documentId === record.documentId && waiter.framework === message.framework &&
                    (message.requestId === requestId || (!message.requestId && !waiter.rescan))) {
                    clearTimeout(waiter.timer);
                    this.waiters.delete(requestId);
                    waiter.resolve(result);
                }
            }
            this.emit('routes.updated', result);
            return result;
        }
        async receiveApplied(sender, message) {
            await this.ready;
            const record = await this.documentFromSender(sender, message.href);
            if (!Number.isSafeInteger(message.revision) || !Array.isArray(message.scriptIds)) P.fail('INVALID_PARAMS', 'Invalid applied-config acknowledgement.');
            const data = await this.chrome.storage.local.get(null);
            const snapshot = this.snapshot(data, sender.tab, record);
            const allowed = new Set(snapshot.enabledScripts);
            const reported = message.scriptIds.filter(id => allowed.has(id));
            const previousScripts = record.appliedRevision === message.revision ? record.appliedScripts : [];
            record.appliedRevision = message.revision;
            record.appliedScripts = [...new Set([...previousScripts, ...reported])];
            await this.persistDocuments();
            this.emit('config.applied', { ...this.target(record), revision: message.revision, scriptIds: record.appliedScripts });
        }
        async receiveHookEvent(sender, message) {
            await this.ready;
            const record = await this.documentFromSender(sender, message.href);
            if (!P.object(message.event) || JSON.stringify(message.event).length > 262144) P.fail('INVALID_HOOK_EVENT', 'Hook event is invalid or exceeds 256 KiB.');
            this.emit('hooks.event', { ...this.target(record), href: sender.url || record.href, timestamp: this.now(), event: message.event });
        }
        invalidate(tabId, code = 'DOCUMENT_CHANGED') {
            const record = this.documents.get(tabId);
            if (record) {
                this.staleDocuments.add(record.documentId);
                if (this.staleDocuments.size > 500) this.staleDocuments.delete(this.staleDocuments.values().next().value);
                this.documents.delete(tabId);
            }
            for (const key of this.routes.keys()) if (key.startsWith(`${tabId}:`)) this.routes.delete(key);
            for (const [id, waiter] of this.waiters) {
                if (waiter.tabId !== tabId) continue;
                clearTimeout(waiter.timer);
                this.waiters.delete(id);
                waiter.reject(new P.CommandError(code, 'The page changed while waiting for route data.', { tabId }));
            }
        }
        async tabUpdated(tabId, changeInfo) {
            await this.ready;
            if (changeInfo.status === 'loading') {
                this.invalidate(tabId);
                await this.persistDocuments();
            } else if (changeInfo.url) {
                const record = this.documents.get(tabId);
                if (record && record.href !== changeInfo.url) {
                    record.href = changeInfo.url;
                    record.locationRevision += 1;
                    for (const key of this.routes.keys()) if (key.startsWith(`${tabId}:`)) this.routes.delete(key);
                    for (const [id, waiter] of this.waiters) {
                        if (waiter.tabId !== tabId) continue;
                        clearTimeout(waiter.timer);
                        this.waiters.delete(id);
                        waiter.reject(new P.CommandError('LOCATION_CHANGED', 'The page URL changed while waiting for route data.', { tabId }));
                    }
                    await this.persistDocuments();
                }
            }
            if (changeInfo.status === 'complete') await this.updateBadges(await this.chrome.storage.local.get(null));
        }
        async scanFramework(tab, record, framework, params, data) {
            const key = this.routeKey(tab.id, record.documentId, framework);
            const cached = this.routes.get(key);
            if (cached && !params.rescan) return { ...cached, status: 'ready', source: 'cache' };
            const enabled = this.snapshot(data, tab, record).logicalEnabledScripts;
            const candidates = framework === 'vue' ? ['Get_Vue_0', 'Get_Vue_1'] : ['Get_React_0'];
            if (!candidates.some(id => enabled.includes(id))) return { ...this.target(record), framework, status: 'script_disabled', requiredScripts: candidates };
            const requestId = uid();
            const timeoutMs = params.timeoutMs === undefined ? 5000 : params.timeoutMs;
            if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) P.fail('INVALID_PARAMS', 'timeoutMs must be between 100 and 30000.');
            const pending = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.waiters.delete(requestId);
                    resolve({ ...this.target(record), framework, status: 'timeout', requestId, timeoutMs });
                }, timeoutMs);
                this.waiters.set(requestId, { tabId: tab.id, documentId: record.documentId, framework, rescan: !!params.rescan, timer, resolve, reject });
            });
            pending.catch(() => {});
            try {
                await this.chrome.tabs.sendMessage(tab.id, { type: 'ADB_ROUTES_REQUEST', framework, requestId, rescan: !!params.rescan }, { documentId: record.documentId });
            } catch (error) {
                const waiter = this.waiters.get(requestId);
                if (waiter) {
                    clearTimeout(waiter.timer);
                    this.waiters.delete(requestId);
                    waiter.resolve({ ...this.target(record), framework, status: 'content_unavailable', message: 'Reload the page to load the extension content bridge.' });
                }
            }
            const result = await pending;
            if (result.status) return result;
            return { ...result, status: result.data.notFound ? 'not_found' : result.data.serializationError ? 'serialization_error' : 'ready', source: 'scan', requestId };
        }
        async getRoutes(params) {
            const framework = params.framework || 'all';
            if (!['vue', 'react', 'all'].includes(framework)) P.fail('INVALID_PARAMS', 'framework must be vue, react, or all.');
            const tab = await this.tab(params.tabId);
            const record = await this.resolveDocument(tab);
            const data = await this.chrome.storage.local.get(null);
            const frameworks = framework === 'all' ? ['vue', 'react'] : [framework];
            const results = await Promise.all(frameworks.map(item => this.scanFramework(tab, record, item, params, data)));
            return { target: this.target(record), results };
        }
        async markPage(params) {
            const tab = await this.tab(params.tabId);
            if (params.nonce !== null && (typeof params.nonce !== 'string' || params.nonce.length < 8 || params.nonce.length > 256)) {
                P.fail('INVALID_PARAMS', 'nonce must be null or a string of 8–256 characters.');
            }
            let results;
            try {
                results = await this.chrome.scripting.executeScript({
                    target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN',
                    func: self.MAPUS_PAGEFN.markNonce, args: [params.nonce]
                });
            } catch (error) { P.fail('PAGE_UNAVAILABLE', 'Could not mark this page for the browser connection.', { tabId: tab.id, cause: error.message }); }
            const result = results.find(item => item.frameId === 0) || results[0];
            const record = await this.rememberDocument(tab.id, result.documentId, result.result.href);
            return { ...this.target(record), ...result.result };
        }
        async execute(method, params = {}, context = {}) {
            if (method === 'pages.create') {
                if (!P.object(params)) P.fail('INVALID_PARAMS', 'params must be an object.');
                if (!this.debuggerController) P.fail('DEBUGGER_UNAVAILABLE', 'This extension does not support browser control.');
                return this.debuggerController.createTab(params);
            }
            await this.ready;
            if (!P.object(params)) P.fail('INVALID_PARAMS', 'params must be an object.');
            if (method === 'library.list') {
                if (Object.keys(params).length) P.fail('INVALID_PARAMS', '脚本库列表不接受额外参数。');
                return this.scriptLibrary.execute({ action: 'list' });
            }
            if (method === 'library.get' || method === 'library.update') {
                if (context.source !== 'extension') P.fail('FORBIDDEN', '查看和编辑脚本仅接受扩展页面的操作。');
                const updating = method === 'library.update';
                const allowed = updating ? ['id', 'code', 'name', 'matches', 'expectedRevision'] : ['id'];
                if (Object.keys(params).some(key => !allowed.includes(key)) ||
                    (updating && (!['code', 'name', 'matches'].some(key => P.own(params, key)) ||
                        !Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0))) {
                    P.fail('INVALID_PARAMS', updating ? '请提供脚本 id、当前脚本库 expectedRevision，以及 code、name、matches 中至少一项，不接受其他参数。' : '查看脚本仅接受 id 参数。');
                }
                const current = await this.scriptLibrary.execute({ action: 'get', id: params.id });
                if (!updating) return current;
                if (current.revision !== params.expectedRevision) {
                    P.fail('REVISION_CONFLICT', '脚本库已改变，请读取后重试。', { expectedRevision: params.expectedRevision, actualRevision: current.revision });
                }
                const script = current.script;
                return this.scriptLibrary.execute({ action: 'save', id: script.id,
                    code: P.own(params, 'code') ? params.code : script.code,
                    name: P.own(params, 'name') ? params.name : script.name,
                    matches: P.own(params, 'matches') ? params.matches : script.matches,
                    enabled: script.enabled, expectedRevision: params.expectedRevision });
            }
            if (method === 'library.delete') {
                if (context.source !== 'extension') P.fail('FORBIDDEN', '删除脚本仅接受扩展页面的操作。');
                if (Object.keys(params).some(key => !['id', 'expectedRevision'].includes(key)) ||
                    !Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0) {
                    P.fail('INVALID_PARAMS', '请提供脚本 id 和当前脚本库 expectedRevision，不接受额外参数。');
                }
                return this.scriptLibrary.execute({ action: 'delete', id: params.id, expectedRevision: params.expectedRevision });
            }
            if (method === 'library.setEnabled') {
                if (context.source !== 'extension') P.fail('FORBIDDEN', '此开关仅接受扩展页面的操作。');
                if (Object.keys(params).some(key => !['id', 'enabled', 'expectedRevision'].includes(key)) ||
                    typeof params.enabled !== 'boolean' || !Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0) {
                    P.fail('INVALID_PARAMS', '请提供脚本 id、布尔值 enabled 和当前脚本库 expectedRevision，不接受额外参数。');
                }
                return this.scriptLibrary.execute({ action: params.enabled ? 'enable' : 'disable',
                    id: params.id, expectedRevision: params.expectedRevision });
            }
            if (method === 'library.manage') {
                if (context.source !== 'mcp') P.fail('FORBIDDEN', '脚本库仅接受已配对 Agent 的 MCP 操作。');
                const beforeWrite = async () => {
                    const data = await this.chrome.storage.local.get('adb_browser_control');
                    if (context.isCurrent && !context.isCurrent()) {
                        P.fail('CONNECTION_CHANGED', 'MCP 连接已停止或配对已改变，本次脚本库修改已取消。');
                    }
                    if (data.adb_browser_control?.enabled !== true) {
                        P.fail('BROWSER_CONTROL_DISABLED', '请先在扩展 MCP 页面启用或重新启用浏览器控制，再修改脚本库。');
                    }
                };
                if (!['list', 'get'].includes(params.action)) await beforeWrite();
                return this.scriptLibrary.execute(params, { beforeWrite });
            }
            if (DEBUGGER_METHODS.includes(method)) {
                if (!this.debuggerController) P.fail('DEBUGGER_UNAVAILABLE', 'This extension does not support browser control.');
                if (method === 'debugger.detachAll') return this.debuggerController.detachAll('client_disconnect');
                return this.debuggerController[method.slice('debugger.'.length)](params);
            }
            if (['scripts.set', 'hooks.set', 'mode.set'].includes(method)) {
                return this.exclusive(() => method === 'scripts.set' ? this.setScripts(params) : method === 'hooks.set' ? this.setHooks(params) : this.setMode(params));
            }
            if (method === 'scripts.prepare') return this.exclusive(() => this.prepareScripts(params));
            switch (method) {
                case 'capabilities': return { protocolVersion: 1, version: this.chrome.runtime.getManifest().version, extensionId: this.chrome.runtime.id,
                    browserSessionId: this.browserSessionId, methods: this.debuggerController ? [...METHODS, 'pages.create', ...DEBUGGER_METHODS] : METHODS,
                    debugger: this.debuggerController ? await this.debuggerController.status() : { available: false },
                    scriptLibrary: await this.scriptLibrary.status(),
                    frames: 'top', hookConfigScope: 'global', requiresReloadForChanges: true };
                case 'pages.list': return { browserSessionId: this.browserSessionId, pages: (await this.chrome.tabs.query({})).map(tab => ({
                    tabId: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title, active: tab.active, status: tab.status,
                    target: this.documents.has(tab.id) ? this.target(this.documents.get(tab.id)) : null })) };
                case 'scripts.list': return { scripts: this.catalog.map(script => ({ ...script,
                    ...(context.source === 'mcp' ? Object.fromEntries(['name', 'description'].map(field => {
                        const key = `catalog_${script.id}_${field}`;
                        return [field, I.has(key) ? I.t(key, [], 'en') : script[field]];
                    })) : {}), configSchema: P.configSchema(script), configurable: !!P.configSchema(script),
                    combination: script.id === P.COMBINED ? P.PARTS : undefined })) };
                case 'state.get': return this.state(params.tabId);
                case 'routes.get': return this.getRoutes(params);
                case 'page.mark': return this.markPage(params);
                default: P.fail('METHOD_NOT_FOUND', 'Unknown extension command.', { method });
            }
        }
        async reconcileExternal(changes) {
            await this.scriptLibrary.reconcileExternal(changes);
            if (P.own(changes, 'adb_language')) {
                await this.exclusive(async () => this.reconcile(await this.chrome.storage.local.get(null)));
            }
            if (P.own(changes, REVISION)) return;
            const relevant = Object.keys(changes).some(key => key === 'antidebug_mode' || key === 'global_scripts' ||
                (isHost(key) && Array.isArray(changes[key].newValue)) || this.catalog.some(script => `${script.id}_config` === key));
            if (!relevant) return;
            return this.exclusive(async () => {
                const data = await this.chrome.storage.local.get(null);
                await this.commit(data, {}, undefined, 'next_navigation');
            });
        }
        async legacyRegistration(message) {
            return this.exclusive(async () => {
                const data = await this.chrome.storage.local.get(null);
                await this.reconcile(data);
                return { success: true, revision: revisionOf(data) };
            });
        }
    }
    return { ControlService, METHODS, REVISION, isHost };
});
