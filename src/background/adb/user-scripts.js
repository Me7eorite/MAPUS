(function (root, factory) {
    const policy = typeof module === 'object' && module.exports ? require('./policy.js') : root.ADBPolicy;
    const api = factory(policy);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ADBUserScripts = api;
})(globalThis, function (P) {
    'use strict';

    const STORAGE_KEY = 'adb_script_library';
    const REGISTRATION_PREFIX = 'adb_lib_';
    const LIMITS = Object.freeze({ scripts: 50, matches: 20, codeCharacters: 131072, codeBytes: 131072, totalBytes: 2097152 });
    const clone = value => JSON.parse(JSON.stringify(value));
    const bytes = value => new TextEncoder().encode(value).length;
    const empty = () => ({ schemaVersion: 1, revision: 0, scripts: [] });
    const errorData = error => ({ ...P.serializeError(error), code: error.code || 'USER_SCRIPTS_ERROR' });
    const guidance = '请打开 chrome://extensions，在 AntiDebug Breaker 的“详情”中开启“允许用户脚本”（Chrome 138 及以上）；Chrome 120–137 请开启扩展页的“开发者模式”。开关开启后重试；必要时重新加载扩展。';

    function validId(id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
            P.fail('INVALID_PARAMS', '脚本 id 必须为 1–100 位字母、数字、下划线或连字符。');
        }
        return id;
    }
    function validateMatches(matches) {
        if (!Array.isArray(matches) || !matches.length || matches.length > LIMITS.matches) {
            P.fail('INVALID_PARAMS', 'matches 必须包含 1–20 个指定网站的 HTTP(S) 匹配模式。');
        }
        for (const pattern of matches) {
            const match = typeof pattern === 'string' && pattern.length <= 2048 && /^(https?|\*):\/\/([^/]+)\/[^\s\\]*$/.exec(pattern);
            const host = match && match[2].replace(/^\*\./, '');
            const labels = host && host.split('.');
            let valid = !!host && host.length <= 253 && labels.every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
            if (valid) {
                try { valid = new URL(`http://${host}/`).hostname === host.toLowerCase(); }
                catch (_) { valid = false; }
            }
            if (!valid) P.fail('INVALID_PARAMS', '仅支持指定主机的 HTTP(S) 模式，例如 https://example.com/* 或 *://*.example.com/*；不支持全站通配。', { field: 'matches', pattern });
        }
        return [...new Set(matches)];
    }
    function validateMetadata(code) {
        const header = /^\s*\/\/\s*==UserScript==[^\r\n]*\r?\n([\s\S]*?)^\s*\/\/\s*==\/UserScript==/m.exec(code);
        if (!header || code.slice(0, header.index).trim()) return;
        for (const line of header[1].split(/\r?\n/)) {
            const tag = /^\s*\/\/\s*@(require|grant|run-at)\s+(.+?)\s*$/.exec(line);
            if (!tag) continue;
            if (tag[1] === 'require' || (tag[1] === 'grant' && tag[2] !== 'none') ||
                (tag[1] === 'run-at' && tag[2] !== 'document-start')) {
                P.fail('UNSUPPORTED_USER_SCRIPT_METADATA', '首版仅执行普通 JavaScript，固定 document_start，不提供 @require、GM_* 授权或其他运行时机。', { directive: `@${tag[1]}`, value: tag[2] });
            }
        }
    }
    function validateScript(input) {
        validId(input.id);
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) {
            P.fail('INVALID_PARAMS', '脚本名称必须为 1–200 个字符。');
        }
        if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > LIMITS.codeCharacters || bytes(input.code) > LIMITS.codeBytes) {
            P.fail('INVALID_PARAMS', '脚本源码不能为空，且不得超过 131072 字符或 128 KiB UTF-8。');
        }
        if (typeof input.enabled !== 'boolean') P.fail('INVALID_PARAMS', 'enabled 必须为布尔值。');
        validateMetadata(input.code);
        return { id: input.id, name: input.name.trim(), code: input.code, matches: validateMatches(input.matches), enabled: input.enabled };
    }
    function validateLibrary(value) {
        if (value === undefined) return empty();
        if (!P.object(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.scripts)) {
            P.fail('LIBRARY_DATA_INVALID', '已保存的脚本库格式无效，未覆盖原数据。');
        }
        if (value.scripts.length > LIMITS.scripts || bytes(JSON.stringify(value)) > LIMITS.totalBytes) {
            P.fail('LIBRARY_QUOTA_EXCEEDED', '脚本库最多保存 50 个脚本，总大小不得超过 2 MiB。');
        }
        const ids = new Set();
        for (const script of value.scripts) {
            if (!P.object(script)) P.fail('LIBRARY_DATA_INVALID', '脚本条目格式无效。');
            validateScript(script);
            if (ids.has(script.id) || !Number.isSafeInteger(script.revision) || script.revision < 1 || script.revision > value.revision) {
                P.fail('LIBRARY_DATA_INVALID', '脚本库包含重复 id 或无效版本。');
            }
            ids.add(script.id);
        }
        return clone(value);
    }
    const registration = script => ({ id: REGISTRATION_PREFIX + script.id, matches: script.matches,
        js: [{ code: script.code }], runAt: 'document_start', world: 'MAIN', allFrames: false });
    const equalMatches = (a, b) => Array.isArray(a) && Array.isArray(b) &&
        JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const equalRegistration = (a, b) => !!a && !!b && a.id === b.id && a.runAt === b.runAt && a.world === b.world && !a.allFrames &&
        !a.excludeMatches?.length && !a.excludeGlobs?.length && !a.includeGlobs?.length && !a.worldId &&
        equalMatches(a.matches, b.matches) && JSON.stringify(a.js) === JSON.stringify(b.js);

    class UserScriptLibrary {
        constructor(chrome, options = {}) {
            this.chrome = chrome;
            this.emit = options.emit || (() => {});
            this.queue = Promise.resolve();
            this.available = false;
            this.recoveryPending = false;
            this.unavailableReason = null;
            this.observed = null;
            this.registrationErrors = new Map();
            this.storageError = null;
            this.ready = this.initialize();
        }
        async initialize() {
            try { await this._reconcile(await this._read()); }
            catch (error) { this.storageError = errorData(error); }
        }
        exclusive(work) {
            const pending = this.queue.then(() => this.ready).then(work);
            this.queue = pending.catch(() => {});
            return pending;
        }
        async _read() {
            try {
                const data = await this.chrome.storage.local.get(STORAGE_KEY);
                const library = validateLibrary(data[STORAGE_KEY]);
                this.storageError = null;
                return library;
            } catch (error) {
                const wrapped = error instanceof P.CommandError ? error : new P.CommandError('LIBRARY_READ_FAILED', '无法读取已保存的脚本库。', { cause: error.message });
                this.storageError = errorData(wrapped);
                throw wrapped;
            }
        }
        async _probe() {
            try {
                const api = this.chrome.userScripts;
                if (!api || typeof api.getScripts !== 'function') throw new Error('chrome.userScripts 不可用。');
                const scripts = await api.getScripts();
                this.observed = new Map(scripts.filter(script => script.id.startsWith(REGISTRATION_PREFIX)).map(script => [script.id, script]));
                this.available = true;
                this.unavailableReason = null;
                return api;
            } catch (error) {
                this.available = false;
                this.recoveryPending = true;
                this.observed = null;
                this.unavailableReason = error.message || String(error);
                return null;
            }
        }
        _metadata(script, includeCode = false) {
            const actual = this.observed?.get(REGISTRATION_PREFIX + script.id);
            const matchesDesired = equalRegistration(actual, registration(script));
            const registrationState = !this.available ? 'unavailable' : actual ? (script.enabled && matchesDesired ? 'registered' : 'outdated') :
                script.enabled ? 'not_registered' : 'disabled';
            const result = { id: script.id, name: script.name, matches: clone(script.matches), enabled: script.enabled,
                revision: script.revision, codeBytes: bytes(script.code), runAt: 'document_start', world: 'MAIN', allFrames: false,
                registered: registrationState === 'registered', registrationState, applicationStatus: 'unverified' };
            const error = this.registrationErrors.get(script.id);
            if (error && registrationState !== 'registered' && registrationState !== 'disabled') result.registrationError = error;
            if (includeCode) result.code = script.code;
            return result;
        }
        _status(library) {
            const scripts = library.scripts.map(script => this._metadata(script));
            return { available: this.available, reason: this.available ? null : P.message(this.unavailableReason),
                guidance: this.available ? null : P.message(guidance), revision: library.revision, scriptCount: scripts.length,
                enabledCount: scripts.filter(script => script.enabled).length,
                registeredCount: this.observed ? this.observed.size : null,
                matchingCount: this.available ? scripts.filter(script => script.registered).length : null,
                registrationUpdated: this.available && scripts.every(script => script.enabled ? script.registered : script.registrationState === 'disabled') &&
                    this.observed.size === scripts.filter(script => script.enabled).length,
                applicationStatus: 'unverified', limits: LIMITS,
                ...(this.storageError ? { storageError: this.storageError } : {}) };
        }
        async _reconcile(library) {
            const api = await this._probe();
            if (!api) return this._status(library);
            this.registrationErrors.clear();
            const desired = new Map(library.scripts.filter(script => script.enabled).map(script => [REGISTRATION_PREFIX + script.id, registration(script)]));
            for (const [id, actual] of this.observed) {
                const target = desired.get(id);
                if (target && equalRegistration(actual, target)) continue;
                try {
                    if (target) {
                        await api.update([target]);
                    } else await api.unregister({ ids: [id] });
                } catch (error) { this.registrationErrors.set(id.slice(REGISTRATION_PREFIX.length), errorData(error)); }
            }
            for (const [id, target] of desired) {
                if (this.observed.has(id)) continue;
                try { await api.register([target]); }
                catch (error) { this.registrationErrors.set(id.slice(REGISTRATION_PREFIX.length), errorData(error)); }
            }
            await this._probe();
            const status = this._status(library);
            if (status.registrationUpdated) this.recoveryPending = false;
            return status;
        }
        async _refreshStatus(library) {
            const api = await this._probe();
            if (api && this.recoveryPending && !this.storageError) return this._reconcile(library);
            return this._status(library);
        }
        status() {
            return this.exclusive(async () => {
                let library;
                try { library = await this._read(); } catch (_) { library = empty(); }
                const status = await this._refreshStatus(library);
                if (this.storageError) { status.registrationUpdated = false; status.revision = null; status.scriptCount = null; status.enabledCount = null; }
                return status;
            });
        }
        reconcile() { return this.exclusive(async () => this._reconcile(await this._read())); }
        reconcileExternal(changes) {
            if (!P.object(changes) || !P.own(changes, STORAGE_KEY)) return Promise.resolve();
            return this.reconcile();
        }
        execute(params = {}, { beforeWrite } = {}) {
            return this.exclusive(async () => {
                if (!P.object(params) || !['list', 'get', 'save', 'enable', 'disable', 'delete'].includes(params.action)) {
                    P.fail('INVALID_PARAMS', 'action 必须为 list、get、save、enable、disable 或 delete。');
                }
                const allowed = new Set(params.action === 'list' ? ['action'] : params.action === 'get' ? ['action', 'id'] :
                    ['action', 'id', 'expectedRevision', 'tabId', 'apply', ...(params.action === 'save' ? ['name', 'code', 'matches', 'enabled'] : [])]);
                for (const field of Object.keys(params)) {
                    if (!allowed.has(field)) P.fail('INVALID_PARAMS', '此操作不支持该参数。', { action: params.action, field });
                }
                if (params.tabId !== undefined && (!Number.isInteger(params.tabId) || params.tabId < 0)) {
                    P.fail('INVALID_PARAMS', 'tabId 必须为非负整数。');
                }
                if (params.apply !== undefined && params.apply !== 'next_navigation') {
                    P.fail('INVALID_PARAMS', '脚本库仅在下一次页面加载时应用；需要立即应用时请通过 MCP 受控刷新。');
                }
                const library = await this._read();
                if (params.action === 'list' || params.action === 'get') {
                    const base = { revision: library.revision, status: await this._refreshStatus(library) };
                    if (params.action === 'list') return { ...base, scripts: library.scripts.map(script => this._metadata(script)) };
                    validId(params.id);
                    const script = library.scripts.find(script => script.id === params.id);
                    if (!script) P.fail('SCRIPT_NOT_FOUND', '脚本库中没有该 id。', { id: params.id });
                    return { ...base, script: this._metadata(script, true) };
                }
                validId(params.id);
                if (params.expectedRevision !== undefined && (!Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0)) {
                    P.fail('INVALID_PARAMS', 'expectedRevision 必须为非负整数。');
                }
                if (params.expectedRevision !== undefined && params.expectedRevision !== library.revision) {
                    P.fail('REVISION_CONFLICT', '脚本库已改变，请读取后重试。', { expectedRevision: params.expectedRevision, actualRevision: library.revision });
                }
                const index = library.scripts.findIndex(script => script.id === params.id);
                const previous = library.scripts[index];
                let nextScript;
                if (params.action === 'save') {
                    nextScript = validateScript({ id: params.id, name: params.name, code: params.code, matches: params.matches,
                        enabled: params.enabled === undefined ? (previous?.enabled || false) : params.enabled });
                } else {
                    if (!previous) P.fail('SCRIPT_NOT_FOUND', '脚本库中没有该 id。', { id: params.id });
                    if (params.action !== 'delete') nextScript = { ...previous, enabled: params.action === 'enable' };
                }
                const changed = !nextScript || !previous || ['id', 'name', 'code', 'matches', 'enabled'].some(key => JSON.stringify(nextScript[key]) !== JSON.stringify(previous[key]));
                const next = clone(library);
                if (changed) {
                    if (library.revision === Number.MAX_SAFE_INTEGER) P.fail('LIBRARY_REVISION_EXHAUSTED', '脚本库版本号已达到上限。');
                    next.revision++;
                    if (nextScript) {
                        nextScript.revision = next.revision;
                        if (index < 0) next.scripts.push(nextScript); else next.scripts[index] = nextScript;
                    } else next.scripts.splice(index, 1);
                    validateLibrary(next);
                }
                if (beforeWrite) await beforeWrite();
                if (changed) {
                    try { await this.chrome.storage.local.set({ [STORAGE_KEY]: next }); }
                    catch (error) { P.fail('LIBRARY_SAVE_FAILED', '脚本库保存失败，注册未改变。', { saved: false, revision: library.revision, cause: error.message }); }
                }
                const status = await this._reconcile(next);
                const current = next.scripts.find(script => script.id === params.id);
                const actual = this.observed?.get(REGISTRATION_PREFIX + params.id);
                const registrationUpdated = this.available && (current?.enabled ? equalRegistration(actual, registration(current)) : !actual);
                const result = { saved: true, changed, registrationUpdated, registrationScope: 'script', revision: next.revision,
                    apply: 'next_navigation', requiresReload: true, applicationStatus: 'unverified', status,
                    ...(current ? { script: this._metadata(current) } : { deletedId: params.id }) };
                if (this.registrationErrors.size) result.registrationErrors = [...this.registrationErrors].map(([id, error]) => ({ id, ...error }));
                if (changed) {
                    try { this.emit('library.changed', { action: params.action, id: params.id, revision: next.revision, registrationUpdated, registrationScope: 'script', requiresReload: true }); }
                    catch (_) {  }
                }
                return result;
            });
        }
    }
    return { UserScriptLibrary, STORAGE_KEY, REGISTRATION_PREFIX, LIMITS };
});
