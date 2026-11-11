import { setImmediate as yieldToLoop } from 'node:timers/promises'
import { canStream, isUnsupportedSearchFormat, scanLog } from './search-log.js'

const messageText = event => {
  const content = event.type === 'user/message' ? event.data?.content : event.data?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
}

function mustPropagate(error) {
  const seen = new Set()
  for (let cause = error; cause && !seen.has(cause); cause = cause.cause) {
    seen.add(cause)
    if (cause.name === 'AbortError' || ['SESSION_QUERY_ABORTED', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE', 'ENOSPC'].includes(cause.code)) return true
  }
  return false
}

async function readWithSignal(ctx, id, signal) {
  signal?.throwIfAborted()
  if (!signal) return ctx.sessionQuery.readSession(id)
  let onAbort
  try {
    // DSH readSession has no signal parameter. Stop waiting immediately on abort;
    // already-started host reads can finish, with no further scanning.
    return await Promise.race([ctx.sessionQuery.readSession(id), new Promise((_, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })])
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

export async function scanSessionMessages(ctx, { records, query, limit, signal }) {
  // Escape every metacharacter: punctuation and short CJK queries are literals.
  const pattern = new RegExp(query.replace(/[{}.*+?^$()|[\]\\]/g, '\\$&'), 'iu')
  const matchMessage = event => {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') return null
    const text = messageText(event)
    const match = pattern.exec(text)
    if (!match) return null
    const before = Array.from(text.slice(0, match.index))
    const after = Array.from(text.slice(match.index + match[0].length))
    return ((before.length > 48 ? '…' : '') + before.slice(-48).join('') + match[0]
      + after.slice(0, 96).join('') + (after.length > 96 ? '…' : '')).replace(/\s+/gu, ' ').trim()
  }
  const stop = new AbortController()
  const requestSignal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal
  const sessions = ctx.get?.('sessions')
  const persistence = ctx.get?.('sessionPersistence')
  const unsupportedFormat = Symbol('unsupported format')
  let unsupported = 0
  // Exclude unsupported cold logs before scheduling any stat/read/migration.
  // A live session already has a current logical representation in memory.
  records = records.filter(record => {
    if (record.live || sessions?.get(record.header.id) || !isUnsupportedSearchFormat(record)) return true
    unsupported++
    return false
  })
  async function scanOne(record) {
    await yieldToLoop(undefined, { signal: requestSignal })
    const id = record.header.id
    if (!record.live && !sessions?.get(id) && record.formatStatus === 'current' && persistence?.stat) {
      try {
        const durable = await persistence.stat(id, { signal: requestSignal })
        requestSignal.throwIfAborted()
        if (!sessions?.get(id) && isUnsupportedSearchFormat(durable)) return unsupportedFormat
        if (durable?.header.id === id && canStream(durable) && !sessions?.get(id)) {
          const snippet = await scanLog(durable, matchMessage, requestSignal)
          // The session may have been opened while the disk scan was in flight.
          if (!sessions?.get(id)) return snippet
        }
      } catch (error) {
        requestSignal.throwIfAborted()
        if (mustPropagate(error)) throw error
        if (error?.code === 'SEARCH_UNSUPPORTED_FORMAT' && !sessions?.get(id)) return unsupportedFormat
        // A generation may have moved, or a tail may be incomplete. Let the host
        // resolve it. If that also fails, this session is explicitly skipped.
      }
    }
    const snapshot = await readWithSignal(ctx, id, requestSignal)
    requestSignal.throwIfAborted()
    for (let i = 0; i < snapshot.events.length; i++) {
      if (i % 256 === 0) await yieldToLoop(undefined, { signal: requestSignal })
      const snippet = matchMessage(snapshot.events[i])
      if (snippet !== null) return snippet
    }
    return null
  }
  const hits = [], pending = new Map()
  let skipped = 0, scanned = 0, next = 0
  function fill() {
    // Limit speculative reads to the number of matches still needed, so even
    // limit:1 does not open sessions beyond its one look-ahead hit.
    while (next < records.length && pending.size < Math.min(4, limit + 1 - hits.length)) {
      requestSignal.throwIfAborted()
      const index = next++
      scanned++
      pending.set(index, scanOne(records[index]).then(snippet => ({ snippet }), error => {
        if (mustPropagate(error) || requestSignal.aborted) stop.abort(error)
        return { error }
      }))
    }
  }
  try {
    fill()
    // Consume in catalog order, irrespective of which file finishes first.
    for (let index = 0; pending.size; index++) {
      const result = await pending.get(index)
      pending.delete(index)
      requestSignal.throwIfAborted()
      if (result.error) skipped++
      else if (result.snippet === unsupportedFormat) unsupported++
      else if (result.snippet !== null) hits.push({ sessionId: records[index].header.id, snippet: result.snippet })
      if (hits.length > limit) break
      fill()
    }
    return { hits, skipped, unsupported, scanned, hasMore: hits.length > limit }
  } finally {
    stop.abort()
    await Promise.all(pending.values())
  }
}
