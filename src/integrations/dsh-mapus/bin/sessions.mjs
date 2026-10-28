
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import os from 'node:os'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS_DIR = path.join(DSH_HOME, 'sessions')

if (typeof zlib.zstdDecompressSync !== 'function') {
  console.error(`当前 node ${process.version} 不支持 zstd，需要 >= 22.15。`)
  process.exit(1)
}

function decompressAll(file) {
  const buf = fs.readFileSync(file)
  const offsets = []
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === ZSTD_MAGIC[0] && buf[i + 1] === ZSTD_MAGIC[1]
      && buf[i + 2] === ZSTD_MAGIC[2] && buf[i + 3] === ZSTD_MAGIC[3]) offsets.push(i)
  }
  let text = ''
  for (const offset of offsets) {
    try {
      const piece = zlib.zstdDecompressSync(buf.subarray(offset)).toString('utf8')
      if (piece) text += piece
    } catch {
    }
  }
  return text
}

function readEvents(dir) {
  const candidates = ['session.v4.jsonl.zstd', 'session.jsonl.zstd']
  for (const name of candidates) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    const events = []
    for (const line of decompressAll(file).split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        events.push(JSON.parse(trimmed))
      } catch {
      }
    }
    return events
  }
  return []
}

function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return []
  const out = []
  for (const bucket of fs.readdirSync(SESSIONS_DIR)) {
    const bucketPath = path.join(SESSIONS_DIR, bucket)
    if (!fs.statSync(bucketPath).isDirectory()) continue
    for (const id of fs.readdirSync(bucketPath)) {
      const dir = path.join(bucketPath, id)
      let stat
      try {
        stat = fs.statSync(dir)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      out.push({ bucket, id, dir, mtime: stat.mtime })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

function summarize(events) {
  let title = ''
  let turns = 0
  let model = ''
  for (const event of events) {
    const data = event.data || {}
    if (event.type === 'session/title' && data.title) title = data.title
    else if (event.type === 'turn/end') turns += 1
    else if (event.type === 'assistant/message') {
      const source = (data.message && data.message.source) || {}
      if (source.model) model = `${source.provider || '?'}/${source.model}`
    }
  }
  return { title, turns, model }
}

const textOfContent = content => (Array.isArray(content) ? content : [])
  .filter(part => part && part.type === 'text' && typeof part.text === 'string')
  .map(part => part.text)
  .join('')

const clip = (text, limit = 1200) => (text.length > limit ? `${text.slice(0, limit)}…[共 ${text.length} 字符]` : text)

const isRuntimeContext = text => text.startsWith('Current runtime context')

function printTrail(id, { reasoning = false } = {}) {
  const hit = listSessions().find(item => item.id === id) || listSessions().find(item => item.id.startsWith(id))
  if (!hit) {
    console.error(`找不到会话：${id}`)
    const near = listSessions().filter(item => item.id.includes(id)).slice(0, 5)
    if (near.length) console.error('相近的有：\n' + near.map(item => '  ' + item.id).join('\n'))
    process.exit(1)
  }
  const events = readEvents(hit.dir)
  const head = events.find(event => event.type === 'session') || {}
  console.log(`会话    ${hit.id}`)
  console.log(`cwd     ${head.cwd || '(未知)'}`)
  console.log(`桶      ${hit.bucket}`)
  console.log(`事件数  ${events.length}`)
  console.log('─'.repeat(72))

  for (const event of events) {
    const data = event.data || {}
    switch (event.type) {
      case 'user/message': {
        const text = textOfContent(data.content)
        if (!text) break
        if (isRuntimeContext(text)) {
          console.log('[运行时上下文] （每轮注入的沙箱/文件策略快照，省略）')
          break
        }
        console.log(`\n[用户] ${clip(text)}`)
        break
      }
      case 'assistant/message': {
        const message = data.message || {}
        const text = textOfContent(message.content)
        if (!text) break
        const source = message.source || {}
        const tag = source.model ? ` · ${source.provider || '?'}/${source.model}` : ''
        console.log(`\n[助手${tag}] ${clip(text)}`)
        break
      }
      case 'tool/call': {
        const name = data.name || data.tool || '?'
        const raw = data.arguments !== undefined ? data.arguments : data.args
        let args
        if (typeof raw === 'string') {
          try {
            args = JSON.stringify(JSON.parse(raw))
          } catch {
            args = raw
          }
        } else {
          args = JSON.stringify(raw ?? {})
        }
        console.log(`  ↳ 工具 ${name} ${clip(args, 300)}`)
        break
      }
      case 'tool/result': {
        const block = ((data.message && data.message.content) || []).find(part => part && part.type === 'tool-result')
        if (!block) break
        const body = textOfContent(block.content).replace(/\s*\n\s*/g, ' ')
        const failed = block.isError === true
        console.log(`  ↳ 结果 ${failed ? '失败' : '完成'} ${clip(body || '(空)', 400)}`)
        break
      }
      case 'turn/end': {
        const reason = data.reason && (data.reason.kind || data.reason)
        console.log(`\n[轮次结束] ${typeof reason === 'string' ? reason : JSON.stringify(reason ?? '')}`)
        break
      }
      case 'reasoning-chunks':
        if (reasoning && data.text) console.log(`  …思考 ${clip(String(data.text), 300)}`)
        break
      default:
        break
    }
  }
  console.log('\n' + '─'.repeat(72))
  console.log(`原始：${path.relative(process.cwd(), path.join(hit.dir, 'session.v4.jsonl.zstd'))}`)
}

const USAGE = `读 dsh 自己的会话记录。

  node bin/sessions.mjs                 列出所有会话（跨 cwd 桶）
  node bin/sessions.mjs --mapus         只看 MAPUS 相关
  node bin/sessions.mjs --cwd dsh-mapus 按 cwd 桶名过滤
  node bin/sessions.mjs <id 前缀>       打印这一场的可读轨迹
  node bin/sessions.mjs <id> --json     打印原始事件（逐行 JSON）
  node bin/sessions.mjs <id> --reasoning 连思考过程一起打印

会话目录：$DSH_HOME/sessions/<cwd 转义>/<sessionId>/session*.jsonl.zstd`

function main() {
  const argv = process.argv.slice(2)
  const flags = new Set(argv.filter(arg => arg.startsWith('--')))
  const positional = argv.filter(arg => !arg.startsWith('--'))

  if (flags.has('--help') || flags.has('-h')) {
    console.log(USAGE)
    return
  }

  if (positional.length) {
    if (flags.has('--json')) {
      const hit = listSessions().find(item => item.id.startsWith(positional[0]))
      if (!hit) {
        console.error(`找不到会话：${positional[0]}`)
        process.exit(1)
      }
      for (const event of readEvents(hit.dir)) console.log(JSON.stringify(event))
      return
    }
    printTrail(positional[0], { reasoning: flags.has('--reasoning') })
    return
  }

  const cwdFilter = (() => {
    const index = argv.indexOf('--cwd')
    return index >= 0 && argv[index + 1] ? argv[index + 1] : ''
  })()

  let rows = listSessions()
  if (flags.has('--mapus')) rows = rows.filter(item => item.bucket.includes('dsh-mapus') || item.id.startsWith('mapus'))
  if (cwdFilter) rows = rows.filter(item => item.bucket.includes(cwdFilter))

  if (!rows.length) {
    console.log(`没有会话。目录：${SESSIONS_DIR}`)
    return
  }

  const prepared = rows.map(row => {
    const { title, turns, model } = summarize(readEvents(row.dir))
    const d = row.mtime
    const stamp = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
      + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return { ...row, title, turns, model: model || '-', stamp }
  })
  const wModel = Math.min(38, prepared.reduce((w, row) => Math.max(w, row.model.length), 5) + 2)

  console.log(`${'时间'.padEnd(13)}${'轮'.padStart(3)}  ${'模型'.padEnd(wModel)}标题`)
  for (const row of prepared) {
    console.log(`${row.stamp.padEnd(13)}${String(row.turns).padStart(3)}  ${row.model.padEnd(wModel)}${row.title || '(无标题)'}`)
    console.log(`${''.padEnd(13)}${''.padStart(3)}  ${''.padEnd(wModel)}${row.id}   ← ${row.bucket}`)
  }
  console.log(`\n共 ${prepared.length} 个会话。看某一场的轨迹：node bin/sessions.mjs <会话 id> [--reasoning]`)
}

main()
