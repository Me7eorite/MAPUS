(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ADBBridge = api;
})(globalThis, function () {
    'use strict';
    const DEFAULT_URL = 'ws://127.0.0.1:19876/extension';
    const ALARM = 'adb_mcp_reconnect';
    function validateSettings(value) {
        const settings = value && typeof value === 'object' ? value : {};
        const enabled = settings.enabled === true;
        let parsed;
        try { parsed = new URL(settings.url || DEFAULT_URL); } catch (_) { throw new Error('MCP bridge URL is invalid.'); }
        if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/extension' ||
            parsed.username || parsed.password || parsed.search || parsed.hash) {
            throw new Error('MCP bridge must use a loopback WebSocket URL without credentials, query, or fragment.');
        }
        const token = typeof settings.token === 'string' ? settings.token : '';
        if (enabled && (token.length < 32 || token.length > 256)) throw new Error('An MCP pairing token of 32–256 characters is required.');
        return { enabled, url: parsed.href, token };
    }
    class LocalBridge {
        constructor(chrome, service, options = {}) {
            this.chrome = chrome;
            this.service = service;
            this.WebSocket = options.WebSocket || globalThis.WebSocket;
            this.serializeError = options.serializeError || (error => ({ code: error.code || 'INTERNAL_ERROR', message: error.message }));
            this.onDisconnect = options.onDisconnect || (() => {});
            this.socket = null;
            this.settings = { enabled: false, url: DEFAULT_URL, token: '' };
            this.connected = false;
            this.lastError = null;
            this.retryMs = 1000;
            this.retryTimer = this.pingTimer = this.handshakeTimer = null;
            this.completed = new Map();
            this.inflight = new Map();
            this.maxMessageBytes = 1024 * 1024;
            this.configurationGeneration = 0;
            this.connectionGeneration = 0;
            this.onSettingsChanged = (changes, namespace) => {
                if (namespace !== 'local' || !Object.prototype.hasOwnProperty.call(changes, 'adb_mcp')) return;
                let next;
                try { next = validateSettings(changes.adb_mcp.newValue); }
                catch (_) { this.stop(); return; }
                if (!next.enabled || next.url !== this.settings.url || next.token !== this.settings.token ||
                    next.enabled !== this.settings.enabled) this.stop();
                else this.configurationGeneration++;
            };
            chrome.storage.onChanged?.addListener(this.onSettingsChanged);
        }
        status() { return { enabled: this.settings.enabled, connected: this.connected, url: this.settings.url, error: this.lastError }; }
        publishStatus(state, message) {
            if (state === 'connected') this.lastConnectedAt = Date.now();
            this.chrome.storage.session.set({ adb_mcp_status: { state, message: message || '', lastConnectedAt: this.lastConnectedAt || null } }).catch(() => {});
        }
        async configure() {
            const generation = ++this.configurationGeneration;
            const data = await this.chrome.storage.local.get('adb_mcp');
            if (generation !== this.configurationGeneration) return;
            const previous = this.settings;
            let settings;
            try { settings = validateSettings(data.adb_mcp); }
            catch (error) {
                this._stopConnection();
                this.settings = { enabled: false, url: DEFAULT_URL, token: '' };
                this.lastError = error.message;
                this.publishStatus('error', error.message);
                await this.chrome.alarms.clear(ALARM);
                return;
            }
            const changed = settings.url !== previous.url || settings.token !== previous.token || settings.enabled !== previous.enabled;
            this.settings = settings;
            if (changed || !settings.enabled) this._stopConnection();
            if (changed) {
                this.completed.clear();
                this.inflight.clear();
                this.retryMs = 1000;
            }
            if (!settings.enabled) {
                this.publishStatus('disabled');
                await this.chrome.alarms.clear(ALARM);
                return;
            }
            await this.chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
            if (generation !== this.configurationGeneration) return;
            await this.connect();
        }
        stop() {
            this.configurationGeneration++;
            this._stopConnection();
        }
        _stopConnection() {
            this.connectionGeneration++;
            clearTimeout(this.retryTimer);
            clearTimeout(this.handshakeTimer);
            clearInterval(this.pingTimer);
            this.retryTimer = this.pingTimer = this.handshakeTimer = null;
            this.connected = false;
            this.releaseDebugger('bridge_stopped');
            const socket = this.socket;
            this.socket = null;
            if (socket) socket.close();
        }
        releaseDebugger(reason) {
            try { Promise.resolve(this.onDisconnect(reason)).catch(() => {}); } catch (_) {}
        }
        async connect() {
            if (!this.settings.enabled || this.socket) return;
            const generation = this.connectionGeneration;
            const configurationGeneration = this.configurationGeneration;
            await this.service.ready;
            if (generation !== this.connectionGeneration || configurationGeneration !== this.configurationGeneration ||
                !this.settings.enabled || this.socket) return;
            let socket;
            this.publishStatus('connecting');
            try { socket = new this.WebSocket(this.settings.url); }
            catch (_) { this.lastError = 'Could not open the local MCP bridge.'; this.publishStatus('error', this.lastError); this.scheduleReconnect(); return; }
            this.socket = socket;
            socket.onopen = () => {
                if (socket !== this.socket) return;
                const manifest = this.chrome.runtime.getManifest();
                socket.send(JSON.stringify({ type: 'hello', protocolVersion: 1, token: this.settings.token,
                    extensionId: this.chrome.runtime.id, version: manifest.version, browserSessionId: this.service.browserSessionId }));
                this.handshakeTimer = setTimeout(() => {
                    if (socket === this.socket && !this.connected) { this.lastError = 'Local MCP handshake timed out.'; socket.close(); }
                }, 10000);
            };
            socket.onmessage = event => { this.receive(socket, event.data).catch(() => {}); };
            socket.onerror = () => { this.lastError = 'Local MCP bridge is unavailable.'; this.publishStatus('error', this.lastError); };
            socket.onclose = () => {
                if (socket !== this.socket) return;
                this.socket = null;
                this.connected = false;
                this.releaseDebugger('bridge_disconnected');
                clearTimeout(this.handshakeTimer);
                clearInterval(this.pingTimer);
                this.publishStatus('disconnected', this.lastError);
                this.scheduleReconnect();
            };
        }
        scheduleReconnect() {
            if (!this.settings.enabled || this.retryTimer) return;
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.connect().catch(() => {});
            }, this.retryMs);
            this.retryMs = Math.min(this.retryMs * 2, 30000);
        }
        send(value, socket = this.socket, chunked = false) {
            if (!socket || socket.readyState !== 1) return;
            try {
                let encoded = JSON.stringify(value);
                const byteLength = new TextEncoder().encode(encoded).byteLength;
                if (byteLength > this.maxMessageBytes) {
                    if (chunked && value.type === 'response' && byteLength <= 16 * 1024 * 1024) {
                        const size = Math.max(1, Math.floor((this.maxMessageBytes - 512) / 6));
                        const total = Math.ceil(encoded.length / size);
                        if (total <= 128) {
                            for (let index = 0; index < total; index++) socket.send(JSON.stringify({
                                type: 'response_chunk', id: value.id, index, total, data: encoded.slice(index * size, (index + 1) * size)
                            }));
                            return;
                        }
                    }
                    if (value.type === 'response') encoded = JSON.stringify({ type: 'response', id: value.id,
                        error: { code: 'MESSAGE_TOO_LARGE', message: 'The extension result exceeds the bridge message limit.',
                            details: { maxMessageBytes: chunked ? 16 * 1024 * 1024 : this.maxMessageBytes } } });
                    else if (value.type === 'event') encoded = JSON.stringify({ type: 'event', event: 'bridge.event_dropped',
                        data: { event: value.event, reason: 'MESSAGE_TOO_LARGE' } });
                    else return;
                }
                socket.send(encoded);
            } catch (_) { socket.close(); }
        }
        event(event, data) { if (this.connected) this.send({ type: 'event', event, data }); }
        async receive(socket, payload) {
            if (socket !== this.socket) return;
            if (typeof payload !== 'string' || payload.length > 1024 * 1024) { socket.close(1009, 'Invalid message size'); return; }
            let message;
            try { message = JSON.parse(payload); } catch (_) { socket.close(1007, 'Invalid JSON'); return; }
            if (!message || typeof message !== 'object') { socket.close(1007, 'Invalid message'); return; }
            if (message.type === 'ping') { this.send({ type: 'pong' }, socket); return; }
            if (message.type === 'pong') return;
            if (!this.connected) {
                if (message.type !== 'welcome' || message.protocolVersion !== 1) { socket.close(1008, 'Expected protocol v1 welcome'); return; }
                if (Number.isInteger(message.maxMessageBytes) && message.maxMessageBytes >= 1024) {
                    this.maxMessageBytes = Math.min(message.maxMessageBytes, 1024 * 1024);
                }
                this.connected = true;
                this.lastError = null;
                this.retryMs = 1000;
                clearTimeout(this.handshakeTimer);
                this.publishStatus('connected');
                this.pingTimer = setInterval(() => this.send({ type: 'ping' }, socket), 20000);
                return;
            }
            if (message.type !== 'request' || typeof message.id !== 'string' || message.id.length > 256 || typeof message.method !== 'string') {
                socket.close(1008, 'Invalid request'); return;
            }
            const fingerprint = JSON.stringify([message.method, message.params || {}]);
            const chunked = message.method === 'debugger.command';
            const previous = this.completed.get(message.id) || this.inflight.get(message.id);
            if (previous && previous.fingerprint !== fingerprint) {
                this.send({ type: 'response', id: message.id, error: { code: 'REQUEST_ID_REUSED', message: 'A request ID cannot identify different commands.' } }, socket);
                return;
            }
            if (this.completed.has(message.id)) { this.send(this.completed.get(message.id).response, socket, chunked); return; }
            let entry = this.inflight.get(message.id);
            if (!entry) {
                const promise = this.service.execute(message.method, message.params || {}, {
                    source: 'mcp', isCurrent: () => this.connected && this.socket === socket
                }).then(
                    result => ({ type: 'response', id: message.id, result }),
                    error => {
                        const serialized = this.serializeError(error);
                        const wireError = { code: serialized.code, message: serialized.message };
                        if (serialized.details !== undefined) wireError.details = serialized.details;
                        return { type: 'response', id: message.id, error: wireError };
                    }
                );
                entry = { fingerprint, promise };
                this.inflight.set(message.id, entry);
            }
            const response = await entry.promise;
            if (this.inflight.get(message.id) !== entry) return;
            this.inflight.delete(message.id);
            const retained = chunked && JSON.stringify(response).length > 256 * 1024
                ? { type: 'response', id: message.id, error: { code: 'RESPONSE_NOT_RETAINED', message: 'This large result was already delivered. Inspect state before issuing a new request.' } }
                : response;
            this.completed.set(message.id, { fingerprint, response: retained });
            if (this.completed.size > 200) this.completed.delete(this.completed.keys().next().value);
            if (socket === this.socket) this.send(response, socket, chunked);
        }
        async alarm(alarm) { if (alarm.name === ALARM) await this.configure(); }
    }
    return { LocalBridge, validateSettings, DEFAULT_URL, ALARM };
});
