import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline, safeHref } from '../ui/agent/markdown.js';

test('链接解析出文字和地址', () => {
  const tokens = parseInline('见 [官方文档](https://example.com/doc) 说明');
  assert.deepEqual(tokens, [
    { type: 'text', text: '见 ' },
    { type: 'link', text: '官方文档', href: 'https://example.com/doc' },
    { type: 'text', text: ' 说明' },
  ]);
});

test('图片单独成 token，不会退化成链接', () => {
  const tokens = parseInline('![截图](./a.png)');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'image');
  assert.equal(tokens[0].alt, '截图');
  assert.equal(tokens[0].href, './a.png');
});

test('图片和链接混在一行时各归各位', () => {
  const tokens = parseInline('[文档](https://a.com) 与 ![图](https://a.com/x.png)');
  assert.deepEqual(tokens.map(t => t.type), ['link', 'text', 'image']);
});

test('删除线', () => {
  assert.deepEqual(parseInline('~~作废~~'), [{ type: 'del', text: '作废' }]);
});

test('只有 http/https/mailto 的地址放行', () => {
  assert.equal(safeHref('https://a.com'), 'https://a.com');
  assert.equal(safeHref('http://a.com'), 'http://a.com');
  assert.equal(safeHref('mailto:a@b.com'), 'mailto:a@b.com');
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('data:text/html,<script>'), '');
  assert.equal(safeHref('vbscript:x'), '');
});

test('引用合并连续多行，遇到空行结束', () => {
  const blocks = parseBlocks('> 第一行\n> 第二行\n\n正文');
  assert.equal(blocks[0].type, 'quote');
  assert.equal(blocks[0].text, '第一行\n第二行');
  assert.equal(blocks[1].type, 'p');
});

test('三种分割线都认', () => {
  for (const hr of ['---', '***', '___', '- - -']) {
    const blocks = parseBlocks(`上\n\n${hr}\n\n下`);
    assert.deepEqual(blocks.map(b => b.type), ['p', 'hr', 'p'], `分割线 ${hr}`);
  }
});

test('分割线不会被当成列表项', () => {
  const blocks = parseBlocks('---');
  assert.deepEqual(blocks.map(b => b.type), ['hr']);
});

test('任务列表带勾选状态', () => {
  const blocks = parseBlocks('- [x] 做完了\n- [ ] 还没做');
  assert.equal(blocks[0].type, 'ul');
  assert.equal(blocks[0].task, true);
  assert.deepEqual(blocks[0].items, [
    { text: '做完了', checked: true },
    { text: '还没做', checked: false },
  ]);
});

test('普通列表不会被打上 task 标记', () => {
  const blocks = parseBlocks('- 普通一项');
  assert.equal(blocks[0].task, undefined);
  assert.deepEqual(blocks[0].items, ['普通一项']);
});

test('连续多行正文合并成一个段落并保留换行', () => {
  const blocks = parseBlocks('第一行\n第二行\n第三行');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'p');
  assert.equal(blocks[0].text, '第一行\n第二行\n第三行');
});

test('段落后紧跟列表时，段落只出现一次', () => {
  const blocks = parseBlocks('说明文字\n继续说明\n- 一\n- 二');
  assert.deepEqual(blocks.map(b => b.type), ['p', 'ul']);
  assert.equal(blocks[0].text, '说明文字\n继续说明');
});

test('加粗的编号不会被当成有序列表', () => {
  const blocks = parseBlocks('**1. 标题**\n正文');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'p');
});

test('表格单元格里的链接与加粗都能解析', () => {
  const md = ['| 站点 | 说明 |', '|---|---|', '| [A](https://a.com) | **重要** |'].join('\n');
  const [table] = parseBlocks(md);
  assert.equal(parseInline(table.rows[0][0])[0].type, 'link');
  assert.equal(parseInline(table.rows[0][1])[0].type, 'strong');
});

test('引用里的行内语法照常解析', () => {
  const [quote] = parseBlocks('> 用 `npm i` 装，详见 [文档](https://a.com)');
  assert.equal(quote.type, 'quote');
  const types = parseInline(quote.text).map(t => t.type);
  assert.deepEqual(types, ['text', 'code', 'text', 'link']);
});

test('地址里带括号不会被截断', () => {
  const [link] = parseInline('[Foo](https://en.wikipedia.org/wiki/Foo_(bar))');
  assert.equal(link.href, 'https://en.wikipedia.org/wiki/Foo_(bar)');
});

test('危险地址仍被解析出来，但 safeHref 拒绝放行', () => {
  const [, link] = parseInline('看 [点我](javascript:alert(1)) 这里');
  assert.equal(link.type, 'link');
  assert.equal(link.href, 'javascript:alert(1)');
  assert.equal(safeHref(link.href), '');
});
