
import assert from 'node:assert/strict'
import test from 'node:test'

const { TOOLS, buildToolDefinition, PASSTHROUGH_TOOL, CATALOG_TOOL } = await import('../lib/tools.js')

let dshTools = null
try {
  dshTools = await import('@deepseek-ai/dsh-tools')
} catch {
  dshTools = null
}

const skip = dshTools ? false : '未解析到 @deepseek-ai/dsh-tools（插件目录缺 node_modules 软链）'

test('每个工具定义都能被真实的 defineTool 接受', { skip }, () => {
  for (const spec of TOOLS) {
    const definition = dshTools.defineTool(
      buildToolDefinition(spec, async () => ({ ok: true }), name => name),
    )
    assert.equal(definition.name, spec.name)
    assert.ok(definition.description.length > 4, `${spec.name} 缺描述`)
    assert.ok(definition.parameters, `${spec.name} 缺参数 schema`)
    assert.equal(typeof definition.execute, 'function')
  }
})

test('参数校验真的会拦住缺必填项与错类型', { skip }, async () => {
  const spec = TOOLS.find(tool => tool.name === 'mapus_dom_query')
  const definition = dshTools.defineTool(buildToolDefinition(spec, async () => 'x', name => name))
  await assert.rejects(() => definition.execute({}, {}), /selector/i)
  await assert.rejects(() => definition.execute({ selector: 123 }, {}), /selector/i)
  const ok = await definition.execute({ selector: 'input[type=password]' }, {})
  assert.deepEqual(ok, { ok: true, result: 'x' })
})

test('mapus_tool 会把箭头指向真实工具名', { skip }, async () => {
  const spec = TOOLS.find(tool => tool.name === PASSTHROUGH_TOOL)
  const seen = []
  const definition = dshTools.defineTool(
    buildToolDefinition(
      spec,
      async (call, args) => {
        seen.push({ call, args })
        return { hit: call }
      },
      name => (name === 'mapus_browser_click' ? 'browser_click' : name),
    ),
  )
  const value = await definition.execute({ name: 'mapus_browser_click', args: { ref: 'e3' } }, {})
  assert.deepEqual(seen, [{ call: 'browser_click', args: { ref: 'e3' } }])
  assert.deepEqual(value, { ok: true, result: { hit: 'browser_click' } })
})

test('工具抛错时转成 ok:false 的返回值，而不是让整轮崩掉', { skip }, async () => {
  const spec = TOOLS.find(tool => tool.name === 'mapus_page_context')
  const definition = dshTools.defineTool(
    buildToolDefinition(spec, async () => {
      throw new Error('the MAPUS side panel has no conversation in progress')
    }, name => name),
  )
  const value = await definition.execute({}, {})
  assert.equal(value.ok, false)
  assert.match(value.error, /side panel/)
})

test('目录工具在清单里且没有必填参数', { skip }, () => {
  const spec = TOOLS.find(tool => tool.name === CATALOG_TOOL)
  assert.ok(spec, 'mapus_catalog 必须注册给模型')
  assert.deepEqual(spec.parameters, {})
})
