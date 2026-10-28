(function (root, factory) {
    const I = typeof module === 'object' && module.exports ? require('../i18n/core.js') : root.ADB_I18N;
    if (typeof module === 'object' && module.exports) require('../i18n/errors.js');
    const api = factory(I);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ADBPolicy = api;
})(globalThis, function (I) {
    'use strict';

    const COMBINED = 'Hook_JSEncrypt_SMcrypto';
    const PARTS = ['Hook_JSEncrypt', 'Hook_SMcrypto'];
    class CommandError extends Error {
        constructor(code, message, details) {
            super(message);
            this.name = 'CommandError';
            this.code = code;
            if (details !== undefined) this.details = details;
        }
    }
    const fail = (code, message, details) => { throw new CommandError(code, message, details); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const unique = values => [...new Set(values)];
    const stringList = value => {
        if (!Array.isArray(value)) return false;
        for (const item of value) if (typeof item !== 'string') return false;
        return true;
    };

    function expand(ids, catalog) {
        const known = new Set(catalog.map(script => script.id));
        return unique((Array.isArray(ids) ? ids : []).flatMap(id => id === COMBINED ? PARTS : [id])
            .filter(id => typeof id === 'string' && known.has(id)));
    }
    function normalize(ids, catalog) {
        const result = expand(ids, catalog);
        const parents = new Set(catalog.filter(script => script.parentScript && result.includes(script.id))
            .map(script => script.parentScript));
        return result.filter(id => !parents.has(id));
    }
    function combine(ids, catalog) {
        const result = normalize(ids, catalog);
        if (!PARTS.every(id => result.includes(id))) return result;
        return [...result.filter(id => !PARTS.includes(id)), COMBINED];
    }
    function applyScriptChanges(ids, changes, catalog) {
        if (!Array.isArray(changes) || changes.length > catalog.length * 2) {
            fail('INVALID_PARAMS', 'changes must be an array of script settings.');
        }
        let result = normalize(ids, catalog);
        for (const change of changes) {
            if (!object(change) || typeof change.enabled !== 'boolean') {
                fail('INVALID_PARAMS', 'Each change requires id and boolean enabled.');
            }
            const script = catalog.find(item => item.id === change.id);
            if (!script) fail('UNKNOWN_SCRIPT', 'Unknown script ID.', { scriptId: change.id });
            if (script.id === COMBINED) {
                fail('COMBINED_SCRIPT', 'Set the individual script IDs; their registration is combined automatically.', { scriptIds: PARTS });
            }
            if (script.parentScript) {
                if (change.enabled) {
                    result = result.filter(id => id !== script.parentScript);
                    if (!result.includes(script.id)) result.push(script.id);
                } else if (result.includes(script.id)) {
                    result = result.filter(id => id !== script.id);
                    const otherChild = catalog.some(item => item.parentScript === script.parentScript && result.includes(item.id));
                    if (!otherChild && !result.includes(script.parentScript)) result.push(script.parentScript);
                }
            } else if (change.enabled) {
                const childEnabled = catalog.some(item => item.parentScript === script.id && result.includes(item.id));
                if (!childEnabled && !result.includes(script.id)) result.push(script.id);
            } else {
                const children = new Set(catalog.filter(item => item.parentScript === script.id).map(item => item.id));
                result = result.filter(id => id !== script.id && !children.has(id));
            }
        }
        return normalize(result, catalog);
    }

    function switches(script) {
        const metadata = new Set(['id', 'name', 'description', 'category', 'fixed_variate', 'has_Param', 'parentScript', 'hidden', 'value', 'Hooks']);
        return Object.keys(script).filter(key => !metadata.has(key) && script[key] === 1);
    }
    function configSchema(script) {
        if (script.category !== 'hook' || script.id === 'AntiAnti_Hook') return null;
        const properties = {};
        if (script.fixed_variate === 1) properties.value = { type: ['string', 'number'] };
        if (script.has_Param === 1) {
            properties.param = { type: 'array', items: { type: 'string' }, maxItems: 200 };
            properties.keyword_filter_enabled = { type: 'boolean' };
        }
        switches(script).forEach(key => { properties[key] = { enum: [0, 1] }; });
        return { type: 'object', properties, additionalProperties: false };
    }
    function normalizeConfig(script, existing = {}, patch = {}) {
        const schema = configSchema(script);
        if (!schema) fail('NOT_CONFIGURABLE', 'This script has no Hook parameters.', { scriptId: script.id });
        if (!object(patch)) fail('INVALID_PARAMS', 'patch must be an object.');
        const invalid = (field, message) => fail('INVALID_CONFIG', message, { scriptId: script.id, field });
        if (!object(existing)) invalid('config', 'Saved Hook configuration must be an object.');
        const allowed = new Set(Object.keys(schema.properties));
        if (script.fixed_variate !== 1) allowed.add('flag');
        for (const key of Object.keys(patch)) {
            if (!allowed.has(key)) fail('INVALID_CONFIG', 'Unsupported Hook configuration field.', { scriptId: script.id, field: key });
        }
        const valueFor = (key, fallback) => own(patch, key) ? patch[key] : own(existing, key) ? existing[key] : fallback;
        const result = {};
        if (script.fixed_variate === 1) {
            const value = valueFor('value', script.value === undefined ? '' : script.value);
            if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) {
                invalid('value', 'value must be a finite number or a string.');
            }
            if (typeof value === 'string' && value.length > 65536 &&
                !(typeof existing.value === 'string' && (value === existing.value || value.length < existing.value.length))) {
                invalid('value', 'New value strings must have at most 65536 characters; longer saved values may be retained or shortened.');
            }
            result.value = value;
        } else {
            result.flag = 0;
            if (script.has_Param === 1) {
                const param = valueFor('param', []);
                const enabled = valueFor('keyword_filter_enabled', false);
                if (!stringList(param)) invalid('param', 'param must be an array of strings.');
                if (own(patch, 'param')) {
                    const previous = stringList(existing.param) ? existing.param : [];
                    const retained = new Set(previous);
                    if (param.length > Math.max(200, previous.length) ||
                        param.some(item => item.length > 4096 && !retained.has(item))) {
                        invalid('param', 'New keywords must have at most 4096 characters and at most 200 entries; oversized saved entries may be retained or removed without growing the list.');
                    }
                }
                if (typeof enabled !== 'boolean') invalid('keyword_filter_enabled', 'keyword_filter_enabled must be boolean.');
                result.param = unique(param);
                result.keyword_filter_enabled = enabled;
                result.flag = enabled && result.param.length > 0 ? 1 : 0;
            }
        }
        for (const key of switches(script)) {
            const value = valueFor(key, 0);
            if (value !== 0 && value !== 1 && value !== false && value !== true) {
                invalid(key, 'Hook switches must be 0 or 1.');
            }
            result[key] = Number(value);
        }
        return result;
    }
    function mergedHooks(ids, catalog) {
        const expanded = expand(ids, catalog);
        if (!expanded.includes('AntiAnti_Hook')) return null;
        const result = { Function: [], Property: [] };
        for (const id of expanded) {
            const script = catalog.find(item => item.id === id);
            for (const kind of Object.keys(result)) {
                if (script.Hooks && Array.isArray(script.Hooks[kind])) result[kind].push(...script.Hooks[kind]);
            }
        }
        result.Function = unique(result.Function);
        result.Property = unique(result.Property);
        return result.Function.length || result.Property.length ? result : null;
    }
    function serializeError(error) {
        const result = { code: error.code || 'INTERNAL_ERROR', message: error.message || String(error) };
        const localized = I?.describe(result.message);
        if (localized) {
            Object.assign(result, localized);
            result.message = I.t(localized.messageKey, localized.messageParams, 'en');
        }
        if (error.details !== undefined) result.details = error.details;
        return result;
    }
    const message = text => I?.translate(text, 'en') || text;
    return { COMBINED, PARTS, CommandError, fail, object, own, expand, normalize, combine, applyScriptChanges, configSchema, normalizeConfig, mergedHooks, serializeError, message };
});
