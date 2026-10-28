
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { stateDir, SANDBOX_MODES } from './config.js'
import { finishTurn, createTurnState, translateSessionEvent, translateStreamFrame } from './translate.js'
import { TOOLS, PASSTHROUGH_TOOL, CATALOG_TOOL, buildToolDefinition } from './tools.js'
import { Turn } from './turn.js'

const DEFAULT_PERSONA = [
  '你是 MAPUS 的网页分析助手，运行在 DeepSeek Harness 之上。',
  '你通过 mapus_* 工具驱动用户的浏览器：读页面、跑扫描、看浏览器特征、调脚本、用真实鼠标键盘操作页面。',
  '本机操作直接用 dsh 原生工具：bash（macOS/Linux）/ pwsh（Windows）跑命令，read / write / edit 读写文件，glob / grep 找文件。这是唯一的本机执行通道。',
  '工作方式：一次只做一个动作，先拿证据再下结论；每一步都要有明确目的，别重复同一个动作；没验证的结论要标成「未验证」。',
  '遇到工具返回 error，先判断是参数问题、页面状态问题还是能力未启用，再决定换路径还是告知用户。',
].join('\n')

const SOURCE_KIND = 'plugin:dsh-mapus'

const SNAPSHOT_SECTION = 'mapus-page'

const CONTENTION = /already owned by an active write handle|SessionAlreadyOwned|EBUSY/i

export const RESUME_RETRIES = 5

const RETRY_BASE_MS = 150

const RETRY_CAP_MS = 2_000

function retryDelay(attempt) {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS)
}

const OPEN_QUEUES = new Map()

function queueOpen(sessionId, task) {
  const previous = OPEN_QUEUES.get(sessionId) || Promise.resolve()
  const run = previous.catch(() => {}).then(task)
  const guard = run.catch(() => {})
  OPEN_QUEUES.set(sessionId, guard)
  guard.then(() => {
    if (OPEN_QUEUES.get(sessionId) === guard) OPEN_QUEUES.delete(sessionId)
  })
  return run
}

const UNREADABLE = /refuses this format|artifact remains unchanged|raw log:/i

const HOST_PRESET_ID = 'mapus-host'

const HOST_PRESET = {
  name: 'MAPUS 桥 · 本机工具',
  description: 'MAPUS 桥为每个会话挂载的 dsh 原生 shell / 文件读写 / 搜索 / 后台任务工具。',
  order: 900,
}

const HOST_PRESET_ROWS = [
  {
    id: 'tool-bash',
    name: '@deepseek-ai/dsh-tool-bash',
    disabled: process.platform === 'win32',
  },
  {
    id: 'tool-pwsh',
    name: '@deepseek-ai/dsh-tool-pwsh',
    disabled: process.platform !== 'win32',
  },
  {
    id: 'tool-fs',
    name: '@deepseek-ai/dsh-tool-fs',
  },
  {
    id: 'tool-fs-search',
    name: '@deepseek-ai/dsh-tool-fs-search',
    config: { sampleOverCapGlobResults: false },
  },
  {
    id: 'tool-jobs',
    name: '@deepseek-ai/dsh-tool-jobs',
  },
]

const HOST_TOOLS_TIMEOUT_MS = 10_000

const SEATBELT_CANARY = '(version 1) (allow default) (deny file-write*) (allow file-write* (literal "/dev/null"))'

export function defaultSeatbeltProbe(timeoutMs) {
  const result = spawnSync('/usr/bin/sandbox-exec', ['-p', SEATBELT_CANARY, '--', '/usr/bin/true'], {
    timeout: timeoutMs,
    encoding: 'utf8',
  })
  if (result.status === 0) return { ok: true }
  const stderr = String(result.stderr || '').trim()
  const reason = stderr || (result.error && result.error.message) || `exit ${String(result.status)}`
  return { ok: false, detail: reason }
}

export function settleWithin(promise, ms) {
  let timer
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, timeout: true }), ms)
  })
  return Promise.race([
    promise.then(value => ({ ok: true, value }), error => ({ ok: false, error })),
    deadline,
  ]).finally(() => clearTimeout(timer))
}

function pick(primary, fallback) {
  const first = typeof primary === 'string' ? primary.trim() : ''
  if (first) return first
  return typeof fallback === 'string' ? fallback.trim() : ''
}

export function toSessionId(prefix, conversationId) {
  const raw = String(conversationId || '').trim() || 'default'
  const slug = raw.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48) || 'default'
  const digest = createHash('sha1').update(raw).digest('hex').slice(0, 8)
  return `${prefix}-${slug}-${digest}`
}

export function renderContext(context) {
  if (!context || typeof context !== 'object') return ''
  const lines = ['【当前现场】']
  if (context.title) lines.push(`标题：${context.title}`)
  if (context.url) lines.push(`URL：${context.url}`)
  if (Array.isArray(context.fingerprints) && context.fingerprints.length) {
    lines.push(`浏览器特征：${context.fingerprints.slice(0, 10).map(item => (item && item.name) || item).join('、')}`)
  }
  if (context.anti && typeof context.anti === 'object') {
    lines.push(`隐私防护：${context.anti.isEnabled ? '开启' : '关闭'}，本站拦截 ${Number(context.anti.blocks) || 0} 次`)
  }
  if (context.hooks && typeof context.hooks === 'object') {
    const enabled = Array.isArray(context.hooks.enabled) ? context.hooks.enabled : []
    lines.push(`脚本：已启用 ${enabled.join('、') || '无'}`)
  }
  if (Number.isFinite(context.total) && context.total > 0) {
    lines.push(`已扫描：${context.total} 条，进度 ${context.progress === null || context.progress === undefined ? '未知' : context.progress + '%'}`)
  }
  if (context.note) lines.push(String(context.note))
  if (lines.length === 1) return ''
  return lines.join('\n')
}

export function renderHistory(history, limit = 20) {
  if (!Array.isArray(history) || !history.length) return ''
  const lines = ['【此前对话摘要】', '这段对话在接入 Harness 之前就已经发生过，以下是它的记录：']
  for (const item of history.slice(-limit)) {
    if (!item || !item.role) continue
    const text = String(item.content || '').trim()
    if (!text) continue
    lines.push(`${item.role === 'user' ? '用户' : '助手'}：${text.slice(0, 1200)}`)
  }
  if (lines.length === 2) return ''
  return lines.join('\n')
}

export class AgentPool {
  constructor({ ctx, config, log = () => {}, hostToolsTimeoutMs = HOST_TOOLS_TIMEOUT_MS, probeSeatbelt = defaultSeatbeltProbe, waitBeforeRetry = retryDelay }) {
    this.ctx = ctx
    this.config = config
    this.log = log
    this.hostToolsTimeout = hostToolsTimeoutMs
    this.probeSeatbelt = probeSeatbelt
    this.waitBeforeRetry = typeof waitBeforeRetry === 'function' ? waitBeforeRetry : retryDelay
    this.turns = new Map()
    this.handles = new Map()
    this.states = new Map()
    this.routeStamps = new Map()
    this.quarantined = new Set()
    this.presetReady = null
    this.presetDispose = null
    this.mountWarned = false
    this.mounted = false
    this.sandboxProbe = null
    this.sandboxWarned = false
  }

  async #quarantine(sessionId, reason) {
    if (this.quarantined.has(sessionId)) return false
    const match = /raw log:\s*([^)）\n]+)/i.exec(reason)
    const logPath = match ? match[1].trim() : ''
    if (!logPath || !/\.zstd$/i.test(logPath)) {
      this.log('会话日志无法解析，但拿不到路径，无法隔离', { sessionId })
      return false
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(stateDir(), 'quarantine', `${sessionId}-${stamp}`)
    try {
      await mkdir(dirname(target), { recursive: true })
      await rename(dirname(logPath), target)
      this.quarantined.add(sessionId)
      this.log('会话日志无法解析，已隔离并重建（旧日志保留在 quarantine 目录）', { sessionId, to: target })
      return true
    } catch (error) {
      this.log('隔离损坏会话失败', { sessionId, error: error && error.message })
      return false
    }
  }

#serial(sessionId, task) {
  return queueOpen(sessionId, task)
}

  async ensureAgent(sessionId, requested = null) {
    const route = {
      provider: pick(requested && requested.provider, this.config.provider),
      model: pick(requested && requested.model, this.config.model),
      reasoningEffort: pick(requested && requested.reasoningEffort, this.config.reasoningEffort),
    }
    if (!route.provider || !route.model) {
      const fallback = this.#defaultSelection()
      route.provider = route.provider || fallback.provider
      route.model = route.model || fallback.model
      route.reasoningEffort = route.reasoningEffort || fallback.reasoningEffort
    }
    return await this.#serial(sessionId, () => this.#openAgent(sessionId, route))
  }

  async #openAgent(sessionId, route) {
    const stamp = `${route.provider}\u0000${route.model}\u0000${route.reasoningEffort}`

    const live = this.ctx.agents.get(sessionId)
    if (live) {
      const previous = this.routeStamps.get(sessionId)
      if (previous === undefined || previous === stamp) {
        this.routeStamps.set(sessionId, stamp)
        return live
      }
      this.log('模型已变更，重建 agent', { sessionId, from: previous.split('\u0000').slice(0, 2), to: [route.provider, route.model] })
      await this.#teardown(sessionId)
    }

    const agentOptions = {}
    if (route.provider) agentOptions.provider = route.provider
    if (route.model) agentOptions.model = route.model
    if (route.reasoningEffort) agentOptions.reasoningEffort = route.reasoningEffort

    const setup = (agentCtx, agent) => this.#compose(agentCtx, agent)
    const cwd = pick(this.config.cwd, '') || process.cwd()
    const handle = await this.#openHandle(sessionId, cwd, agentOptions, setup)
    this.handles.set(sessionId, handle)
    this.routeStamps.set(sessionId, stamp)
    return handle.agent
  }

  async #openHandle(sessionId, cwd, agentOptions, setup) {
    const resume = () => this.ctx.agents.resume({ resumeSessionId: sessionId, agentOptions, setup })
    const create = () => this.ctx.agents.create({ sessionId, meta: { cwd }, agentOptions, setup })
    const reasonOf = error => String((error && error.message) || error || '')
    const adopt = () => {
      const agent = this.ctx.agents.get(sessionId)
      return agent ? { agent } : null
    }

    let missing = false
    for (let attempt = 0; attempt <= RESUME_RETRIES; attempt += 1) {
      try {
        return await resume()
      } catch (resumeError) {
        const reason = reasonOf(resumeError)
        if (CONTENTION.test(reason) && attempt < RESUME_RETRIES) {
          this.log('会话写句柄被占用，稍后重试', { sessionId, attempt: attempt + 1 })
          await new Promise(resolve => setTimeout(resolve, this.waitBeforeRetry(attempt)))
          continue
        }
        if (!/not found/i.test(reason)) {
          if (UNREADABLE.test(reason) && await this.#quarantine(sessionId, reason)) {
            return await create()
          }
          throw new Error(`恢复会话失败：${reason}`, { cause: resumeError })
        }
        missing = true
        if (process.env.DSH_MAPUS_DEBUG) this.log('会话尚未落盘，新建', { sessionId })
        break
      }
    }

    try {
      return await create()
    } catch (createError) {
      const reason = reasonOf(createError)
      if (!/already exists|already registered/i.test(reason)) throw createError

      this.log('会话已存在于 harness，改为复用而不是报错', {
        sessionId,
        resumeReason: missing ? 'not found' : undefined,
      })

      let last = createError
      for (let attempt = 0; attempt <= RESUME_RETRIES; attempt += 1) {
        const adopted = adopt()
        if (adopted) return adopted
        try {
          return await resume()
        } catch (error) {
          last = error
          const why = reasonOf(error)
          if (attempt < RESUME_RETRIES && (CONTENTION.test(why) || /not found/i.test(why))) {
            this.log('会话已注册但句柄未就绪，稍后重试', { sessionId, attempt: attempt + 1 })
            await new Promise(resolve => setTimeout(resolve, this.waitBeforeRetry(attempt)))
            continue
          }
          break
        }
      }

      throw new Error(
        `会话 ${sessionId} 已在 harness 的会话表里注册，但既拿不到 agent 也打不开写句柄：`
        + `${reasonOf(last)}。通常是另一处仍持有该会话，或会话文件所在的目录与当前工作目录不一致（当前 cwd=${cwd}）。`,
        { cause: last },
      )
    }
  }

  #defaultSelection() {
    const empty = { provider: '', model: '', reasoningEffort: '' }
    try {
      const ctx = this.ctx
      const service = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : ctx && ctx.agentDefaultModel
      if (!service || typeof service.currentSelection !== 'function') return empty
      const selected = service.currentSelection() || {}
      return {
        provider: typeof selected.provider === 'string' ? selected.provider.trim() : '',
        model: typeof selected.model === 'string' ? selected.model.trim() : '',
        reasoningEffort: typeof selected.reasoningEffort === 'string' ? selected.reasoningEffort.trim() : '',
      }
    } catch (error) {
      this.log('读取 dsh 默认模型失败', { error: error && error.message })
      return empty
    }
  }

  async #teardown(sessionId) {
    const handle = this.handles.get(sessionId)
    this.handles.delete(sessionId)
    this.routeStamps.delete(sessionId)
    if (!handle || typeof handle.dispose !== 'function') return
    try {
      await handle.dispose()
    } catch (error) {
      this.log('释放旧 agent 失败', { sessionId, error: error && error.message })
    }
  }

  async #compose(agentCtx, agent) {
    const prompt = agentCtx.get('systemPrompt')
    if (prompt && typeof prompt.section === 'function') {
      const extra = String(this.config.systemPrompt || '').trim()
      prompt.section({
        name: 'mapus-bridge',
        order: 120,
        text: extra ? `${DEFAULT_PERSONA}\n\n${extra}` : DEFAULT_PERSONA,
      })
    }
    if (this.config.enableHostTools) await this.#mountHostTools(agentCtx)
    await this.#applySandboxMode(agent)
    this.#settleApprovals(agent)
    if (!this.config.enableTools) return
    const { defineTool } = await import('@deepseek-ai/dsh-tools')
    const sessionId = agent && agent.session && agent.session.id ? String(agent.session.id) : this.#currentSessionId(agentCtx)
    const invoke = (call, args, signal) => this.callTool(sessionId, call, args, signal)
    for (const spec of TOOLS) {
      agentCtx.tools.register(defineTool(buildToolDefinition(spec, invoke, name => this.#resolveCall(name))))
    }
  }

  async #mountHostTools(agentCtx) {
    const id = await this.#hostPreset()
    if (!id) return
    const presets = this.ctx.get('agentPresets')
    if (!presets || typeof presets.mount !== 'function') return
    const outcome = await settleWithin(presets.mount(agentCtx, id), this.hostToolsTimeout)
    if (outcome.ok) {
      if (!this.mounted) {
        this.mounted = true
        this.log('已给 agent 挂上 dsh 原生工具：bash / pwsh、read / write / edit、glob / grep、job_*')
      }
      return
    }
    if (this.mountWarned) return
    this.mountWarned = true
    this.log(
      outcome.timeout
    ? '挂载 dsh 自带工具超时，本轮没有本机执行能力（只能用 mapus_* 那几个浏览器工具）'
    : 'dsh 自带的 shell / 文件工具没挂上，本轮没有本机执行能力（只能用 mapus_* 那几个浏览器工具）',
      outcome.timeout ? { preset: id } : { preset: id, error: outcome.error && outcome.error.message },
    )
  }

  async #applySandboxMode(agent) {
    const wanted = this.config.sandboxMode
    if (wanted === 'inherit') return
    const session = agent && agent.session
    if (!session || typeof session.append !== 'function') return
    let mode = wanted === 'auto' ? null : wanted
    if (wanted === 'auto') {
      const probe = await this.#probeSandbox()
      mode = probe.mode
      if (mode && !this.sandboxWarned) {
        this.sandboxWarned = true
        this.log(
          '这台机器上没有可用的沙箱后端，本机命令按 danger-full-access 运行（harness 默认的 workspace-write 会直接拒绝执行）',
          { detail: probe.detail },
        )
      }
    }
    if (!mode) return
    if (this.#pinned(session, 'sandbox/mode')) return
    try {
      session.append('sandbox/mode', { mode })
    } catch (error) {
      this.log('写入沙箱模式失败，本机命令可能全部被拒', { error: error && error.message })
    }
  }

  #probeSandbox() {
    if (this.sandboxProbe) return this.sandboxProbe
    this.sandboxProbe = (async () => {
      if (process.platform === 'darwin') {
        const verdict = this.probeSeatbelt(this.hostToolsTimeout)
        if (verdict.ok) return { mode: null }
        return { mode: 'danger-full-access', detail: verdict.detail }
      }
      const sandbox = this.ctx.get('sandbox')
      if (!sandbox || typeof sandbox.confine !== 'function') return { mode: null }
      const workspaceRoot = pick(this.config.cwd, '') || process.cwd()
      const outcome = await settleWithin(
        sandbox.confine(['/usr/bin/true'], { mode: 'workspace-write', workspaceRoot }),
        this.hostToolsTimeout,
      )
      if (outcome.ok || outcome.timeout) return { mode: null }
      const error = outcome.error
      const detail = String((error && error.message) || error)
      const unusable = (error && error.code === 'SANDBOX_UNAVAILABLE') || /no sandbox backend is usable/i.test(detail)
      return unusable ? { mode: 'danger-full-access', detail } : { mode: null, detail }
    })()
    return this.sandboxProbe
  }

  #settleApprovals(agent) {
    if (this.config.approvalPolicy !== 'never') return
    const session = agent && agent.session
    if (!session || typeof session.append !== 'function') return
    if (this.#pinned(session, 'approval/policy')) return
    try {
      session.append('approval/policy', { policy: 'never' })
    } catch (error) {
      this.log('写入审批策略失败，模型可能仍会请求沙箱升级', { error: error && error.message })
    }
  }

  #pinned(session, type) {
    if (typeof session.eventAt !== 'function') return false
    const length = Number(session.seq || 0)
    for (let index = 0; index < length; index += 1) {
      const event = session.eventAt(index)
      if (event && event.type === type) return true
    }
    return false
  }

  #hostPreset() {
    if (this.presetReady) return this.presetReady
    this.presetReady = (async () => {
      const presets = this.ctx.get('agentPresets')
      if (!presets || typeof presets.register !== 'function') {
        this.log('这个 dsh 构建没有 agent preset 注册表，本机执行工具挂不上')
        return null
      }
      const outcome = await settleWithin(
        presets.register({ id: HOST_PRESET_ID, ...HOST_PRESET, plugins: HOST_PRESET_ROWS }),
        this.hostToolsTimeout,
      )
      if (outcome.ok) {
        this.presetDispose = outcome.value
        return HOST_PRESET_ID
      }
      if (outcome.timeout) {
        this.log('注册本机工具 preset 超时，本机执行工具挂不上')
        return null
      }
      const reason = String((outcome.error && outcome.error.message) || outcome.error)
      if (/duplicate agent preset/i.test(reason)) return HOST_PRESET_ID
      this.log('注册本机工具 preset 失败，本机执行工具挂不上', { error: reason })
      return null
    })()
    return this.presetReady
  }


  #currentSessionId(agentCtx) {
    const agent = agentCtx && agentCtx.agent
    if (agent && agent.session && agent.session.id) return String(agent.session.id)
    for (const [sessionId, turn] of this.turns) if (turn.live) return sessionId
    return ''
  }

  #resolveCall(name) {
    const spec = TOOLS.find(tool => tool.name === name)
    if (spec && spec.call) return spec.call
    return name
  }

  async callTool(sessionId, call, args, signal) {
    if (call === CATALOG_TOOL) return this.catalog()
    const turn = this.turns.get(sessionId)
    if (!turn || !turn.live) {
      throw new Error('MAPUS 侧边栏没有正在进行的对话，这个工具只能在面板发起的那一轮里调用')
    }
    return await turn.rpc(call, args, signal)
  }

  catalog() {
    return {
      tools: TOOLS.filter(tool => !tool.passthrough).map(tool => ({ name: tool.name, call: tool.call })),
      note: `未列出的扩展能力可以用 ${PASSTHROUGH_TOOL} 直接调用（name + args）。`,
    }
  }

  onSessionEvent(session, event) {
    if (!session || !event) return
    const sessionId = String(session.id)
    if (event.type === 'approval/asked') {
      this.log('模型请求放宽沙箱，按 approvalPolicy 自动处理', {
        sessionId,
        tool: event.data && event.data.toolName,
        reason: event.data && event.data.reason,
      })
    }
    const turn = this.turns.get(sessionId)
    if (!turn) return
    const state = this.states.get(sessionId)
    if (!state) return
    if (process.env.DSH_MAPUS_DEBUG) {
      let payload = ''
      try {
        payload = JSON.stringify(event.data)
      } catch (_) {
        payload = '<不可序列化>'
      }
      console.error(`[dsh-mapus:debug] ${event.type} ${String(payload).slice(0, 2000)}`)
    }
    for (const mapped of translateSessionEvent(event, state)) turn.emit(mapped)
    if (event.type === 'turn/end') turn.markTurnEnd(state.endReason || 'completed')
  }

  onAssistantStream(agent, frame) {
    if (!frame) return
    const sessionId = agent && agent.session && agent.session.id ? String(agent.session.id) : ''
    if (!sessionId) return
    const turn = this.turns.get(sessionId)
    if (!turn || !turn.live) return
    const state = this.states.get(sessionId)
    if (!state) return
    for (const mapped of translateStreamFrame(frame, state)) turn.emit(mapped)
  }

  async runTurn({ sessionId, prompt, context, history, route, write, signal, log = () => {} }) {
    const turn = new Turn({
      id: `turn_${Date.now().toString(36)}`,
      sessionId,
      write,
      rpcTimeoutMs: this.config.rpcTimeoutMs,
      log,
    })
    const state = createTurnState({ maxSteps: this.config.maxSteps })
    const stale = this.turns.get(sessionId)
    if (stale && stale.live) {
      this.log('同一会话有新的一轮，终止上一轮', { sessionId })
      try {
        stale.abort('superseded')
        const running = this.ctx.agents.get(sessionId)
        if (running) running.cancel({ kind: 'plugin' })
      } catch (error) {
        log('终止上一轮失败', { sessionId, error: error && error.message })
      }
    }
    this.states.set(sessionId, state)
    this.turns.set(sessionId, turn)

    turn.emit({ type: 'start' })

    let failure = null
    let live = null
    const onClientGone = () => {
      turn.abort('client-gone')
      if (live) {
        try {
          live.cancel({ kind: 'plugin' })
        } catch (error) {
          log('客户端断开后取消失败', { sessionId, error: error && error.message })
        }
      }
    }
    if (signal) {
      if (signal.aborted) onClientGone()
      else signal.addEventListener('abort', onClientGone, { once: true })
    }
    try {
      const agent = await this.ensureAgent(sessionId, route)
      live = agent
      const cold = !Array.isArray(agent.session.events) || agent.session.events.length === 0
      if (cold) {
        const replay = renderHistory(history)
        if (replay) this.#inject(agent, replay, 'recall')
      }
      const scene = renderContext(context)
      if (scene) this.#inject(agent, scene, 'snapshot')

      agent.followup({
        id: `mapus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: [{ type: 'text', text: String(prompt || '').trim() || '（空消息）' }],
        source: { kind: 'user' },
      })

      await Promise.race([turn.whenTurnEnded(), turn.whenEnded(), agent.whenIdle()])
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
      log('本轮执行失败', { sessionId, error: failure.message, cause: failure.cause && failure.cause.message, stack: failure.stack })
    }

    if (!turn.ended) {
      const terminal = finishTurn(state, { context: context || null, failure })
      turn.emit(terminal)
      turn.end(failure ? 'failed' : 'completed')
    }
    if (this.turns.get(sessionId) === turn) this.turns.delete(sessionId)
    if (this.states.get(sessionId) === state) this.states.delete(sessionId)
    return { turn, state }
  }

  #inject(agent, text, form) {
    const source = form === 'snapshot'
      ? { kind: SOURCE_KIND, form: 'snapshot', sections: [{ name: SNAPSHOT_SECTION, text }] }
      : { kind: SOURCE_KIND, form: 'recall' }
    try {
      agent.inject({
        id: `mapus_ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source,
      })
    } catch (error) {
      this.log('注入上下文失败', { error: error && error.message })
    }
  }

  cancel(sessionId, reason = 'user') {
    const turn = this.turns.get(sessionId)
    const agent = this.ctx.agents.get(sessionId)
    let cancelled = false
    if (agent) {
      try {
        agent.cancel({ kind: reason === 'user' ? 'user' : 'plugin' })
        cancelled = true
      } catch (error) {
        this.log('取消失败', { sessionId, error: error && error.message })
      }
    }
    if (turn) turn.abort('cancelled')
    return { ok: true, cancelled }
  }

  async dispose() {
    for (const turn of this.turns.values()) turn.abort('shutdown')
    this.turns.clear()
    this.states.clear()
    const release = this.presetDispose
    this.presetDispose = null
    this.presetReady = null
    if (typeof release === 'function') {
      try {
        await release()
      } catch (error) {
        this.log('注销本机工具 preset 失败', { error: error && error.message })
      }
    }
    const handles = [...this.handles.values()]
    this.handles.clear()
    for (const handle of handles) {
      try {
        await handle.dispose()
      } catch (error) {
        this.log('释放会话失败', { error: error && error.message })
      }
    }
  }
}
