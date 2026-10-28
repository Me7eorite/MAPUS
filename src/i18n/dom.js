(function (root) {
  'use strict';

  const HAN = /[\u4e00-\u9fa5]/;
  const SKIP_SELECTOR = [
    'pre', 'code', 'textarea', 'script', 'style',
    '[data-i18n-skip]',
    '[data-view="agent"]',
    '.md-code', '.md'
  ].join(',');

  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

  function api() {
    return root.ADB_I18N || null;
  }

  const COUNT_HEAD = /^([\d][\d.,]*%?)\s*([\u4e00-\u9fa5][\s\S]*)$/;
  const COUNT_TAIL = /^([\u4e00-\u9fa5][\s\S]*?)\s*([\d][\d.,]*%?)$/;

  function byPrefix(body, lookup) {
    const space = body.indexOf(' ');
    if (space < 2 || space > body.length - 2) return null;
    const head = body.slice(0, space);
    if (!HAN.test(head)) return null;
    const out = lookup(head);
    if (out === head) return null;
    return out + body.slice(space);
  }

  function translate(text) {
    const i18n = api();
    if (!i18n || typeof i18n.translate !== 'function') return null;
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!match) return null;
    const body = match[2];
    if (!body || !HAN.test(body)) return null;
    const lookup = value => {
      try { return i18n.translate(value); } catch (_) { return value; }
    };
    let out = lookup(body);
    if (out === body) {
      const count = COUNT_HEAD.exec(body) || COUNT_TAIL.exec(body);
      if (count) {
        const rest = lookup(count[2]);
        if (rest !== count[2]) out = count[1] + ' ' + rest;
      }
    }
    if (out === body) {
      const prefixed = byPrefix(body, lookup);
      if (prefixed) out = prefixed;
    }
    if (out === body) return null;
    return match[1] + out + match[3];
  }

  function skipped(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return true;
    return Boolean(el.closest(SKIP_SELECTOR));
  }

  function walkText(node) {
    if (node.nodeType === 3) {
      if (skipped(node)) return;
      const next = translate(node.nodeValue);
      if (next !== null) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.closest && node.closest(SKIP_SELECTOR)) return;
    for (const attr of ATTRS) {
      const value = node.getAttribute && node.getAttribute(attr);
      if (!value || !HAN.test(value)) continue;
      const next = translate(value);
      if (next !== null) node.setAttribute(attr, next);
    }
    for (const child of Array.from(node.childNodes)) walkText(child);
  }

  function startDomI18n(scope) {
    const target = scope || root.document && root.document.body;
    if (!target || typeof root.MutationObserver !== 'function') return;
    walkText(target);
    const observer = new root.MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target && !skipped(record.target)) {
            const attr = record.attributeName;
            if (ATTRS.includes(attr)) {
              const value = record.target.getAttribute(attr);
              const next = value && translate(value);
              if (next !== null) record.target.setAttribute(attr, next);
            }
          }
          continue;
        }
        for (const node of record.addedNodes) walkText(node);
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ATTRS
    });
    return observer;
  }

  root.MAPUS_I18N_DOM = { start: startDomI18n, translate };
})(typeof globalThis === 'undefined' ? this : globalThis);
