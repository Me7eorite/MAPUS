import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-mapus-config-'))
process.env.DSH_HOME = sandbox

const { resolveConfig, tokenFile, readToken, writeToken, mintToken, DEFAULT_CONFIG } = await import('../lib/config.js')

test('首次解析自动生成 token 并落盘（0600）', () => {
  const config = resolveConfig({})
  assert.match(config.token, /^[0-9a-f]{32}$/)
  assert.equal(config.tokenSource, 'generated')
  assert.equal(readFileSync(tokenFile(), 'utf8').trim(), config.token)
  const mode = statSync(tokenFile()).mode & 0o777
  assert.equal(mode, 0o600, `token 文件权限应为 0600，实际 ${mode.toString(8)}`)
})

test('第二次解析沿用已保存的 token', () => {
  const first = readToken()
  const config = resolveConfig({})
  assert.equal(config.token, first)
  assert.equal(config.tokenSource, 'file')
})

test('patch 里显式给的 token 优先于文件', () => {
  const config = resolveConfig({ token: 'from-patch' })
  assert.equal(config.token, 'from-patch')
  assert.equal(config.tokenSource, 'config')
})

test('非法端口与越界数值回落到默认值而不是抛错', () => {
  const config = resolveConfig({ port: -5, maxSteps: -3, rpcTimeoutMs: 'abc' })
  assert.equal(config.port, DEFAULT_CONFIG.port)
  assert.equal(config.maxSteps, DEFAULT_CONFIG.maxSteps)
  assert.equal(config.rpcTimeoutMs, DEFAULT_CONFIG.rpcTimeoutMs)
})

test('port 0 保留为「由系统分配端口」', () => {
  assert.equal(resolveConfig({ port: 0 }).port, 0)
})

test('非回环地址默认拒绝绑定，allowRemote 才放行', () => {
  assert.equal(resolveConfig({ host: '0.0.0.0' }).bindable, false)
  assert.equal(resolveConfig({ host: '0.0.0.0', allowRemote: true }).bindable, true)
  assert.equal(resolveConfig({ host: 'localhost' }).bindable, true)
  assert.equal(resolveConfig({ host: '::1' }).bindable, true)
})

test('writeToken 覆盖写入并同样收紧权限', () => {
  const token = mintToken()
  writeToken(token)
  assert.equal(readToken(), token)
  assert.equal(statSync(tokenFile()).mode & 0o777, 0o600)
})
