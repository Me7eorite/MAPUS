
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

globalThis.self = globalThis

function installChrome({ config, tab = { id: 1, url: 'https://target.test/admin', title: '后台' } } = {}) {
  const store = { mapus_agent: config }
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: store[key] }
          const out = {}
          for (const item of key || []) out[item] = store[item]
          return out
        },
        async set(patch) {
          Object.assign(store, patch)
        }
      }
    },
    tabs: {
      async get() {
        return tab
      },
      async query() {
        return [tab]
      }
    }
  }
  return store
}

async function startFakeBridge({ token = 'tok', failAuth = false, answer = '这是 Harness 的结论' } = {}) {
  const received = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/v1/health') {
      const body = JSON.stringify({ ok: true, name: 'dsh-mapus', authRequired: true, uptimeMs: 1234 })
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      res.end(body)
      return
    }
    if (url.pathname === '/v1/catalog') {
      if (failAuth || req.headers['x-mapus-token'] !== token) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'bad token' }))
        return
      }
      const body = JSON.stringify({ ok: true, tools: [{ name: 'mapus_page_context' }], passthrough: 'mapus_tool' })
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
      res.end(body)
      return
    }
    if (url.pathname === '/v1/cancel') {
      received.push({ kind: 'cancel', body: await readBody(req) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, cancelled: true }))
      return
    }
    if (url.pathname === '/v1/rpc') {
      received.push({ kind: 'rpc', body: await readBody(req) })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (url.pathname === '/v1/turn') {
      if (req.headers['x-mapus-token'] !== token) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'bad token' }))
        return
      }
      const body = await readBody(req)
      received.push({ kind: 'turn', body })
      res.writeHead(200, { 'content-type': 'application/x-ndjson' })
      const send = payload => res.write(JSON.stringify(payload) + '\n')
      send({ type: 'hello', protocol: 1, sessionId: 'mapus-x' })
      send({ type: 'start' })
      send({ type: 'step', index: 1, total: 40, used: 0 })
      send({ type: 'reasoning', text: '先看现场', step: 1 })
      send({ type: 'rpc', id: 'rpc1', tool: 'page_context', args: { tabId: 1 } })
      const deadline = Date.now() + 2000
      while (Date.now() < deadline) {
        const settled = received.find(item => item.kind === 'rpc' && item.body && item.body.id === 'rpc1')
        if (settled) break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      send({ type: 'delta', text: answer })
      send({ type: 'done', answer })
      res.end()
      return
    }
    res.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    base: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise(resolve => server.close(resolve))
  }
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({ raw })
      }
    })
  })
}

const calls = []

await import('../background/core/dsh-core.js')

function core() {
  return globalThis.MAPUS_DSH
}

test('一轮对话：事件翻译 + 工具 rpc 往返', async () => {
  const bridge = await startFakeBridge({ answer: 'Harness 结论：存在未授权接口' })
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'tok' } })
  globalThis.MAPUS_AGENT = {
    buildContext: async () => ({ url: 'https://target.test/admin', title: '后台' }),
    runTool: async (name, args) => {
      calls.push({ name, args })
      return { ok: true, title: '后台', total: 7 }
    }
  }
  const dshCore = core()
  try {
    const events = []
    const result = await dshCore.run({
      tabId: 1,
      messages: [{ role: 'user', content: '看看这个站' }],
      emit: event => events.push(event)
    })

    const types = events.map(event => event.type)
    assert.deepEqual(types, ['step', 'reasoning', 'tool', 'tool_result', 'delta'])
    assert.equal(events[2].name, 'page_context')
    assert.equal(events[2].args.tabId, 1)
    assert.equal(events[3].ok, true)
    assert.match(events[3].preview, /后台/)
    assert.match(result.answer, /未授权接口/)
    assert.equal(result.budget, 40)

    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'page_context')
    const settle = bridge.received.find(item => item.kind === 'rpc')
    assert.ok(settle, '扩展必须把工具结果回传给桥')
    assert.equal(settle.body.id, 'rpc1')
    assert.equal(settle.body.ok, true)
    assert.deepEqual(settle.body.result, { ok: true, title: '后台', total: 7 })

    const turn = bridge.received.find(item => item.kind === 'turn')
    assert.equal(turn.body.prompt, '看看这个站')
    assert.deepEqual(turn.body.context, { url: 'https://target.test/admin', title: '后台' })
    assert.match(turn.body.conversation, /target\.test/)
  } finally {
    await bridge.close()
  }
})

test('历史消息只带在此之前的部分，最后一条用户消息作为 prompt', async () => {
  const bridge = await startFakeBridge()
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'tok' } })
  globalThis.MAPUS_AGENT = { buildContext: async () => null, runTool: async () => ({ ok: true }) }
  const dshCore = core()
  try {
    await dshCore.run({
      tabId: 1,
      messages: [
        { role: 'user', content: '第一句' },
        { role: 'assistant', content: '第一答' },
        { role: 'user', content: '第二句' }
      ],
      emit: () => {}
    })
    const turn = bridge.received.find(item => item.kind === 'turn')
    assert.equal(turn.body.prompt, '第二句')
    assert.deepEqual(turn.body.history, [
      { role: 'user', content: '第一句' },
      { role: 'assistant', content: '第一答' }
    ])
  } finally {
    await bridge.close()
  }
})

test('显式 sessionId 优先作为会话归属', async () => {
  const bridge = await startFakeBridge()
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'tok' } })
  globalThis.MAPUS_AGENT = { buildContext: async () => null, runTool: async () => ({ ok: true }) }
  const dshCore = core()
  try {
    await dshCore.run({
      tabId: 1,
      sessionId: 'sess-abc',
      messages: [{ role: 'user', content: 'hi' }],
      emit: () => {}
    })
    assert.equal(bridge.received.find(item => item.kind === 'turn').body.conversation, 'sess-abc')
  } finally {
    await bridge.close()
  }
})

test('Token 不对时给出可操作的错误，而不是静默失败', async () => {
  const bridge = await startFakeBridge({ token: 'right' })
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'wrong' } })
  globalThis.MAPUS_AGENT = { buildContext: async () => null, runTool: async () => ({ ok: true }) }
  const dshCore = core()
  try {
    await assert.rejects(
      () => dshCore.run({ tabId: 1, messages: [{ role: 'user', content: 'hi' }], emit: () => {} }),
      /Token 不对/
    )
  } finally {
    await bridge.close()
  }
})

test('桥没起来时提示去检查 dsh 是否加载了插件', async () => {
  installChrome({ config: { backend: 'dsh', dshUrl: 'http://127.0.0.1:9', dshToken: 'tok' } })
  globalThis.MAPUS_AGENT = { buildContext: async () => null, runTool: async () => ({ ok: true }) }
  const dshCore = core()
  await assert.rejects(
    () => dshCore.run({ tabId: 1, messages: [{ role: 'user', content: 'hi' }], emit: () => {} }),
    /连不上 DeepSeek Harness 桥/
  )
})

test('主动中止会上报 cancel 并抛 AbortError', async () => {
  const bridge = await startFakeBridge()
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'tok' } })
  globalThis.MAPUS_AGENT = {
    buildContext: async () => null,
    runTool: () => new Promise(() => {})
  }
  const dshCore = core()
  try {
    const controller = new AbortController()
    const running = dshCore.run({
      tabId: 1,
      messages: [{ role: 'user', content: 'hi' }],
      emit: () => {},
      signal: controller.signal
    })
    await new Promise(resolve => setTimeout(resolve, 120))
    controller.abort()
    await assert.rejects(() => running, error => error.name === 'AbortError')
    const deadline = Date.now() + 500
    while (Date.now() < deadline && !bridge.received.some(item => item.kind === 'cancel')) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(bridge.received.some(item => item.kind === 'cancel'), '中止后应通知桥停掉这一轮')
  } finally {
    await bridge.close()
  }
})

test('连通性测试能分辨健康检查、Token 与工具数量', async () => {
  const bridge = await startFakeBridge({ token: 'tok' })
  installChrome({ config: { backend: 'dsh', dshUrl: bridge.base, dshToken: 'tok' } })
  const dshCore = core()
  try {
    const ok = await dshCore.testConnection(null)
    assert.equal(ok.ok, true)
    assert.equal(ok.tools, 1)

    const bad = await dshCore.testConnection({ dshToken: 'nope' })
    assert.equal(bad.ok, false)
    assert.match(bad.error, /Token/)
  } finally {
    await bridge.close()
  }
})
