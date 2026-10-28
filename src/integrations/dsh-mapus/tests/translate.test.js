import assert from 'node:assert/strict'
import test from 'node:test'

const { createTurnState, translateSessionEvent, translateStreamFrame, finishTurn, mergeUsage, normalizeEndReason } = await import('../lib/translate.js')

test('step/start 映射成 step 事件并推进计数', () => {
  const state = createTurnState({ maxSteps: 12 })
  const events = translateSessionEvent({ type: 'step/start', data: { turn: 1, step: 3 } }, state)
  assert.deepEqual(events, [{ type: 'step', index: 3, total: 12, used: 2 }])
  assert.equal(state.step, 3)
})

test('文本增量与推理增量分别落到 delta / reasoning', () => {
  const state = createTurnState({ maxSteps: 40 })
  assert.deepEqual(
    translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'abc' } } }, state),
    [{ type: 'delta', text: 'abc' }],
  )
  assert.deepEqual(
    translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'reasoning-delta', text: '想一下' } } }, state),
    [{ type: 'reasoning', text: '想一下', step: 0 }],
  )
  assert.equal(state.text, 'abc')
  assert.equal(state.reasoning, '想一下')
})

test('无关事件与空 chunk 一律不产出 UI 事件', () => {
  const state = createTurnState()
  assert.deepEqual(translateSessionEvent({ type: 'request/header', data: {} }, state), [])
  assert.deepEqual(translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '' } } }, state), [])
  assert.deepEqual(translateSessionEvent(null, state), [])
})

test('usage 跨步骤累加', () => {
  const state = createTurnState()
  translateSessionEvent({ type: 'assistant/message', data: { usage: { inputTokens: 10, outputTokens: 2 } } }, state)
  translateSessionEvent({ type: 'assistant/message', data: { usage: { inputTokens: 5, outputTokens: 3 } } }, state)
  assert.deepEqual(state.usage, { inputTokens: 15, outputTokens: 5 })
})

test('mergeUsage 忽略非数值字段', () => {
  assert.deepEqual(mergeUsage({ a: 1 }, { a: 2, b: 'x', c: null }), { a: 3 })
  assert.equal(mergeUsage(null, null), null)
})

test('turn/end 的原因既能是字符串也能是对象', () => {
  assert.equal(normalizeEndReason('completed'), 'completed')
  assert.equal(normalizeEndReason({ kind: 'max-tokens' }), 'max-tokens')
  assert.equal(normalizeEndReason(undefined), 'unknown')
})

test('正常结束产出 done，带答案与步数', () => {
  const state = createTurnState({ maxSteps: 8 })
  translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '结论' } } }, state)
  translateSessionEvent({ type: 'turn/end', data: { reason: 'completed' } }, state)
  const terminal = finishTurn(state, { context: { url: 'https://a' } })
  assert.equal(terminal.type, 'done')
  assert.equal(terminal.answer, '结论')
  assert.equal(terminal.budget, 8)
  assert.deepEqual(terminal.context, { url: 'https://a' })
  assert.equal(terminal.exhausted, false)
})

test('aborted 与 blocked 都收口成 aborted', () => {
  for (const reason of ['aborted', 'blocked']) {
    const state = createTurnState()
    state.endReason = reason
    assert.equal(finishTurn(state).type, 'aborted')
  }
})

test('error 原因与异常都收口成 error，并带上原因文案', () => {
  const state = createTurnState()
  state.endReason = 'error'
  assert.equal(finishTurn(state).type, 'error')
  assert.match(finishTurn(state).message, /failed/)
  const failed = finishTurn(createTurnState(), { failure: new Error('模型 401') })
  assert.equal(failed.type, 'error')
  assert.equal(failed.message, '模型 401')
})

test('cause 里的真实原因会拼进 error 文案', () => {
  const outer = new Error('模型请求失败')
  outer.cause = new Error('连接被拒绝 ECONNREFUSED')
  const event = finishTurn(createTurnState(), { failure: outer })
  assert.equal(event.type, 'error')
  assert.equal(event.message, '模型请求失败: 连接被拒绝 ECONNREFUSED')

  const same = new Error('模型请求失败')
  same.cause = new Error('模型请求失败')
  assert.equal(finishTurn(createTurnState(), { failure: same }).message, '模型请求失败')
})

test('max-tokens 标成 budget 用尽', () => {
  const state = createTurnState()
  state.endReason = 'max-tokens'
  const terminal = finishTurn(state)
  assert.equal(terminal.type, 'done')
  assert.equal(terminal.exhausted, true)
})

test('assistant/message 在没有流式增量时补发正文', () => {
  const state = createTurnState()
  const events = translateSessionEvent({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '' }, { type: 'text', text: '收到测试' }] }, usage: { outputTokens: 3 } },
  }, state)
  assert.deepEqual(events, [{ type: 'delta', text: '收到测试' }])
  assert.equal(state.text, '收到测试')
  assert.deepEqual(state.usage, { outputTokens: 3 })
})

test('流式增量与 assistant/message 不重复，只补差量', () => {
  const state = createTurnState()
  translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '收到' } } }, state)
  const events = translateSessionEvent({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '收到测试' }] } },
  }, state)
  assert.deepEqual(events, [{ type: 'delta', text: '测试' }])
  assert.equal(state.text, '收到测试')
})

test('增量和 message 完全一致时不补发', () => {
  const state = createTurnState()
  translateSessionEvent({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '整段' } } }, state)
  assert.deepEqual(translateSessionEvent({
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '整段' }] } },
  }, state), [])
  assert.equal(state.text, '整段')
})

test('连续两步各自的正文都要落到 answer，不能被当成续写吞掉', () => {
  const state = createTurnState()
  translateSessionEvent({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '我先读取页面。' }] } } }, state)
  translateSessionEvent({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '这是 example.com。' }] } } }, state)
  assert.equal(state.text, '我先读取页面。这是 example.com。')
})

test('assistant/message 里的推理也补发一次', () => {
  const state = createTurnState()
  translateSessionEvent({ type: 'step/start', data: { turn: 1, step: 2 } }, state)
  const events = translateSessionEvent({
    type: 'assistant/message',
    data: { step: 2, message: { content: [{ type: 'reasoning', text: '先看页面' }, { type: 'text', text: '好' }] } },
  }, state)
  assert.deepEqual(events, [
    { type: 'reasoning', text: '先看页面', step: 2 },
    { type: 'delta', text: '好' },
  ])
})

test('实时流帧把 text-delta 转成 delta，并记进 streamedText', () => {
  const state = createTurnState({ maxSteps: 40 })
  assert.deepEqual(
    translateStreamFrame({ type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 2 }, state),
    [],
    'start 只开计数，不出事件',
  )
  assert.equal(state.streamStep, 2)
  assert.deepEqual(
    translateStreamFrame(
      { type: 'chunk', attemptId: 'a1', revision: 1, index: 0, chunk: { type: 'text-delta', index: 0, text: '你' } },
      state,
    ),
    [{ type: 'delta', text: '你' }],
  )
  assert.equal(state.text, '你')
  assert.equal(state.streamedText, '你')
})

test('实时流帧里的 reasoning-delta 带上 start 帧的步数', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a2', revision: 1, turn: 1, step: 3 }, state)
  assert.deepEqual(
    translateStreamFrame(
      { type: 'chunk', attemptId: 'a2', revision: 1, index: 0, chunk: { type: 'reasoning-delta', index: 0, text: '想' } },
      state,
    ),
    [{ type: 'reasoning', text: '想', step: 3 }],
  )
  assert.equal(state.reasoning, '想')
})

test('同一 attempt 的重复/乱序流帧按 index 丢掉', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a3', revision: 1, turn: 1, step: 1 }, state)
  const frame = index => ({ type: 'chunk', attemptId: 'a3', revision: 1, index, chunk: { type: 'text-delta', index, text: 'x' } })
  assert.equal(translateStreamFrame(frame(0), state).length, 1)
  assert.deepEqual(translateStreamFrame(frame(0), state), [], '同一 index 重放要丢')
  assert.equal(translateStreamFrame(frame(1), state).length, 1)
  assert.deepEqual(translateStreamFrame(frame(1), state), [], '乱序回退也要丢')
  assert.equal(state.text, 'xx', '只累加真正转发出去的两段')
})

test('换成新的 attempt/revision 时流式计数从头算', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a4', revision: 1, turn: 1, step: 1 }, state)
  translateStreamFrame(
    { type: 'chunk', attemptId: 'a4', revision: 1, index: 0, chunk: { type: 'text-delta', index: 0, text: '旧' } },
    state,
  )
  assert.equal(state.streamedText, '旧')
  translateStreamFrame({ type: 'start', attemptId: 'a4', revision: 2, turn: 1, step: 1 }, state)
  assert.equal(state.streamedText, '', '换了 revision 要清掉旧计数')
  assert.equal(state.streamIndex, -1)
  translateStreamFrame(
    { type: 'chunk', attemptId: 'a4', revision: 2, index: 0, chunk: { type: 'text-delta', index: 0, text: '新' } },
    state,
  )
  assert.equal(state.streamedText, '新')
})

test('流式已经把正文发完时，落定的 assistant/message 不再重复补一次', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a5', revision: 1, turn: 1, step: 1 }, state)
  for (const [index, text] of ['你好', '，世界'].entries()) {
    translateStreamFrame(
      { type: 'chunk', attemptId: 'a5', revision: 1, index, chunk: { type: 'text-delta', index, text } },
      state,
    )
  }
  const settled = {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '你好，世界' }] }, usage: null },
  }
  assert.deepEqual(translateSessionEvent(settled, state), [], '已经流出去的部分不能再发一遍')
  assert.equal(state.text, '你好，世界')
})

test('流式只发了一部分时，落定时只补差量', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a6', revision: 1, turn: 1, step: 1 }, state)
  translateStreamFrame(
    { type: 'chunk', attemptId: 'a6', revision: 1, index: 0, chunk: { type: 'text-delta', index: 0, text: '前半' } },
    state,
  )
  const settled = {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '前半后半' }] }, usage: null },
  }
  assert.deepEqual(translateSessionEvent(settled, state), [{ type: 'delta', text: '后半' }])
  assert.equal(state.text, '前半后半')
})

test('end 帧与无关帧不产出事件', () => {
  const state = createTurnState()
  assert.deepEqual(
    translateStreamFrame({ type: 'end', attemptId: 'a7', revision: 1, index: 3, outcome: { kind: 'abandoned' } }, state),
    [],
  )
  assert.deepEqual(translateStreamFrame(null, state), [])
  assert.deepEqual(translateStreamFrame({ type: 'chunk' }, state), [], '没有 chunk 载荷直接丢')
})

test('流式内容与最终文本对不上时不补发全量，避免面板出现两份', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'a8', revision: 1, turn: 1, step: 1 }, state)
  translateStreamFrame(
    { type: 'chunk', attemptId: 'a8', revision: 1, index: 0, chunk: { type: 'text-delta', index: 0, text: '甲' } },
    state,
  )
  const settled = {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '乙丙' }] }, usage: null },
  }
  assert.deepEqual(translateSessionEvent(settled, state), [], '不是前缀就别补，补了就是两份')
  assert.equal(state.text, '甲', '已经流出去的那份保持原样')
})

test('推理已经流式发出后，落定不再补一遍整段思考', () => {
  const state = createTurnState()
  translateStreamFrame({ type: 'start', attemptId: 'r1', revision: 1, turn: 1, step: 1 }, state)
  translateStreamFrame(
    { type: 'chunk', attemptId: 'r1', revision: 1, index: 0, chunk: { type: 'reasoning-delta', index: 0, text: '想了很久' } },
    state,
  )
  translateStreamFrame({ type: 'start', attemptId: 'r1', revision: 2, turn: 1, step: 1 }, state)
  assert.equal(state.streamedReasoning, '', 'start 会清 streamed 计数')
  const settled = {
    type: 'assistant/message',
    data: {
      message: {
        content: [
          { type: 'reasoning', text: '想了很久' },
          { type: 'text', text: '答案' },
        ],
      },
      usage: null,
    },
  }
  assert.deepEqual(translateSessionEvent(settled, state), [{ type: 'delta', text: '答案' }], '推理不能重发')
  assert.equal(state.reasoningStreamed, false, '落定后复位，下一个 step 还能用')
})

test('完全没有流式时，推理仍然靠落定补一次', () => {
  const state = createTurnState()
  const settled = {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '思考' }, { type: 'text', text: '正文' }] }, usage: null },
  }
  assert.deepEqual(translateSessionEvent(settled, state), [
    { type: 'reasoning', text: '思考', step: 0 },
    { type: 'delta', text: '正文' },
  ])
})
