import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;

const storage = { adb_language: 'en' };
const chromeStub = {
  storage: {
    local: {
      get: async key => {
        if (typeof key === 'string') return { [key]: storage[key] };
        if (Array.isArray(key)) return Object.fromEntries(key.map(k => [k, storage[k]]));
        return { ...storage };
      },
      set: async patch => { Object.assign(storage, patch); }
    },
    onChanged: { addListener() {} }
  },
  i18n: { getUILanguage: () => 'en-US' }
};

function boot(page) {
  const dom = new JSDOM(fs.readFileSync(`${ROOT}${page}`, 'utf8'), { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  const core = require(`${ROOT}i18n/core.js`);
  globalThis.ADB_I18N = core;
  new Function('ADB_I18N', fs.readFileSync(`${ROOT}i18n/panel.js`, 'utf8'))(core);
  require(`${ROOT}i18n/dom.js`);
  return { dom, core };
}

function applyStatic(doc, core) {
  doc.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = core.translate(node.textContent); });
  doc.querySelectorAll('[data-i18n-title]').forEach(node => { node.title = core.translate(node.dataset.i18nTitle); });
}

for (const page of ['popup/popup.html', 'dashboard/dashboard.html']) {
  test(`${page} 的静态标记都能翻，且不会被清空`, async () => {
    const { dom, core } = boot(page);
    await core.init(chromeStub);
    const doc = dom.window.document;
    applyStatic(doc, core);

    const marked = [...doc.querySelectorAll('[data-i18n]')];
    assert.ok(marked.length > 0, '页面里没有 data-i18n 标记');
    for (const node of marked) {
      assert.ok(node.textContent.trim().length > 0, `元素被清空：${node.id || node.className || node.tagName}`);
      assert.ok(!/[\u4e00-\u9fa5]/.test(node.textContent), `还是中文：${node.textContent.trim()}`);
    }

    for (const node of doc.querySelectorAll('[data-i18n-title]')) {
      assert.ok(node.title && !/[\u4e00-\u9fa5]/.test(node.title), `title 没翻：${node.title}`);
    }
  });

  test(`${page} 里运行时插入的文案也会翻`, async () => {
    const { dom, core } = boot(page);
    await core.init(chromeStub);
    const doc = dom.window.document;
    globalThis.MAPUS_I18N_DOM.start(doc.body);

    const probe = doc.createElement('div');
    probe.id = 'i18nProbe';
    probe.textContent = '12 条路径';
    doc.body.append(probe);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.getElementById('i18nProbe').textContent, '12 paths');
  });
}
