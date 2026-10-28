(function (root, factory) {
    if (root.window === root && root.location?.protocol !== 'chrome-extension:') {
        const key = Symbol.for('antidebug-breaker.i18n');
        if (!root[key]) Object.defineProperty(root, key, { value: factory(root), configurable: false });
        return;
    }
    const api = root.ADB_I18N || factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else if (!root.ADB_I18N) Object.defineProperty(root, 'ADB_I18N', { value: api, configurable: false });
})(globalThis, function (root) {
    'use strict';
    const apply = Reflect.apply, replace = String.prototype.replace, string = String;
    const entries = new Map(), exact = new Map(), patterns = [];
    const listeners = new Set();
    let preference = 'auto', locale = 'en', browserLanguage;
    let ready = null, pageListening = false;
    const normalize = value => value === 'en' || value === 'zh_CN' ? value : 'auto';
    const browserLocale = chrome => {
        try { return chrome?.i18n?.getUILanguage() || root.navigator?.language || 'en'; }
        catch (_) { return 'en'; }
    };
    function resolve(value, browser = browserLocale(root.chrome)) {
        const chosen = normalize(value);
        return chosen !== 'auto' ? chosen : /^zh(?:[-_]|$)/i.test(browser) ? 'zh_CN' : 'en';
    }
    function setLocale(value, browser = browserLanguage || browserLocale(root.chrome)) {
        const previous = locale, oldPreference = preference;
        preference = normalize(value);
        browserLanguage = browser;
        locale = resolve(preference, browser);
        if (previous !== locale || oldPreference !== preference) {
            for (const listener of listeners) { try { listener({ locale, preference }); } catch (_) {} }
        }
        return locale;
    }
    function format(template, params = []) {
        return apply(replace, template, [/\{(\d+)\}/g, (token, index) =>
            params[index] === undefined ? token : string(params[index])]);
    }
    function register(messages) {
        for (const [key, value] of Object.entries(messages)) {
            if (!value || typeof value.en !== 'string' || typeof value.zh_CN !== 'string') {
                throw new Error('Invalid translation entry: ' + key);
            }
            if (entries.has(key)) continue;
            entries.set(key, Object.freeze({ ...value }));
            for (const template of new Set([value.en, value.zh_CN])) {
                if (!/\{\d+\}/.test(template)) { if (!exact.has(template)) exact.set(template, key); continue; }
                if (template.replace(/\{\d+\}/g, '').trim().length < 4) continue;
                const indices = [];
                let expression = '', last = 0;
                for (const match of template.matchAll(/\{(\d+)\}/g)) {
                    expression += template.slice(last, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\S]*?)';
                    indices.push(Number(match[1])); last = match.index + match[0].length;
                }
                expression += template.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                patterns.push({ key, indices, regex: new RegExp('^' + expression + '$') });
            }
        }
    }
    function t(key, params = [], language = locale) {
        const entry = entries.get(key);
        return entry ? format(entry[language] || entry.en, params) : key;
    }
    function describe(message) {
        if (typeof message !== 'string') return null;
        const key = exact.get(message);
        if (key) return { messageKey: key, messageParams: [] };
        for (const item of patterns) {
            const match = item.regex.exec(message);
            if (!match) continue;
            const messageParams = [];
            item.indices.forEach((index, offset) => { messageParams[index] = match[offset + 1]; });
            return { messageKey: item.key, messageParams };
        }
        return null;
    }
    function translate(message, language = locale) {
        const found = describe(message);
        return found ? t(found.messageKey, found.messageParams, language) : message;
    }
    function error(value, language = locale) {
        if (value?.messageKey && entries.has(value.messageKey)) return t(value.messageKey, value.messageParams || [], language);
        return translate(value?.message || (typeof value === 'string' ? value : value?.code || ''), language);
    }
    function init(chrome = root.chrome) {
        if (ready) return ready;
        ready = (async () => {
            let saved;
            try { saved = (await chrome?.storage?.local?.get('adb_language'))?.adb_language; } catch (_) {}
            setLocale(saved, browserLocale(chrome));
            chrome?.storage?.onChanged?.addListener((changes, area) => {
                if (area === 'local' && Object.hasOwn(changes, 'adb_language')) setLocale(changes.adb_language.newValue, browserLocale(chrome));
            });
            return api;
        })();
        return ready;
    }
    function listenPage() {
        if (pageListening || typeof root.addEventListener !== 'function') return;
        pageListening = true;
        root.addEventListener('message', event => {
            if (event.source === root && event.data?.source === 'antidebug-extension' &&
                event.data.type === 'ADB_LANGUAGE_CHANGED' && ['en', 'zh_CN'].includes(event.data.locale)) {
                setLocale(event.data.locale);
            }
        });
    }
    const api = { register, t, resolve, setLocale, init, describe, translate, error, listenPage,
        onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        get locale() { return locale; }, get preference() { return preference; }, get ready() { return ready || Promise.resolve(api); },
        has: key => entries.has(key) };
    setLocale('auto');
    return api;
});
