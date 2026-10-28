import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-mapus-agent-'))

const { AgentPool, RESUME_RETRIES, toSessionId, renderContext, renderHistory, settleWithin } = await import('../lib/agent.js')
const { resolveConfig, stateDir } = await import('../lib/config.js')
const { createTurnState } = await import('../lib/translate.js')

function quarantineRoot() {
  const root = join(stateDir(), 'quarantine')
  mkdirSync(root, { recursive: true })
  return root
}

function fakeContext({ existing = null, failResume = true, defaultModel = null, resumeImpl = null, createImpl = null } = {}) {
  const listeners = new Map()
  const live = new Map()
  const calls = []
  if (existing) live.set(existing.id, existing)
  const agents = {
    get: id => live.get(id) || undefined,
    create: async options => {
      calls.push({ kind: 'create', options })
      if (createImpl) return await createImpl(options, live, calls)
      const agent = makeAgent(options.sessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
    resume: async options => {
      calls.push({ kind: 'resume', options })
      if (resumeImpl) return await resumeImpl(options, live, calls)
      if (failResume) throw new Error('session not found')
      const agent = makeAgent(options.resumeSessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  }
  const ctx = {
    agents,
    calls,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
      return () => {
        const list = listeners.get(event) || []
        const index = list.indexOf(handler)
        if (index >= 0) list.splice(index, 1)
      }
    },
    get: name => (name === 'agentDefaultModel' && defaultModel ? defaultModel : undefined),
    effect: execute => {
      const dispose = execute()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register: () => () => {} },
    emit(event, ...args) {
      for (const handler of listeners.get(event) || []) handler(...args)
    },
    live,
  }
  return ctx
}

function makeAgent(id, ctx, script = {}) {
  const text = script.text === undefined ? '这是答案' : script.text
  const reason = script.reason === undefined ? 'completed' : script.reason
  const agent = {
    id,
    options: {},
    session: {
      id,
      events: [],
      get seq() { return agent.session.events.length },
      append(type, data) { agent.session.events.push({ type, data }) },
      eventAt: index => agent.session.events[index],
    },
    injected: [],
    followed: [],
    cancelled: [],
    followup(message) {
      agent.followed.push(message)
      const session = agent.session
      if (script.withStep !== false) ctx.emit('session/event', session, { type: 'step/start', data: { turn: 1, step: 1 } })
      if (script.hang) return
      if (text) ctx.emit('session/event', session, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text } } })
      ctx.emit('session/event', session, { type: 'turn/end', data: { reason } })
    },
    inject(message) {
      agent.injected.push(message)
    },
    async whenIdle() {
      if (script.hang) await new Promise(() => {})
    },
    cancel(cause) {
      agent.cancelled.push(cause)
    },
  }
  return agent
}

test('toSessionId 稳定、可读、带摘要在前缀之后', () => {
  const a = toSessionId('mapus', 'site:example.com/conv-1')
  const b = toSessionId('mapus', 'site:example.com/conv-1')
  assert.equal(a, b)
  assert.match(a, /^mapus-site-example-com-conv-1-[0-9a-f]{8}$/)
  assert.notEqual(a, toSessionId('mapus', 'site:example.com/conv-2'))
  assert.match(toSessionId('mapus', ''), /^mapus-default-[0-9a-f]{8}$/)
})

test('renderContext 只渲染拿到的字段，空对象不产出提示', () => {
  assert.equal(renderContext(null), '')
  assert.equal(renderContext({}), '')
  const text = renderContext({
    title: '后台',
    url: 'https://a.test/admin',
    total: 12,
    progress: 100,
    fingerprints: [{ name: 'Nginx' }, { name: 'Vue' }],
    anti: { isEnabled: true, blocks: 3 },
    hooks: { enabled: ['Bypass_Debugger'] },
  })
  assert.match(text, /Title: 后台/)
  assert.match(text, /Browser fingerprints: Nginx, Vue/)
  assert.match(text, /Privacy protection: on, 3 blocked on this site/)
  assert.match(text, /Scripts: enabled Bypass_Debugger/)
  assert.match(text, /Scanned: 12 items/)
})

test('renderHistory 跳过空消息，超长内容截断', () => {
  assert.equal(renderHistory([]), '')
  assert.equal(renderHistory([{ role: 'user', content: '   ' }]), '')
  const text = renderHistory([
    { role: 'user', content: '扫一下这个站' },
    { role: 'assistant', content: 'a'.repeat(3000) },
  ])
  assert.match(text, /User: 扫一下这个站/)
  assert.match(text, /Assistant: a{1200}$/m)
})

test('冷会话：历史与现场都以注入形式进入，用户消息走 followup', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  ctx.on('session/event', (session, event) => pool.onSessionEvent(session, event))
  const written = []
  const { state } = await pool.runTurn({
    sessionId: 'mapus-x',
    prompt: '看看这个站',
    context: { url: 'https://a.test', title: 'A' },
    history: [{ role: 'user', content: '早先的对话' }, { role: 'assistant', content: '好' }],
    write: payload => {
      written.push(payload)
      return true
    },
  })
  const agent = ctx.live.get('mapus-x')
  assert.equal(agent.injected.length, 2)
  assert.equal(agent.injected[0].source.form, 'recall')
  assert.equal(agent.injected[1].source.form, 'snapshot')
  assert.equal(agent.injected[0].source.kind, 'plugin:dsh-mapus')
  assert.equal(agent.injected[1].source.kind, 'plugin:dsh-mapus')
  assert.equal(agent.injected[0].source.plugin, undefined)
  assert.equal(agent.injected[1].source.sections.length, 1)
  assert.equal(agent.injected[1].source.sections[0].name, 'mapus-page')
  assert.equal(agent.injected[1].source.sections[0].text, agent.injected[1].content[0].text)
  assert.equal(agent.followed.length, 1)
  assert.equal(agent.followed[0].content[0].text, '看看这个站')
  assert.equal(agent.followed[0].source.kind, 'user')
  assert.equal(state.text, '这是答案')
  const types = written.map(item => item.type)
  assert.deepEqual(types, ['start', 'step', 'delta', 'done'])
})

test('暖会话：不再重放历史', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const warm = makeAgent('mapus-warm', ctx)
  warm.session.events = [{ type: 'turn/start' }]
  ctx.live.set('mapus-warm', warm)
  await pool.runTurn({
    sessionId: 'mapus-warm',
    prompt: '继续',
    context: null,
    history: [{ role: 'user', content: '旧对话' }],
    write: () => true,
  })
  assert.equal(warm.injected.length, 0, '已有事件的会话不应再注入历史')
})

test('模型请求失败：收口为 error 事件而不是抛给 HTTP 层', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const events = []
  const original = ctx.agents.create
  ctx.agents.create = async options => {
    const handle = await original(options)
    handle.agent.followup = () => {
      throw new Error('model 401')
    }
    return handle
  }
  await pool.runTurn({ sessionId: 'mapus-boom', prompt: 'hi', write: payload => (events.push(payload), true) })
  const last = events[events.length - 1]
  assert.equal(last.type, 'error')
  assert.equal(last.message, 'model 401')
})

test('没有进行中的对话时，工具调用被明确拒绝', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await assert.rejects(() => pool.callTool('mapus-none', 'page_context', {}), /no conversation in progress/)
})

test('catalog 工具不需要面板即可返回能力清单', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const catalog = await pool.callTool('mapus-none', 'mapus_catalog', {})
  assert.ok(Array.isArray(catalog.tools))
  assert.ok(catalog.tools.some(tool => tool.call === 'browser_click'))
  assert.match(catalog.note, /mapus_tool/)
})

test('cancel 同时中止会话与未完成的工具调用', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const warm = makeAgent('mapus-cancel', ctx)
  ctx.live.set('mapus-cancel', warm)
  warm.followup = () => {}
  const running = pool.runTurn({
    sessionId: 'mapus-cancel',
    prompt: '长任务',
    write: () => true,
  })
  await new Promise(resolve => setTimeout(resolve, 5))
  const result = pool.cancel('mapus-cancel')
  assert.deepEqual(result, { ok: true, cancelled: true })
  assert.equal(warm.cancelled[0].kind, 'user')
  await running
  assert.equal(pool.turns.has('mapus-cancel'), false)
})

test('没指定模型时读 dsh 自己的默认选择，并给会话补上 cwd', async () => {
  const ctx = fakeContext({
    defaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await pool.ensureAgent('mapus-default')

  const created = ctx.calls.find(call => call.kind === 'create')
  assert.ok(created, '应该走 create')
  assert.deepEqual(created.options.agentOptions.provider, 'deepseek-official')
  assert.deepEqual(created.options.agentOptions.model, 'deepseek-v4-flash')
  assert.equal(created.options.meta.cwd, process.cwd())
})

test('面板指定的模型优先于 dsh 默认', async () => {
  const ctx = fakeContext({
    defaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await pool.ensureAgent('mapus-override', { provider: 'deepseek', model: 'deepseek-v4-pro' })

  const created = ctx.calls.find(call => call.kind === 'create')
  assert.equal(created.options.agentOptions.provider, 'deepseek')
  assert.equal(created.options.agentOptions.model, 'deepseek-v4-pro')
})

test('换模型会释放旧 agent 并重建，同一模型则复用', async () => {
  const ctx = fakeContext({
    defaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })

  const first = await pool.ensureAgent('mapus-switch')
  const again = await pool.ensureAgent('mapus-switch')
  assert.equal(first, again, '模型没变应复用同一个 agent')
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 1)

  const second = await pool.ensureAgent('mapus-switch', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
  assert.notEqual(second, first, '模型变了必须重建')
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 2)
  assert.equal(ctx.calls.at(-1).options.agentOptions.model, 'deepseek-v4-pro')
})

test('dsh 没有默认模型服务时不会抛错，交给上层暴露', async () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await pool.ensureAgent('mapus-nodefault')
  const created = ctx.calls.find(call => call.kind === 'create')
  assert.ok(created)
  assert.equal(created.options.agentOptions.provider, undefined)
  assert.equal(created.options.agentOptions.model, undefined)
})

test('resume 因 not-found 之外的原因失败时直接抛出，不再落到 create', async () => {
  const ctx = fakeContext({
    resumeImpl: () => { throw new Error('session format is not supported') },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await assert.rejects(
    () => pool.ensureAgent('mapus-masked'),
    /failed to resume the session: session format is not supported/,
  )
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 0, '不能再去 create 掩盖原因')
})

test('写句柄被占用时重试 resume，用尽后仍报原始原因', async () => {
  let attempts = 0
  const ctx = fakeContext({
    resumeImpl: options => {
      attempts += 1
      throw new Error(`session "${options.resumeSessionId}" is already owned by an active write handle`)
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await assert.rejects(
    () => pool.ensureAgent('mapus-busy'),
    /failed to resume the session: session "mapus-busy" is already owned by an active write handle/,
  )
  assert.equal(attempts, RESUME_RETRIES + 1, '首次 + 全部重试')
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 0, '绝不能退化成 create')
})

test('create 撞到 already exists 时认领注册表里已有的 agent，不再报错', async () => {
  let ctx
  ctx = fakeContext({
    resumeImpl: () => { throw new Error('session not found') },
    createImpl: (options, live) => {
      const agent = makeAgent(options.sessionId, ctx)
      live.set(agent.id, agent)
      throw new Error(`session "${options.sessionId}" already exists`)
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const agent = await pool.ensureAgent('mapus-adopt')
  assert.equal(agent.id, 'mapus-adopt', '应该直接复用那个 agent')
})

test('create 撞到 already exists 但注册表是空的，重试 resume 直到句柄放开', async () => {
  let ctx
  let built = false
  let resumedAfterCreate = 0
  ctx = fakeContext({
    resumeImpl: (options, live) => {
      if (!built) throw new Error('session not found')
      resumedAfterCreate += 1
      if (resumedAfterCreate <= 2) {
        throw new Error(`session "${options.resumeSessionId}" is already owned by an active write handle`)
      }
      const agent = makeAgent(options.resumeSessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
    createImpl: options => {
      built = true
      throw new Error(`session "${options.sessionId}" already exists`)
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const agent = await pool.ensureAgent('mapus-race')
  assert.equal(agent.id, 'mapus-race')
  assert.equal(resumedAfterCreate, 3, '前两次被写句柄挡住，第三次成功')
})

test('already exists 且句柄始终拿不到时，错误里写清会话 id 与当前 cwd', async () => {
  const ctx = fakeContext({
    resumeImpl: () => { throw new Error('session not found') },
    createImpl: options => { throw new Error(`session "${options.sessionId}" already exists`) },
  })
  const pool = new AgentPool({
    ctx,
    config: resolveConfig({ cwd: '/tmp/mapus-cwd-probe' }),
    log: () => {},
    waitBeforeRetry: () => 0,
  })
  await assert.rejects(
    () => pool.ensureAgent('mapus-stuck'),
    error => {
      assert.match(error.message, /mapus-stuck/)
      assert.match(error.message, /is registered in the harness session table/)
      assert.match(error.message, /cwd=\/tmp\/mapus-cwd-probe/)
      return true
    },
  )
})

test('热重载换出来的第二个 pool 不会把同一个会话炸掉', async () => {
  let creates = 0
  let ctx
  ctx = fakeContext({
    resumeImpl: () => { throw new Error('session not found') },
    createImpl: async (options, live) => {
      creates += 1
      await new Promise(resolve => setTimeout(resolve, 5))
      if (creates > 1) throw new Error(`session "${options.sessionId}" already exists`)
      const agent = makeAgent(options.sessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  })
  const first = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const second = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const [a, b] = await Promise.all([first.ensureAgent('mapus-hot'), second.ensureAgent('mapus-hot')])
  assert.equal(creates, 1, '同一个会话只该被 create 一次')
  assert.equal(a.id, 'mapus-hot')
  assert.equal(b.id, 'mapus-hot')
})

test('写句柄短暂占用后放开，这一轮照常开始', async () => {
  let ctx
  let attempts = 0
  ctx = fakeContext({
    resumeImpl: (options, live) => {
      attempts += 1
      if (attempts < 3) throw new Error('session "mapus-late" is already owned by an active write handle')
      const agent = makeAgent(options.resumeSessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const agent = await pool.ensureAgent('mapus-late')
  assert.equal(agent.id, 'mapus-late')
  assert.equal(attempts, 3)
})

test('create 撞上 already exists 时回退到 resume', async () => {
  let resumed = 0
  let ctx
  ctx = fakeContext({
    resumeImpl: (options, live) => {
      resumed += 1
      if (resumed === 1) throw new Error(`session "${options.resumeSessionId}" not found`)
      const agent = makeAgent(options.resumeSessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
    createImpl: () => { throw new Error('session "mapus-race" already exists') },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const agent = await pool.ensureAgent('mapus-race')
  assert.equal(agent.id, 'mapus-race')
  assert.equal(resumed, 2, '第二次 resume 才拿到 agent')
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 1)
})

test('同一会话并发打开只走一次 resume，不会抢句柄', async () => {
  let ctx
  let opens = 0
  let inFlight = 0
  let maxInFlight = 0
  ctx = fakeContext({
    resumeImpl: async (options, live) => {
      opens += 1
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 20))
      inFlight -= 1
      const agent = makeAgent(options.resumeSessionId, ctx)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const [a, b] = await Promise.all([pool.ensureAgent('mapus-par'), pool.ensureAgent('mapus-par')])
  assert.equal(a, b, '两次调用拿到同一个 agent')
  assert.equal(maxInFlight, 1, '打开过程被串行化')
  assert.equal(opens, 1, '第二次直接复用注册表里的 agent')
})

test('同一会话第二轮接管第一轮，旧轮收尾不删新轮的 state', async () => {
  let ctx
  let opens = 0
  ctx = fakeContext({
    resumeImpl: (options, live) => {
      opens += 1
      const agent = makeAgent(options.resumeSessionId, ctx, { hang: opens === 1 })
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  ctx.on('session/event', (session, event) => pool.onSessionEvent(session, event))

  const first = pool.runTurn({ sessionId: 'mapus-take', prompt: '一', write: () => true })
  await new Promise(resolve => setImmediate(resolve))
  const firstTurn = pool.turns.get('mapus-take')
  assert.ok(firstTurn && firstTurn.live, '第一轮应该还活着')

  const second = pool.runTurn({ sessionId: 'mapus-take', prompt: '二', write: () => true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(firstTurn.live, false, '第一轮应被终止')

  const secondState = pool.states.get('mapus-take')
  await first
  assert.equal(pool.states.get('mapus-take'), secondState, '第一轮收尾不能清掉第二轮的状态')

  pool.cancel('mapus-take')
  await second
})

test('日志被迁移链拒绝时隔离旧目录并重建会话', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-mapus-corrupt-'))
  const logPath = join(dir, 'session.jsonl.zstd')
  writeFileSync(logPath, 'not a real zstd frame')

  let ctx
  const reason = `@deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: `
    + `agent/inbox/spliced 3 inserted message source sections must be an array; `
    + `source v0 artifact remains unchanged (raw log: ${logPath})`
  ctx = fakeContext({
    resumeImpl: () => { throw new Error(reason) },
  })
  const logs = []
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: message => logs.push(message), waitBeforeRetry: () => 0 })

  const agent = await pool.ensureAgent('mapus-poisoned')
  assert.equal(agent.id, 'mapus-poisoned')
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 1, '应该重建而不是失败')
  assert.equal(existsSync(dir), false, '旧目录必须被挪走')
  const moved = () => readdirSync(quarantineRoot()).filter(name => name.startsWith('mapus-poisoned-'))
  assert.equal(moved().length, 1, '旧日志要留在 quarantine 里')
  assert.ok(logs.some(line => /quarantined and rebuilt/.test(line)))

  await pool.ensureAgent('mapus-poisoned')
  assert.equal(moved().length, 1)
})

test('迁移拒绝但拿不到日志路径时不冒险删，直接报原因', async () => {
  const ctx = fakeContext({
    resumeImpl: () => { throw new Error('session format refuses this artifact') },
  })
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  await assert.rejects(() => pool.ensureAgent('mapus-nopath'), /failed to resume the session: session format refuses/)
  assert.equal(ctx.calls.filter(call => call.kind === 'create').length, 0)
})

function presetRig({
  register = null,
  mount = null,
  timeoutMs = 5_000,
  sandbox = null,
  probeSeatbelt = null,
  config: overrides = {},
} = {}) {
  const events = []
  const agentCtx = { get: () => undefined, tools: { register: () => {} } }
  const presets = {
    async register(definition) {
      events.push({ what: 'register', definition })
      if (register) return await register(definition, events)
      return () => events.push({ what: 'dispose' })
    },
    async mount(target, id) {
      events.push({ what: 'mount', id, target })
      if (mount) return await mount(target, id, events)
    },
  }
  const ctx = fakeContext({
    createImpl: async (options, live) => {
      const agent = makeAgent(options.sessionId, ctx, { text: '好的' })
      await options.setup(agentCtx, agent)
      live.set(agent.id, agent)
      return { agent, dispose: async () => live.delete(agent.id) }
    },
  })
  ctx.get = name => {
    if (name === 'agentPresets') return presets
    if (name === 'sandbox') return sandbox
    return undefined
  }
  const logs = []
  const config = resolveConfig({ provider: 'p', model: 'm', enableTools: false, ...overrides })
  const pool = new AgentPool({
    ctx,
    config,
    log: message => logs.push(message),
    hostToolsTimeoutMs: timeoutMs,
    probeSeatbelt: probeSeatbelt || (() => ({ ok: true })),
    waitBeforeRetry: () => 0,
  })
  return { ctx, events, logs, pool, agentCtx }
}

test('会话装配时注册并挂上 dsh 原生工具 preset', async () => {
  const { events, pool } = presetRig()
  await pool.ensureAgent('mapus-tools')

  const registered = events.filter(event => event.what === 'register')
  assert.equal(registered.length, 1, '一个进程只该注册一次')
  const definition = registered[0].definition
  assert.equal(definition.id, 'mapus-host')
  const rows = definition.plugins.map(row => row.name)
  assert.ok(rows.includes('@deepseek-ai/dsh-tool-bash'), '缺 shell')
  assert.ok(rows.includes('@deepseek-ai/dsh-tool-fs'), '缺文件读写')
  assert.ok(rows.includes('@deepseek-ai/dsh-tool-fs-search'), '缺搜索')
  const shellRows = definition.plugins.filter(row => /tool-(bash|pwsh)$/.test(row.name))
  assert.equal(shellRows.filter(row => row.disabled).length, 1)

  const mounted = events.filter(event => event.what === 'mount')
  assert.equal(mounted.length, 1)
  assert.equal(mounted[0].id, 'mapus-host')

  await pool.ensureAgent('mapus-tools-2')
  assert.equal(events.filter(event => event.what === 'register').length, 1)
  assert.equal(events.filter(event => event.what === 'mount').length, 2)
})

test('preset 注册失败不影响这一轮，只是没有原生工具', async () => {
  const { events, logs, pool } = presetRig({
    register: () => { throw new Error('loader is not ready') },
  })
  const agent = await pool.ensureAgent('mapus-nopreset')
  assert.equal(agent.id, 'mapus-nopreset')
  assert.equal(events.filter(event => event.what === 'mount').length, 0)
  assert.ok(logs.some(line => /failed to register the local-tool preset/.test(line)))
})

test('preset 已被上一次注册占用时照常挂载', async () => {
  const { events, pool } = presetRig({
    register: () => { throw new Error('Duplicate agent preset: mapus-host') },
  })
  await pool.ensureAgent('mapus-dup')
  const mounted = events.filter(event => event.what === 'mount')
  assert.equal(mounted.length, 1)
  assert.equal(mounted[0].id, 'mapus-host')
})

test('挂载失败只记一次日志，轮次照常开始', async () => {
  const { logs, pool } = presetRig({
    mount: () => { throw new Error('agent preset binding requires a scoped context') },
  })
  await pool.ensureAgent('mapus-nomount')
  await pool.ensureAgent('mapus-nomount-2')
  assert.equal(logs.filter(line => /no local execution this turn/.test(line)).length, 1, '同样的失败别每轮刷一遍')
})

test('settleWithin 把超时变成结果，而不是一直等下去', async () => {
  const hang = new Promise(() => {})
  const timeout = await settleWithin(hang, 5)
  assert.equal(timeout.ok, false)
  assert.equal(timeout.timeout, true)

  assert.deepEqual(await settleWithin(Promise.resolve('v'), 50), { ok: true, value: 'v' })
  const failure = await settleWithin(Promise.reject(new Error('nope')), 50)
  assert.equal(failure.ok, false)
  assert.equal(failure.error.message, 'nope')
  assert.equal((await settleWithin(new Promise(resolve => setTimeout(() => resolve(1), 1)), 1000)).value, 1)
})

test('注册挂住时不会拖死这一轮，只记一次超时', async () => {
  const { logs, pool } = presetRig({ register: () => new Promise(() => {}), timeoutMs: 20 })
  const agent = await pool.ensureAgent('mapus-hang')
  assert.equal(agent.id, 'mapus-hang')
  assert.ok(logs.some(line => /timed out registering the local-tool preset/.test(line)))
})

test('dispose 会注销自己注册的 preset', async () => {
  const { events, pool } = presetRig()
  await pool.ensureAgent('mapus-dispose')
  await pool.dispose()
  assert.equal(events.filter(event => event.what === 'dispose').length, 1)
})

test('默认把会话审批策略钉成 never，避免沙箱升级请求把整轮挂死', async () => {
  const { pool, ctx } = presetRig()
  await pool.ensureAgent('mapus-approval')
  const agent = ctx.live.get('mapus-approval')
  const policies = agent.session.events.filter(event => event.type === 'approval/policy')
  assert.equal(policies.length, 1)
  assert.deepEqual(policies[0].data, { policy: 'never' })
})

test('审批策略配成 ask 时不写策略，留给 harness 自己问', async () => {
  const { ctx } = presetRig()
  const pool = new AgentPool({
    ctx,
    config: resolveConfig({ provider: 'p', model: 'm', enableTools: false, enableHostTools: false, approvalPolicy: 'ask' }),
    log: () => {},
    waitBeforeRetry: () => 0,
  })
  await pool.ensureAgent('mapus-ask')
  const agent = ctx.live.get('mapus-ask')
  assert.equal(agent.session.events.filter(event => event.type === 'approval/policy').length, 0)
})

test('审批策略只在日志里没有时补一条，重复 resume 不再追加', async () => {
  const { pool, ctx } = presetRig()
  await pool.ensureAgent('mapus-approval-2')
  const agent = ctx.live.get('mapus-approval-2')
  ctx.live.delete('mapus-approval-2')
  const resumed = makeAgent('mapus-approval-2', ctx)
  resumed.session = agent.session
  ctx.live.set('mapus-approval-2', resumed)
  await pool.ensureAgent('mapus-approval-2')
  assert.equal(agent.session.events.filter(event => event.type === 'approval/policy').length, 1)
})

function fakeSandbox(failure = null) {
  const calls = []
  return {
    calls,
    confine: async (argv, policy) => {
      calls.push({ argv, policy })
      if (failure) throw failure
      return { argv, enforcement: 'full' }
    },
  }
}

function sandboxUnavailable() {
  const error = new Error('sandbox mode "workspace-write" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Runner failure: sandbox-exec: sandbox_apply: Operation not permitted')
  error.code = 'SANDBOX_UNAVAILABLE'
  return error
}

test('沙箱后端不可用时把会话钉到 danger-full-access，并只警告一次', async () => {
  let probes = 0
  const { pool, ctx, logs } = presetRig({
    probeSeatbelt: () => {
      probes += 1
      return { ok: false, detail: 'sandbox_apply: Operation not permitted' }
    },
  })
  await pool.ensureAgent('mapus-nosandbox')
  const agent = ctx.live.get('mapus-nosandbox')
  const modes = agent.session.events.filter(event => event.type === 'sandbox/mode')
  assert.equal(modes.length, 1)
  assert.deepEqual(modes[0].data, { mode: 'danger-full-access' })
  assert.equal(logs.filter(line => /no sandbox backend is available/.test(line)).length, 1)
  assert.equal(probes, 1)

  await pool.ensureAgent('mapus-nosandbox-2')
  assert.equal(probes, 1)
  assert.equal(logs.filter(line => /no sandbox backend is available/.test(line)).length, 1)
})

test('沙箱可用时不写 sandbox/mode，让 harness 默认的 workspace-write 生效', async () => {
  const { pool, ctx } = presetRig({ probeSeatbelt: () => ({ ok: true }) })
  await pool.ensureAgent('mapus-sandbox-ok')
  const agent = ctx.live.get('mapus-sandbox-ok')
  assert.equal(agent.session.events.filter(event => event.type === 'sandbox/mode').length, 0)
})

test('Linux 走 provider 自己的 confine 探测，探不通同样降级', { skip: process.platform === 'darwin' }, async () => {
  const { pool, ctx } = presetRig({ sandbox: fakeSandbox(sandboxUnavailable()) })
  await pool.ensureAgent('mapus-sandbox-linux')
  const agent = ctx.live.get('mapus-sandbox-linux')
  const modes = agent.session.events.filter(event => event.type === 'sandbox/mode')
  assert.deepEqual(modes[0].data, { mode: 'danger-full-access' })
})

test('confine 因为别的原因失败时不擅自放宽', { skip: process.platform === 'darwin' }, async () => {
  const { pool, ctx } = presetRig({ sandbox: fakeSandbox(new Error('ENOENT spawn failed')) })
  await pool.ensureAgent('mapus-sandbox-other')
  const agent = ctx.live.get('mapus-sandbox-other')
  assert.equal(agent.session.events.filter(event => event.type === 'sandbox/mode').length, 0)
})

test('sandboxMode 显式给值时就钉这个值，不探测', async () => {
  let probes = 0
  const { pool, ctx } = presetRig({
    probeSeatbelt: () => {
      probes += 1
      return { ok: false, detail: 'x' }
    },
    config: { sandboxMode: 'workspace-write' },
  })
  await pool.ensureAgent('mapus-sandbox-fixed')
  const agent = ctx.live.get('mapus-sandbox-fixed')
  const modes = agent.session.events.filter(event => event.type === 'sandbox/mode')
  assert.equal(modes.length, 1)
  assert.deepEqual(modes[0].data, { mode: 'workspace-write' })
  assert.equal(probes, 0)
})

test('sandboxMode=inherit 完全不碰会话策略', async () => {
  let probes = 0
  const { pool, ctx } = presetRig({
    probeSeatbelt: () => {
      probes += 1
      return { ok: false, detail: 'x' }
    },
    config: { sandboxMode: 'inherit' },
  })
  await pool.ensureAgent('mapus-sandbox-inherit')
  const agent = ctx.live.get('mapus-sandbox-inherit')
  assert.equal(agent.session.events.filter(event => event.type === 'sandbox/mode').length, 0)
  assert.equal(probes, 0)
})

test('实时流帧只发给正在等待该会话的那一轮', () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  const emitted = []
  const agent = { session: { id: 'mapus-live' } }
  pool.turns.set('mapus-live', { live: true, emit: event => emitted.push(event) })
  pool.states.set('mapus-live', createTurnState({ maxSteps: 10 }))

  pool.onAssistantStream(agent, { type: 'start', attemptId: 'a', revision: 1, turn: 1, step: 1 })
  pool.onAssistantStream(agent, {
    type: 'chunk', attemptId: 'a', revision: 1, index: 0,
    chunk: { type: 'text-delta', index: 0, text: '逐' },
  })
  assert.deepEqual(emitted, [{ type: 'delta', text: '逐' }], '有回合在等就要立刻转发')

  pool.onAssistantStream({ session: { id: 'mapus-nobody' } }, {
    type: 'chunk', attemptId: 'b', revision: 1, index: 0,
    chunk: { type: 'text-delta', index: 0, text: 'x' },
  })
  pool.turns.get('mapus-live').live = false
  pool.onAssistantStream(agent, {
    type: 'chunk', attemptId: 'a', revision: 1, index: 1,
    chunk: { type: 'text-delta', index: 1, text: 'x' },
  })
  assert.equal(emitted.length, 1, '没人等的帧不该进 UI')
})

test('没有 session 的脏帧不会抛', () => {
  const ctx = fakeContext()
  const pool = new AgentPool({ ctx, config: resolveConfig({}), log: () => {}, waitBeforeRetry: () => 0 })
  assert.doesNotThrow(() => pool.onAssistantStream(null, { type: 'chunk' }))
  assert.doesNotThrow(() => pool.onAssistantStream({}, { type: 'chunk' }))
})
