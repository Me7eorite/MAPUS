
const DEFAULT_MAX_STEPS = 40

export function createTurnState(options = {}) {
  const maxSteps = Number.isFinite(options.maxSteps) && options.maxSteps > 0 ? Math.trunc(options.maxSteps) : DEFAULT_MAX_STEPS
  return {
    maxSteps,
    step: 0,
    text: '',
    reasoning: '',
    streamedText: '',
    streamedReasoning: '',
    streamKey: '',
    streamIndex: -1,
    streamStep: 0,
    reasoningStreamed: false,
    usage: null,
    endReason: null,
    toolCalls: 0,
  }
}

export function mergeUsage(total, next) {
  if (!next || typeof next !== 'object') return total
  const out = { ...(total || {}) }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = (Number(out[key]) || 0) + value
  }
  return out
}

export function normalizeEndReason(reason) {
  if (typeof reason === 'string' && reason) return reason
  if (reason && typeof reason === 'object' && typeof reason.kind === 'string' && reason.kind) return reason.kind
  return 'unknown'
}

function blocksOf(content, type) {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block && block.type === type && typeof block.text === 'string') out += block.text
  }
  return out
}

function unsettledTail(streamed, settled) {
  if (!settled) return ''
  if (!streamed) return settled
  if (settled.startsWith(streamed)) return settled.slice(streamed.length)
  return ''
}

export function translateStreamFrame(frame, state) {
  if (!frame || typeof frame !== 'object') return []
  const kind = frame.type
  if (kind === 'end') return []
  const key = `${frame.attemptId || ''}:${frame.revision === undefined ? '' : frame.revision}`
  if (kind === 'start') {
    state.streamKey = key
    state.streamIndex = -1
    state.streamedText = ''
    state.streamedReasoning = ''
    const step = Number(frame.step)
    if (Number.isFinite(step) && step > 0) state.streamStep = step
    return []
  }
  if (kind !== 'chunk') return []
  if (key !== state.streamKey) {
    state.streamKey = key
    state.streamIndex = -1
    state.streamedText = ''
    state.streamedReasoning = ''
  }
  const index = Number(frame.index)
  if (Number.isFinite(index)) {
    if (index <= state.streamIndex) return []
    state.streamIndex = index
  }
  const chunk = frame.chunk
  if (!chunk || typeof chunk !== 'object') return []
  const step = state.streamStep || state.step
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text) {
    state.text += chunk.text
    state.streamedText += chunk.text
    return [{ type: 'delta', text: chunk.text }]
  }
  if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text) {
    state.reasoning += chunk.text
    state.streamedReasoning += chunk.text
    state.reasoningStreamed = true
    return [{ type: 'reasoning', text: chunk.text, step }]
  }
  if (chunk.type === 'tool-call-delta') state.toolCalls += 1
  return []
}

export function translateSessionEvent(event, state) {
  if (!event || typeof event !== 'object') return []
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  switch (event.type) {
    case 'step/start': {
      const step = Number(data.step)
      state.step = Number.isFinite(step) && step > 0 ? step : state.step + 1
      return [{ type: 'step', index: state.step, total: state.maxSteps, used: Math.max(0, state.step - 1) }]
    }
    case 'assistant/chunk': {
      const chunk = data.chunk
      if (!chunk || typeof chunk !== 'object') return []
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text) {
        state.text += chunk.text
        state.streamedText += chunk.text
        return [{ type: 'delta', text: chunk.text }]
      }
      if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text) {
        state.reasoning += chunk.text
        state.streamedReasoning += chunk.text
        return [{ type: 'reasoning', text: chunk.text, step: state.step }]
      }
      if (chunk.type === 'tool-call-delta') {
        state.toolCalls += 1
      }
      return []
    }
    case 'assistant/message': {
      state.usage = mergeUsage(state.usage, data.usage)
      const content = data.message && data.message.content
      const out = []
      const reasoning = blocksOf(content, 'reasoning')
      const text = blocksOf(content, 'text')
      const moreThinking = state.reasoningStreamed ? '' : unsettledTail(state.streamedReasoning, reasoning)
      if (moreThinking) {
        state.reasoning += moreThinking
        out.push({ type: 'reasoning', text: moreThinking, step: state.step })
      }
      const moreText = unsettledTail(state.streamedText, text)
      if (moreText) {
        state.text += moreText
        out.push({ type: 'delta', text: moreText })
      }
      state.streamedText = ''
      state.streamedReasoning = ''
      state.reasoningStreamed = false
      return out
    }
    case 'turn/end': {
      state.endReason = normalizeEndReason(data.reason)
      return []
    }
    default:
      return []
  }
}

export function finishTurn(state, options = {}) {
  const reason = state.endReason || (options.failure ? 'error' : 'completed')
  const common = {
    answer: state.text,
    usage: state.usage,
    steps: state.step,
    budget: state.maxSteps,
    context: options.context || null,
  }
  if (reason === 'aborted' || reason === 'blocked') {
    return { type: 'aborted', ...common, message: reason === 'blocked' ? 'the turn was blocked' : 'aborted' }
  }
  if (reason === 'error' || options.failure) {
    const message = options.failure && options.failure.message ? options.failure.message : 'model request failed (check the dsh provider and key)'
    const cause = options.failure && options.failure.cause && options.failure.cause.message
    const detail = typeof cause === 'string' && cause && cause !== message ? `${message}: ${cause}` : message
    return { type: 'error', ...common, message: detail }
  }
  return {
    type: 'done',
    ...common,
    exhausted: reason === 'max-tokens',
    stuck: false,
  }
}
