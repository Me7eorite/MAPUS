
import { HOST_EVENT } from './protocol.js'

let counter = 0

export function nextTurnId(sessionId) {
  counter += 1
  return `t${counter}_${String(sessionId || '').slice(-6)}`
}

export class Turn {
  constructor({ id, sessionId, write, rpcTimeoutMs = 120_000, log = () => {} }) {
    this.id = id
    this.sessionId = sessionId
    this.rpcTimeoutMs = rpcTimeoutMs
    this.ended = false
    this.cancelled = false
    this.reason = null
    this.pending = new Map()
    this.log = log
    this.#write = write
    this.#endPromise = new Promise(resolve => {
      this.#resolveEnd = resolve
    })
    this.#turnPromise = new Promise(resolve => {
      this.#resolveTurn = resolve
    })
  }

  #write
  #resolveEnd
  #endPromise
  #resolveTurn
  #turnPromise

  get live() {
    return !this.ended
  }

  emit(event) {
    if (this.ended) return
    const ok = this.#write(event)
    if (!ok) this.abort('client-gone')
  }

  async rpc(call, args, signal) {
    if (this.ended) throw new Error('this turn has ended, the tool cannot run')
    if (signal && signal.aborted) throw new Error('tool call cancelled')
    counter += 1
    const id = `rpc${counter}`
    const timeoutMs = this.rpcTimeoutMs
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`browser execution timed out after ${Math.round(timeoutMs / 1000)}s: ${call}`))
      }, timeoutMs)
      const onAbort = () => {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error('tool call cancelled'))
      }
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        call,
        settle: payload => {
          clearTimeout(timer)
          if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
          this.pending.delete(id)
          if (payload && payload.ok === false) reject(new Error(payload.error || `${call} failed`))
          else resolve(payload ? payload.result : null)
        },
        fail: message => {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(new Error(message))
        },
      })
      this.emit({ type: HOST_EVENT.rpc, id, tool: call, args: args || {} })
    })
  }

  settle(id, payload) {
    const entry = this.pending.get(String(id || ''))
    if (!entry) return false
    entry.settle(payload || {})
    return true
  }

  abort(reason) {
    if (this.ended) return
    this.ended = true
    this.cancelled = true
    this.reason = reason
    for (const entry of this.pending.values()) entry.fail('the browser disconnected, the tool call was cancelled')
    this.pending.clear()
    this.#resolveEnd({ cancelled: true, reason })
  }

  end(reason = 'settled') {
    if (this.ended) return
    this.ended = true
    this.reason = reason
    for (const entry of this.pending.values()) entry.fail('the turn ended, pending tool calls were cancelled')
    this.pending.clear()
    this.#resolveEnd({ cancelled: false, reason })
  }

  whenEnded() {
    return this.#endPromise
  }

  markTurnEnd(reason) {
    this.turnReason = reason
    this.#resolveTurn(reason)
  }

  whenTurnEnded() {
    return this.#turnPromise
  }
}
