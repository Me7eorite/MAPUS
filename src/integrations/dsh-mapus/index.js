
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
    log('事件路由失败', { error: error && error.message })
  }
})
if (typeof off === 'function') {
  ctx.effect(() => () => off())
}

const offStream = ctx.on('agent/assistant-stream', payload => {
  try {
    pool.onAssistantStream(payload && payload.agent, payload && payload.frame)
  } catch (error) {
    log('流式帧路由失败', { error: error && error.message })
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
          description: '用 MAPUS 工具读页面、跑扫描、驱动真实浏览器并取证时加载',
          content,
          source: 'runtime',
          provider: 'dsh-mapus',
        }),
      )
    } catch (error) {
      log('注册 mapus-browser skill 失败（不影响工具）', { error: error && error.message })
    }
  }

  ctx.effect(() => {
    let closed = false
    bridge
      .start()
      .then(({ url, port }) => {
        if (closed) return
        const token = config.token
        const source = config.tokenSource === 'generated' ? '首次启动已生成' : config.tokenSource === 'file' ? '沿用已保存' : '来自 patch 配置'
        const lines = [
          '',
          '  ┌─ dsh-mapus 已就绪 ─────────────────────────────────────────',
          `  │ 地址   ${url}`,
          `  │ Token  ${token}   (${source}, ${tokenFile()})`,
          `  │ 后端   provider=${config.provider || '(profile 默认)'} model=${config.model || '(profile 默认)'}`,
          '  │ 下一步 打开 MAPUS 控制大屏 → 设置 → 智能体模型 → 执行后端选「DeepSeek Harness」',
          `  │        填 http://${config.host}:${port} 与上面的 Token，点「测试连接」`,
          '  └────────────────────────────────────────────────────────────',
          '',
        ]
        console.log(lines.join('\n'))
      })
      .catch(error => {
        log('桥启动失败', { error: error && error.message })
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
