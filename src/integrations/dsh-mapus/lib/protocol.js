
export const PROTOCOL_VERSION = 1

export const ROUTES = {
  health: '/v1/health',
  catalog: '/v1/catalog',
  models: '/v1/models',
  turn: '/v1/turn',
  rpc: '/v1/rpc',
  cancel: '/v1/cancel',
  session: '/v1/session',
  shutdown: '/v1/shutdown',
}

export const HOST_EVENT = {
  hello: 'hello',
  start: 'start',
  step: 'step',
  delta: 'delta',
  reasoning: 'reasoning',
  rpc: 'rpc',
  done: 'done',
  error: 'error',
  aborted: 'aborted',
}

export const CLIENT_EVENT = {
  rpc: 'rpc',
}

export const AUTH_HEADERS = ['authorization', 'x-mapus-token']

export function line(value) {
  try {
    return JSON.stringify(value) + '\n'
  } catch {
    return JSON.stringify({ type: 'error', message: 'event cannot be serialized to JSON' }) + '\n'
  }
}
