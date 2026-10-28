import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

function boot(dom) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  const i18n = require('../i18n/core.js');
  globalThis.ADB_I18N = i18n;
  i18n.setLocale('en');
  require('../i18n/panel.js');
  require('../i18n/dom.js');
  return i18n;
}

test('DOM 里的中文文本会被翻成英文', () => {
  const dom = new JSDOM('<body><span id="a">总览</span></body>');
  boot(dom);
  globalThis.MAPUS_I18N_DOM.start(dom.window.document.body);
  assert.equal(dom.window.document.getElementById('a').textContent, 'Overview');
});

test('title 属性也会翻', () => {
  const dom = new JSDOM('<body><button id="b" title="扫描">扫描</button></body>');
  boot(dom);
  globalThis.MAPUS_I18N_DOM.start(dom.window.document.body);
  const button = dom.window.document.getElementById('b');
  assert.equal(button.getAttribute('title'), 'Scan');
  assert.equal(button.textContent, 'Scan');
});

test('代码块与预格式区保持原样', () => {
  const dom = new JSDOM('<body><pre id="p">总览</pre><code id="c">总览</code></body>');
  boot(dom);
  globalThis.MAPUS_I18N_DOM.start(dom.window.document.body);
  assert.equal(dom.window.document.getElementById('p').textContent, '总览');
  assert.equal(dom.window.document.getElementById('c').textContent, '总览');
});

test('词典里没有的句子原样保留，不会变成空', () => {
  const dom = new JSDOM('<body><span id="u">这句没收录</span></body>');
  boot(dom);
  globalThis.MAPUS_I18N_DOM.start(dom.window.document.body);
  assert.equal(dom.window.document.getElementById('u').textContent, '这句没收录');
});

test('后插入的节点也会被翻译', async () => {
  const dom = new JSDOM('<body><div id="root"></div></body>');
  boot(dom);
  const doc = dom.window.document;
  globalThis.MAPUS_I18N_DOM.start(doc.body);
  const span = doc.createElement('span');
  span.textContent = '报告';
  doc.getElementById('root').append(span);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(span.textContent, 'Findings');
});


function tr(text) {
  const dom = new JSDOM('<body></body>');
  boot(dom);
  return globalThis.MAPUS_I18N_DOM.translate(text);
}

test('数字在前的量词短语：只翻短语，空格不重复', () => {
  assert.equal(tr('12 条路径'), '12 paths');
  assert.equal(tr('12 组特征'), '12 signature groups');
  assert.equal(tr('12 组可编辑项'), '12 editable groups');
});

test('数字在后的量词短语', () => {
  assert.equal(tr('已启用 3'), 'Enabled 3');
  assert.equal(tr('特征 12'), 'Signatures 12');
  assert.equal(tr('敏感数据 3'), 'Sensitive data 3');
});

test('带占位符的整句按渲染后的文字匹配', () => {
  assert.equal(tr('扫描完成 · 7 项敏感数据'), 'Scan complete · 7 sensitive items');
  assert.equal(tr('已保存 3 条白名单'), 'Saved 3 whitelist entries');
  assert.equal(tr('任务 3（完成 2 · 出错 1）'), '3 tasks (2 done · 1 failed)');
});

test('句首的变量不会被当成短语去查', () => {
  assert.equal(tr('Vue 路由'), 'Vue routes');
  assert.equal(tr('平台 MacIntel'), 'Platform MacIntel');
});

test('纯数字、纯符号、纯英文都不动', () => {
  assert.equal(tr('12'), null);
  assert.equal(tr('1204'), null);
  assert.equal(tr('Vue'), null);
});

test('多行占位（textarea 的 placeholder）整段替换', () => {
  const text = '一行一个站点，例如：\nhttp://localhost:1180/\nhttps://target.example.com/';
  assert.equal(tr(text), 'One site per line, for example:\nhttp://localhost:1180/\nhttps://target.example.com/');
});

test('骨架更长的模板优先，短模板不会抢走整句', () => {
  assert.match(tr('任务 5（完成 4 · 出错 1）'), /^5 tasks \(4 done · 1 failed\)$/);
});
