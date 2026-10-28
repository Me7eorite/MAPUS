
import { createServer } from 'node:http'
import { ROUTES, PROTOCOL_VERSION, line } from './protocol.js'
import { describeCatalog } from './tools.js'
import { toSessionId } from './agent.js'

const MAX_BODY_BYTES = 2 * 1024 * 1024

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

export class Bridge {
  constructor({ pool, config, log = () => {} }) {
    this.pool = pool
    this.config = config
    this.log = log
    this.server = null
    this.startedAt = 0
    this.turnsServed = 0
    this.tokens = config.token
  }

  #authorized(req) {
    if (!this.tokens) return true
    const header = String(req.headers['x-mapus-token'] || '')
    if (header && header === this.tokens) return true
    const auth = String(req.headers.authorization || '')
    const match = /^Bearer\s+(.+)$/i.exec(auth)
    return Boolean(match && match[1].trim() === this.tokens)
  }

  #cors(res) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization, x-mapus-token',
      'access-control-max-age': '600',
      vary: 'origin',
    }
  }

  async start() {
    if (!this.config.bindable) {
      throw new Error(`refusing to bind a non-loopback address (${this.config.host}): set allowRemote: true in the patch config if LAN access is really needed`)
    }
    const server = createServer((req, res) => {
      this.#route(req, res).catch(error => {
        this.log('request failed', { url: req.url, error: error && error.message })
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: error && error.message ? error.message : 'internal error' })
        else res.end()
      })
    })
    server.on('clientError', (error, socket) => {
      this.log('client connection error', { error: error && error.message })
      try {
        socket.destroy()
      } catch {
      }
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.config.port, this.config.host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
    this.startedAt = Date.now()
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : this.config.port
    return { url: `http://${this.config.host}:${port}`, port, host: this.config.host }
  }

  async #route(req, res) {
    const url = new URL(req.url || '/', `http://${this.config.host}`)
    const path = url.pathname
    const cors = this.#cors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }

    if (path === ROUTES.health) {
      sendJson(res, 200, {
        ok: true,
        name: 'dsh-mapus',
        protocol: PROTOCOL_VERSION,
        startedAt: this.startedAt,
        uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
        turnsServed: this.turnsServed,
        authRequired: Boolean(this.tokens),
      }, cors)
      return
    }

    if (!this.#authorized(req)) {
      sendJson(res, 401, { ok: false, error: 'invalid token: paste the token printed at plugin startup into the MAPUS settings' }, cors)
      return
    }

    if (path === ROUTES.catalog && req.method === 'GET') {
      sendJson(res, 200, { ok: true, ...describeCatalog() }, cors)
      return
    }

    if (path === ROUTES.models && req.method === 'GET') {
      sendJson(res, 200, await this.#describeModels(), cors)
      return
    }

    if (path === ROUTES.session && req.method === 'GET') {
      const conversation = url.searchParams.get('conversation') || ''
      const sessionId = toSessionId(this.config.sessionPrefix, conversation)
      const agent = this.pool.ctx.agents.get(sessionId)
      sendJson(res, 200, {
        ok: true,
        sessionId,
        live: Boolean(agent),
        events: agent && Array.isArray(agent.session.events) ? agent.session.events.length : 0,
      }, cors)
      return
    }

    if (path === ROUTES.turn && req.method === 'POST') {
      await this.#handleTurn(req, res, cors)
      return
    }

    if (path === ROUTES.rpc && req.method === 'POST') {
      const body = await readJson(req)
      const conversation = String(body.conversation || '')
      const sessionId = String(body.sessionId || toSessionId(this.config.sessionPrefix, conversation))
      const turn = this.pool.turns.get(sessionId)
      if (!turn) {
        sendJson(res, 409, { ok: false, error: 'no conversation is waiting for this result (it may have finished or been cancelled)' }, cors)
        return
      }
      const accepted = turn.settle(String(body.id || ''), {
        ok: body.ok !== false,
        result: body.result,
        error: body.error,
      })
      sendJson(res, accepted ? 200 : 404, { ok: accepted }, cors)
      return
    }

    if (path === ROUTES.cancel && req.method === 'POST') {
      const body = await readJson(req)
      const conversation = String(body.conversation || '')
      const sessionId = String(body.sessionId || toSessionId(this.config.sessionPrefix, conversation))
      const result = this.pool.cancel(sessionId, body.reason === 'plugin' ? 'plugin' : 'user')
      sendJson(res, 200, result, cors)
      return
    }

    if (path === ROUTES.shutdown && req.method === 'POST') {
      sendJson(res, 200, { ok: true }, cors)
      this.log('shutdown requested, closing the bridge')
      setTimeout(() => this.stop(), 50).unref?.()
      return
    }

    sendJson(res, 404, { ok: false, error: `unknown route ${path}` }, cors)
  }

  async #describeModels() {
    const current = {
      provider: this.config.provider || '',
      model: this.config.model || '',
      reasoningEffort: this.config.reasoningEffort || '',
    }
    const ctx = this.pool && this.pool.ctx
    const llm = ctx ? (typeof ctx.get === 'function' ? ctx.get('llm') : ctx.llm) : null
    if (!llm || typeof llm.listConfigurableProviders !== 'function') {
      return { ok: true, current, providers: [], note: 'no enumerable llm service in the current dsh composition' }
    }
    let entries = []
    try {
      entries = llm.listConfigurableProviders() || []
    } catch (error) {
      return { ok: true, current, providers: [], note: `failed to enumerate providers: ${error && error.message}` }
    }
    const providers = []
    for (const entry of entries) {
      const id = String((entry && entry.provider) || '').trim()
      if (!id) continue
      let models = []
      try {
        const list = await llm.listModels(id)
        models = (list || []).map(item => ({ id: String(item.id || ''), name: String(item.name || item.id || '') })).filter(item => item.id)
      } catch {
        models = []
      }
      providers.push({ id, name: String((entry && entry.displayName) || id), models })
    }
    return { ok: true, current, providers }
  }

  async #handleTurn(req, res, cors) {
    const body = await readJson(req)
    const prompt = String(body.prompt || '').trim()
    if (!prompt) {
      sendJson(res, 400, { ok: false, error: 'prompt must not be empty' }, cors)
      return
    }
    const conversation = String(body.conversation || '') || `anon-${Date.now().toString(36)}`
    const sessionId = toSessionId(this.config.sessionPrefix, conversation)
    const context = body.context && typeof body.context === 'object' ? body.context : null
    const history = Array.isArray(body.history) ? body.history : []
    const route = {
      provider: String(body.provider || '').trim(),
      model: String(body.model || '').trim(),
      reasoningEffort: String(body.reasoningEffort || '').trim(),
    }

    res.writeHead(200, {
      ...cors,
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    })
    res.flushHeaders?.()
    this.turnsServed += 1

    let closed = false
    const write = payload => {
      if (closed) return false
      try {
        res.write(line(payload))
        return true
      } catch {
        closed = true
        return false
      }
    }

    res.write(line({ type: 'hello', protocol: PROTOCOL_VERSION, sessionId }))

    const controller = new AbortController()
    req.on('aborted', () => {
      closed = true
      controller.abort()
    })
    res.on('close', () => {
      closed = true
      if (!res.writableEnded) controller.abort()
    })

    try {
      const { turn } = await this.pool.runTurn({
        sessionId,
        prompt,
        context,
        history,
        route,
        write,
        signal: controller.signal,
        log: this.log,
      })
      await turn.whenEnded()
    } catch (error) {
      write({ type: 'error', message: error && error.message ? error.message : 'bridge error' })
    } finally {
      closed = true
      res.end()
    }
  }

  async stop() {
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise(resolve => {
      server.close(() => resolve())
      setTimeout(resolve, 500).unref?.()
    })
  }
}

export function createBridge(options) {
  return new Bridge(options)
}
