import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline } from '../ui/agent/markdown.js';

test('标准表格解析成 table 块', () => {
  const md = ['| # | 标题 |', '|---|---|', '| 1 | 外交部回应 |', '| 2 | 央视发声 |'].join('\n');
  const blocks = parseBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].head, ['#', '标题']);
  assert.deepEqual(blocks[0].align, ['', '']);
  assert.deepEqual(blocks[0].rows, [['1', '外交部回应'], ['2', '央视发声']]);
});

test('对齐标记被识别', () => {
  const md = ['| a | b | c |', '|:--|:-:|--:|', '| 1 | 2 | 3 |'].join('\n');
  const [table] = parseBlocks(md);
  assert.deepEqual(table.align, ['left', 'center', 'right']);
});

test('没有外层竖线的表格也能认出来', () => {
  const md = ['# | 标题', '--- | ---', '1 | 内容'].join('\n');
  const [table] = parseBlocks(md);
  assert.equal(table.type, 'table');
  assert.deepEqual(table.head, ['#', '标题']);
  assert.deepEqual(table.rows, [['1', '内容']]);
});

test('正文里的竖线不会被误判成表格', () => {
  const blocks = parseBlocks('a | b\nc | d');
  assert.ok(blocks.every(block => block.type === 'p'));
});

test('表格前后的正文都还在', () => {
  const md = ['前言', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '后记'].join('\n');
  const blocks = parseBlocks(md);
  assert.deepEqual(blocks.map(b => b.type), ['p', 'table', 'p']);
  assert.equal(blocks[2].text, '后记');
});

test('行单元格少于表头补空、多于表头截断', () => {
  const md = ['| a | b |', '|---|---|', '| 1 |', '| 1 | 2 | 3 |'].join('\n');
  const [table] = parseBlocks(md);
  assert.deepEqual(table.rows, [['1', ''], ['1', '2']]);
});

test('流式只到表头（分隔行还没来）时不崩，按段落降级', () => {
  const blocks = parseBlocks('| # | 标题 |');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'p');
});

test('表格里的代码块与加粗仍走内联解析', () => {
  const md = ['| k | v |', '|---|---|', '| `a` | **b** |'].join('\n');
  const [table] = parseBlocks(md);
  const [key, value] = table.rows[0];
  assert.equal(parseInline(key)[0].type, 'code');
  assert.equal(parseInline(value)[0].type, 'strong');
});

test('分隔行格数比表头多也不会串列', () => {
  const md = ['| a | b |', '|---|---|---|', '| 1 | 2 |'].join('\n');
  const [table] = parseBlocks(md);
  assert.deepEqual(table.head, ['a', 'b']);
  assert.deepEqual(table.rows, [['1', '2']]);
});

test('表格后面紧跟列表，列表不被吞', () => {
  const md = ['| a | b |', '|---|---|', '| 1 | 2 |', '- 项目一', '- 项目二'].join('\n');
  const blocks = parseBlocks(md);
  assert.deepEqual(blocks.map(b => b.type), ['table', 'ul']);
  assert.deepEqual(blocks[1].items, ['项目一', '项目二']);
});
