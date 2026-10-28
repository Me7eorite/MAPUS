
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import test from 'node:test'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const bridgeSource = [
  process.env.DSH_MAPUS_DIR,
  join(homedir(), 'Documents/develop/dsh-mapus'),
  join(root, 'integrations/dsh-mapus'),
]
  .filter(Boolean)
  .map(dir => join(dir, 'lib/tools.js'))
  .find(path => existsSync(path))

const bridgeSkip = bridgeSource
  ? false
  : '找不到 dsh-mapus 的 lib/tools.js：设 DSH_MAPUS_DIR，或 clone 到 ~/Documents/develop/dsh-mapus'

const literal = node =>
  node && node.type === 'Literal' ? node.value :
  node && node.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked :
  undefined

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
    const value = node[key]
    if (Array.isArray(value)) value.forEach(item => walk(item, visit))
    else if (value && typeof value.type === 'string') walk(value, visit)
  }
}

const keyOf = prop => prop.key && (prop.key.name || prop.key.value)

export function extensionTools() {
  const source = readFileSync(join(root, 'background/core/agent-core.js'), 'utf8')
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  const tools = new Map()
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return
    let name
    let params
    for (const prop of node.properties) {
      if (prop.type !== 'Property') continue
      if (keyOf(prop) === 'name') name = literal(prop.value)
      if (keyOf(prop) === 'parameters') params = prop.value
    }
    if (typeof name !== 'string' || !params || params.type !== 'ObjectExpression') return
    const fields = {}
    for (const prop of params.properties) {
      if (prop.type !== 'Property') continue
      if (keyOf(prop) === 'properties' && prop.value.type === 'ObjectExpression') {
        for (const field of prop.value.properties) {
          if (field.type === 'Property') fields[keyOf(field)] = 'optional'
        }
      }
      if (keyOf(prop) === 'required' && prop.value.type === 'ArrayExpression') {
        for (const element of prop.value.elements) {
          const name2 = literal(element)
          if (typeof name2 === 'string') fields[name2] = 'required'
        }
      }
    }
    tools.set(name, fields)
  })
  return tools
}

export function bridgeTools() {
  const source = readFileSync(bridgeSource, 'utf8')
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  const tools = new Map()
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return
    let call
    let params
    for (const prop of node.properties) {
      if (prop.type !== 'Property') continue
      if (keyOf(prop) === 'call') call = literal(prop.value)
      if (keyOf(prop) === 'parameters' && prop.value.type === 'ObjectExpression') params = prop.value
    }
    if (typeof call !== 'string') return
    const fields = {}
    if (params) {
      for (const prop of params.properties) {
        if (prop.type !== 'Property') continue
        let required = 'optional'
        if (prop.value.type === 'ObjectExpression') {
          for (const inner of prop.value.properties) {
            if (inner.type === 'Property' && keyOf(inner) === 'required' && literal(inner.value) === true) required = 'required'
          }
        }
        fields[keyOf(prop)] = required
      }
    }
    tools.set(call, fields)
  })
  return tools
}

test('桥侧声明的工具参数与扩展侧完全一致', { skip: bridgeSkip }, () => {
  const extension = extensionTools()
  const bridge = bridgeTools()
  const problems = []

  for (const [call, fields] of bridge) {
    const truth = extension.get(call)
    if (!truth) {
      problems.push(`${call}: 扩展侧没有这个工具`)
      continue
    }
    const extra = Object.keys(fields).filter(key => !(key in truth))
    const missing = Object.keys(truth).filter(key => !(key in fields))
    const requiredMismatch = Object.keys(fields)
      .filter(key => key in truth && fields[key] !== truth[key])
      .map(key => `${key}(桥:${fields[key]} 扩展:${truth[key]})`)
    if (extra.length) problems.push(`${call}: 桥多出参数 ${extra.join(', ')}（扩展会当没传）`)
    if (missing.length) problems.push(`${call}: 桥缺少参数 ${missing.join(', ')}`)
    if (requiredMismatch.length) problems.push(`${call}: 必填不一致 ${requiredMismatch.join(', ')}`)
  }

  assert.equal(bridge.size > 0, true, '没解析到任何桥侧工具，解析器可能失效了')
  assert.deepEqual(problems, [], `工具参数漂移:\n${problems.join('\n')}`)
})

test('关键工具的参数名锁定在扩展侧的写法上', { skip: bridgeSkip }, () => {
  const bridge = bridgeTools()
  assert.ok('expression' in bridge.get('browser_eval'), 'browser_eval 必须是 expression')
  assert.ok(!('code' in bridge.get('browser_eval')), 'browser_eval 不能再出现 code')
  assert.ok('keyword' in bridge.get('browser_network'), 'browser_network 必须是 keyword')
  assert.ok('path' in bridge.get('probe_http'), 'probe_http 必须是 path')
  assert.ok('timeoutMs' in bridge.get('probe_http'), 'probe_http 必须是 timeoutMs')
  assert.ok('cookies' in bridge.get('probe_http'), 'probe_http 必须支持 cookies')
})
