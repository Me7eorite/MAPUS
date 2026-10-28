
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { storage: { local: { get: (_keys, callback) => callback && callback({}) } } };

const { AgentStore } = await import('../ui/agent/store.js');

const REQUEST_ID = 'req-1';

function makeStore(backend) {
  const store = new AgentStore();
  store.requestId = REQUEST_ID;
  store.set({
    config: { backend, dshUrl: 'http://127.0.0.1:7355', baseUrl: 'https://api.example.com', model: 'demo' },
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: '看看这个页面' }] },
      { id: 'm2', role: 'assistant', parts: [] }
    ]
  });
  return store;
}

const emit = (store, event) => store.onEvent({ ...event, requestId: REQUEST_ID });
const lastParts = store => store.state.messages[store.state.messages.length - 1].parts;

test('Harness 模式：步进事件不再产出可显示的数字', () => {
  const store = makeStore('dsh');
  emit(store, { type: 'step', index: 3, total: 40, used: 2 });
  assert.deepEqual(store.state.step, { index: 0, total: 0, harness: true });
});

test('Harness 模式：推理块与工具卡都不带步号', () => {
  const store = makeStore('dsh');
  emit(store, { type: 'step', index: 3, total: 40, used: 2 });
  emit(store, { type: 'reasoning', text: '先看现场', step: 3 });
  emit(store, { type: 'tool', id: 'call-1', name: 'scan_page', args: {}, step: 3 });

  const parts = lastParts(store);
  assert.equal(parts.find(part => part.type === 'reasoning').step, 0);
  assert.equal(parts.find(part => part.type === 'tool').step, 0);
});

test('Harness 模式：不显示「已用满 N 步」', () => {
  const store = makeStore('dsh');
  emit(store, { type: 'done', steps: 40, budget: 40, exhausted: true });
  assert.equal(store.state.exhausted, null);
});

test('内置模式：步数与「用满步数」照旧', () => {
  const store = makeStore('builtin');
  emit(store, { type: 'step', index: 3, total: 40, used: 2 });
  emit(store, { type: 'reasoning', text: '先看现场', step: 3 });
  emit(store, { type: 'tool', id: 'call-1', name: 'scan_page', args: {}, step: 3 });

  assert.deepEqual(store.state.step, { index: 3, total: 40 });
  const parts = lastParts(store);
  assert.equal(parts.find(part => part.type === 'reasoning').step, 3);
  assert.equal(parts.find(part => part.type === 'tool').step, 3);

  emit(store, { type: 'done', steps: 40, budget: 40, exhausted: true });
  assert.deepEqual(store.state.exhausted, { steps: 40, budget: 40 });
});
