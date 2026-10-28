import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-mapus-bridge-'))

const { createBridge } = await import('../lib/bridge.js')
const { resolveConfig } = await import('../lib/config.js')
const { toSessionId } = await import('../lib/agent.js')
const { Turn } = await import('../lib/turn.js')

function stubPool({ script } = {}) {
  const pool = {
    ctx: { agents: { get: () => null } },
    turns: new Map(),
    calls: [],
    async runTurn({ sessionId, prompt, context, write }) {
      const turn = new Turn({ id: 't1', sessionId, write, rpcTimeoutMs: 3000 })
      pool.turns.set(sessionId, turn)
      pool.calls.push({ sessionId, prompt, context })
      turn.emit({ type: 'start' })
      turn.emit({ type: 'step', index: 1, total: 10, used: 0 })
      const value = await turn.rpc('page_context', { tabId: 1 })
      turn.emit({ type: 'delta', text: `现场：${JSON.stringify(value)}` })
      turn.emit({ type: 'done', answer: 'ok' })
      turn.end()
      pool.turns.delete(sessionId)
      return { turn }
    },
    cancel() {
      return { ok: true, cancelled: true }
    },
  }
  if (script) pool.runTurn = script(pool)
  return pool
}

async function harness(pool) {
  const config = resolveConfig({ port: 0, token: 'test-token' })
  const bridge = createBridge({ pool, config, log: () => {} })
  const { url } = await bridge.start()
  return {
    base: url,
    bridge,
    token: 'test-token',
    close: () => bridge.stop(),
  }
}

test('健康检查不需要 token，其余路由强制 token', async () => {
  const { base, close } = await harness(stubPool())
  try {
    const health = await fetch(`${base}/v1/health`)
    assert.equal(health.status, 200)
    const body = await health.json()
    assert.equal(body.ok, true)
    assert.equal(body.authRequired, true)

    const denied = await fetch(`${base}/v1/catalog`)
    assert.equal(denied.status, 401)

    const wrong = await fetch(`${base}/v1/catalog`, { headers: { authorization: 'Bearer nope' } })
    assert.equal(wrong.status, 401)

    const ok = await fetch(`${base}/v1/catalog`, { headers: { 'x-mapus-token': 'test-token' } })
    assert.equal(ok.status, 200)
    const catalog = await ok.json()
    assert.ok(catalog.tools.length > 10)
    assert.equal(catalog.passthrough, 'mapus_tool')
  } finally {
    await close()
  }
})

test('OPTIONS 预检返回 CORS 头', async () => {
  const { base, close } = await harness(stubPool())
  try {
    const preflight = await fetch(`${base}/v1/turn`, { method: 'OPTIONS' })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
    assert.match(preflight.headers.get('access-control-allow-headers'), /x-mapus-token/)
  } finally {
    await close()
  }
})

test('一轮对话：NDJSON 事件流 + 工具 RPC 往返', async () => {
  const pool = stubPool()
  const { base, close, token } = await harness(pool)
  try {
    const response = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({ prompt: '看看这个站', conversation: 'conv-1', context: { url: 'https://a.test' } }),
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /application\/x-ndjson/)

    const events = []
    let settled = false
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!raw) continue
        const event = JSON.parse(raw)
        events.push(event)
        if (event.type === 'rpc' && !settled) {
          settled = true
          const reply = await fetch(`${base}/v1/rpc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-mapus-token': token },
            body: JSON.stringify({ conversation: 'conv-1', id: event.id, ok: true, result: { title: 'A', total: 3 } }),
          })
          assert.equal(reply.status, 200)
        }
      }
    }

    const types = events.map(event => event.type)
    assert.deepEqual(types, ['hello', 'start', 'step', 'rpc', 'delta', 'done'])
    assert.equal(events[0].sessionId, toSessionId('mapus', 'conv-1'))
    const rpc = events.find(event => event.type === 'rpc')
    assert.equal(rpc.tool, 'page_context')
    assert.deepEqual(rpc.args, { tabId: 1 })
    assert.match(events.find(event => event.type === 'delta').text, /A/)
    assert.equal(pool.calls[0].prompt, '看看这个站')
    assert.deepEqual(pool.calls[0].context, { url: 'https://a.test' })
  } finally {
    await close()
  }
})

test('空 prompt 直接 400，不占用会话', async () => {
  const { base, close, token } = await harness(stubPool())
  try {
    const response = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({ prompt: '   ' }),
    })
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.match(body.error, /prompt/)
  } finally {
    await close()
  }
})

test('迟到的 rpc 结果不会打错会话：没有对应对话就 409', async () => {
  const { base, close, token } = await harness(stubPool())
  try {
    const response = await fetch(`${base}/v1/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({ conversation: 'ghost', id: 'rpc1', ok: true, result: {} }),
    })
    assert.equal(response.status, 409)
  } finally {
    await close()
  }
})

test('cancel 路由转给会话池', async () => {
  const { base, close, token } = await harness(stubPool())
  try {
    const response = await fetch(`${base}/v1/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({ conversation: 'conv-9' }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).cancelled, true)
  } finally {
    await close()
  }
})

test('未知路由 404', async () => {
  const { base, close, token } = await harness(stubPool())
  try {
    const response = await fetch(`${base}/v1/nope`, { headers: { 'x-mapus-token': token } })
    assert.equal(response.status, 404)
  } finally {
    await close()
  }
})

test('/v1/models 汇总提供方与模型，provider 空值不混进清单', async () => {
  const pool = stubPool()
  pool.ctx = {
    agents: { get: () => null },
    get: name => (name === 'llm'
      ? {
        listConfigurableProviders: () => [
          { provider: 'deepseek-official', displayName: 'DeepSeek' },
          { provider: 'dead-route', displayName: '' },
          { provider: '', displayName: 'empty' },
        ],
        listModels: async id => (id === 'deepseek-official'
          ? [{ id: 'deepseek-v4-flash', name: 'V4 Flash' }]
          : []),
      }
      : null),
  }
  const { base, close, token } = await harness(pool)
  try {
    const response = await fetch(`${base}/v1/models`, { headers: { 'x-mapus-token': token } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.deepEqual(body.providers.map(item => item.id), ['deepseek-official', 'dead-route'])
    assert.deepEqual(body.providers[0].models, [{ id: 'deepseek-v4-flash', name: 'V4 Flash' }])
    assert.deepEqual(body.providers[1].models, [])
    assert.equal(body.providers[1].name, 'dead-route')
  } finally {
    await close()
  }
})

test('/v1/models 在没有 llm 服务时说清楚，而不是报错', async () => {
  const { base, close, token } = await harness(stubPool())
  try {
    const response = await fetch(`${base}/v1/models`, { headers: { 'x-mapus-token': token } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.providers, [])
    assert.match(body.note, /llm/)
  } finally {
    await close()
  }
})

test('turn 把面板指定的 provider / model 原样转给会话池', async () => {
  let seen = null
  const pool = stubPool({
    script: () => async ({ sessionId, prompt, write, route }) => {
      seen = route
      const turn = new Turn({ id: 't2', sessionId, write, rpcTimeoutMs: 3000 })
      pool.turns.set(sessionId, turn)
      turn.emit({ type: 'start' })
      turn.emit({ type: 'done', answer: 'ok' })
      turn.end()
      pool.turns.delete(sessionId)
      return { turn }
    },
  })
  const { base, close, token } = await harness(pool)
  try {
    const response = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({
        prompt: '看看这个站',
        conversation: 'conv-model',
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      }),
    })
    assert.equal(response.status, 200)
    await response.text()
    assert.deepEqual(seen, { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: '' })
  } finally {
    await close()
  }
})

test('没指定 provider / model 时 route 是空串，交给会话池回落默认', async () => {
  let seen = null
  const pool = stubPool({
    script: () => async ({ sessionId, write, route }) => {
      seen = route
      const turn = new Turn({ id: 't3', sessionId, write, rpcTimeoutMs: 3000 })
      pool.turns.set(sessionId, turn)
      turn.emit({ type: 'start' })
      turn.emit({ type: 'done', answer: 'ok' })
      turn.end()
      pool.turns.delete(sessionId)
      return { turn }
    },
  })
  const { base, close, token } = await harness(pool)
  try {
    const response = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapus-token': token },
      body: JSON.stringify({ prompt: '嗨', conversation: 'conv-plain' }),
    })
    assert.equal(response.status, 200)
    await response.text()
    assert.deepEqual(seen, { provider: '', model: '', reasoningEffort: '' })
  } finally {
    await close()
  }
})
