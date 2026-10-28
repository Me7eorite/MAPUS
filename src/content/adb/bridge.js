(() => {
    'use strict';
    let snapshot = null;
    const installed = new Set();
    let reportTimer;
    const send = message => chrome.runtime.sendMessage(message).catch(() => null);
    const post = message => window.postMessage({ source: 'antidebug-extension', ...message }, '*');

    function reportInstalled() {
        clearTimeout(reportTimer);
        reportTimer = setTimeout(() => {
            if (!snapshot) return;
            send({ type: 'ADB_CONFIG_APPLIED', revision: snapshot.revision,
                scriptIds: [...installed].filter(id => snapshot.enabledScripts.includes(id)), href: location.href });
        }, 0);
    }

    function requestRoutes(framework, requestId, rescan) {
        if (!['vue', 'react'].includes(framework)) return;
        const upper = framework.toUpperCase();
        if (rescan) post({ type: 'MANUAL_RESCAN_' + upper, requestId });
        post({ type: 'REQUEST_' + upper + '_ROUTER_DATA', requestId, rescan: Boolean(rescan) });
    }

    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (message.type === 'ADB_LANGUAGE_CHANGED') {
            if (['en', 'zh_CN'].includes(message.locale)) post({ type: 'ADB_LANGUAGE_CHANGED', locale: message.locale });
            respond({ success: true });
        } else if (message.type === 'ADB_ROUTES_REQUEST') {
            requestRoutes(message.framework, message.requestId, message.rescan);
            respond({ success: true, forwarded: true });
        } else if (message.type === 'REQUEST_VUE_ROUTER_DATA' || message.type === 'REQUEST_REACT_ROUTER_DATA') {
            requestRoutes(message.type.includes('REACT') ? 'react' : 'vue', null, false);
            respond({ success: true });
        } else if (message.type === 'TRIGGER_VUE_RESCAN' || message.type === 'TRIGGER_REACT_RESCAN') {
            requestRoutes(message.type.includes('REACT') ? 'react' : 'vue', null, true);
            respond({ success: true });
        } else if (message.type === 'scripts_updated') {
            respond({ success: true, requiresReload: true });
        }
    });

    window.addEventListener('message', event => {
        if (event.source !== window || !event.data || typeof event.data !== 'object') return;
        const message = event.data;
        const framework = message.type === 'VUE_ROUTER_DATA' && message.source === 'get-vue-script' ? 'vue'
            : message.type === 'REACT_ROUTER_DATA' && message.source === 'get-react-script' ? 'react' : null;
        if (framework) {
            send({ type: 'ADB_ROUTE_DATA', framework,
                requestId: typeof message.requestId === 'string' ? message.requestId : undefined,
                href: location.href, data: message.data });
        } else if (message.source === 'antidebug-runtime' && message.type === 'ADB_HOOK_INSTALLED') {
            if (typeof message.scriptId === 'string') installed.add(message.scriptId);
            reportInstalled();
        } else if (message.source === 'antidebug-runtime' && message.type === 'ADB_RUNTIME_STATUS') {
            for (const id of (Array.isArray(message.scriptIds) ? message.scriptIds : []).slice(0, 100)) {
                if (typeof id === 'string') installed.add(id);
            }
            reportInstalled();
        }
    });

    send({ type: 'ADB_DOCUMENT_READY', href: location.href }).then(response => {
        if (!response?.ok) return;
        snapshot = response.result;
        if (['en', 'zh_CN'].includes(snapshot.locale)) post({ type: 'ADB_LANGUAGE_CHANGED', locale: snapshot.locale });
        const ready = [];
        for (const id of snapshot.enabledScripts || []) {
            const config = snapshot.configs?.[id];
            if (!config) continue;
            try {
                for (const [key, value] of Object.entries(config)) {
                    if (key === 'keyword_filter_enabled') continue;
                    localStorage.setItem('Antidebug_breaker_' + id + '_' + key,
                        key === 'param' ? JSON.stringify(value) : String(value));
                }
                ready.push(id);
            } catch (error) {
                console.warn('[AntiDebug] Configuration unavailable for ' + id + ':', error);
            }
        }
        try {
            localStorage.setItem('Antidebug_breaker_Hooks', JSON.stringify(snapshot.mergedHooks || {}));
        } catch (_) {  }
        if (snapshot.enabledScripts?.includes('AntiAnti_Hook')) ready.push('AntiAnti_Hook');
        post({ type: 'HOOK_CONFIG_READY', scriptIds: ready, revision: snapshot.revision });
        post({ type: 'ADB_RUNTIME_STATUS_REQUEST' });
        reportInstalled();
    });
})();
