
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveConfig, tokenFile } from './lib/config.js'
import { AgentPool } from './lib/agent.js'
import { createBridge } from './lib/bridge.js'

export const name = 'mapus-bridge'

export const inject = ['agents', 'tools']

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)
  const log = (message, extra) => {
    if (extra === undefined) console.log(`[dsh-mapus] ${message}`)
    else console.log(`[dsh-mapus] ${message}`, extra)
  }

  const pool = new AgentPool({ ctx, config, log })
  const bridge = createBridge({ pool, config, log })

const off = ctx.on('session/event', (session, event) => {
  try {
    pool.onSessionEvent(session, event)
  } catch (error) {
    log('failed to route a session event', { error: error && error.message })
  }
})
if (typeof off === 'function') {
  ctx.effect(() => () => off())
}

const offStream = ctx.on('agent/assistant-stream', payload => {
  try {
    pool.onAssistantStream(payload && payload.agent, payload && payload.frame)
  } catch (error) {
    log('failed to route a stream frame', { error: error && error.message })
  }
})
if (typeof offStream === 'function') {
  ctx.effect(() => () => offStream())
}

  const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
  if (skills && typeof skills.register === 'function') {
    try {
      const content = readFileSync(fileURLToPath(new URL('./skills/mapus-browser/SKILL.md', import.meta.url)), 'utf8')
      ctx.effect(() =>
        skills.register({
          name: 'mapus-browser',
          description: 'Load this when driving a real browser with MAPUS tools to read pages, run scans and collect evidence',
          content,
          source: 'runtime',
          provider: 'dsh-mapus',
        }),
      )
    } catch (error) {
      log('failed to register the mapus-browser skill (tools are unaffected)', { error: error && error.message })
    }
  }

  ctx.effect(() => {
    let closed = false
    bridge
      .start()
      .then(({ url }) => {
        if (closed) return
        const token = config.token
        const source = config.tokenSource === 'generated' ? 'generated' : config.tokenSource === 'file' ? 'reused' : 'from patch config'
        const lines = [
          `[dsh-mapus] ready  ${url}  token ${token}  (${source}, ${tokenFile()})`,
          `[dsh-mapus] provider ${config.provider || 'profile default'}  model ${config.model || 'profile default'}  ·  paste the url and token into MAPUS → Settings → Agent model`,
        ]
        console.log(lines.join('\n'))
      })
      .catch(error => {
        log('bridge failed to start', { error: error && error.message })
      })
    return async () => {
      closed = true
      await bridge.stop()
      await pool.dispose()
    }
  })

  return { pool, bridge, config }
}

export default { name, inject, apply }
