
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const SANDBOX_MODES = ['auto', 'inherit', 'read-only', 'workspace-write', 'danger-full-access']

export const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  port: 7355,
  token: '',
  provider: '',
  model: '',
  reasoningEffort: '',
  cwd: '',
  sessionPrefix: 'mapus',
  maxSteps: 40,
  rpcTimeoutMs: 120_000,
  allowRemote: false,
  systemPrompt: '',
  enableTools: true,
  enableHostTools: true,
  approvalPolicy: 'never',
  sandboxMode: 'auto',
}

export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : join(homedir(), '.dsh')
}

export function stateDir() {
  return join(dshHome(), 'mapus-bridge')
}

export function tokenFile() {
  return join(stateDir(), 'token')
}

export function readToken() {
  try {
    return readFileSync(tokenFile(), 'utf8').trim()
  } catch {
    return ''
  }
}

export function writeToken(token) {
  const dir = stateDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = tokenFile()
  writeFileSync(file, token + '\n', { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
  }
  return token
}

export function mintToken() {
  return randomBytes(16).toString('hex')
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function int(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const truncated = Math.trunc(numeric)
  return truncated < min || truncated > max ? fallback : truncated
}

function text(value, fallback) {
  return typeof value === 'string' ? value.trim() : fallback
}

function loopback(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

export function resolveConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const host = text(source.host, DEFAULT_CONFIG.host)
  const allowRemote = bool(source.allowRemote, DEFAULT_CONFIG.allowRemote)
  let tokenSource = 'config'
  let token = text(source.token, '')
  if (!token) {
    token = readToken()
    tokenSource = token ? 'file' : 'generated'
    if (!token) {
      token = mintToken()
      try {
        writeToken(token)
      } catch {
      }
    }
  }
  return {
    host,
    port: int(source.port, DEFAULT_CONFIG.port, 0, 65_535),
    token,
    tokenSource,
    provider: text(source.provider, DEFAULT_CONFIG.provider),
    model: text(source.model, DEFAULT_CONFIG.model),
    reasoningEffort: text(source.reasoningEffort, DEFAULT_CONFIG.reasoningEffort),
    cwd: text(source.cwd, DEFAULT_CONFIG.cwd),
    sessionPrefix: text(source.sessionPrefix, DEFAULT_CONFIG.sessionPrefix) || DEFAULT_CONFIG.sessionPrefix,
    maxSteps: int(source.maxSteps, DEFAULT_CONFIG.maxSteps, 1, 500),
    rpcTimeoutMs: int(source.rpcTimeoutMs, DEFAULT_CONFIG.rpcTimeoutMs, 1_000, 900_000),
    allowRemote,
    bindable: allowRemote || loopback(host),
    systemPrompt: typeof source.systemPrompt === 'string' ? source.systemPrompt : DEFAULT_CONFIG.systemPrompt,
    enableTools: bool(source.enableTools, DEFAULT_CONFIG.enableTools),
    enableHostTools: bool(source.enableHostTools, DEFAULT_CONFIG.enableHostTools),
    approvalPolicy: source.approvalPolicy === 'ask' ? 'ask' : DEFAULT_CONFIG.approvalPolicy,
    sandboxMode: SANDBOX_MODES.includes(source.sandboxMode) ? source.sandboxMode : DEFAULT_CONFIG.sandboxMode,
  }
}

export function hasStoredToken() {
  return existsSync(tokenFile())
}
