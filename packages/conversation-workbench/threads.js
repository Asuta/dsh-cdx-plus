import { randomUUID } from 'node:crypto'
import { asId, boundedText } from './store.js'
import { scanSessionMessages } from './direct-search.js'

const main = record => record.header.origin !== 'subagent' && record.header.origin?.kind !== 'subagent'
const holder = (ctx, sessionId) => ctx.workspaceRegistry.list().find(w => w.sessionIds.includes(sessionId))
const messageTypes = new Set(['user/message', 'assistant/message', 'session/title'])
const turnMessageTypes = new Set(['user/message', 'assistant/message'])
const turnOutputTypes = new Set(['tool/call', 'tool/result'])

const workspaceIds = ctx => new Map(ctx.workspaceRegistry.list().flatMap(w => w.sessionIds.map(id => [id, w.id])))

export async function listThreads(ctx, { archived = false, limit = 50, query = '', workspaceId, signal, all = false } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 150) throw new Error('limit must be between 1 and 150')
  if (typeof query !== 'string' || query.length > 256) throw new Error('Invalid query')
  const workspace = workspaceId === undefined ? undefined : ctx.workspaceRegistry.get(workspaceId)
  if (workspaceId !== undefined && !workspace) throw new Error('Workspace not found')
  const members = workspace ? new Set(workspace.sessionIds) : null
  const needle = query.trim().toLocaleLowerCase()
  const [catalog, listed] = await Promise.all([
    ctx.sessionQuery.listSessions(signal),
    ctx.sessionController.list({}, signal ?? new AbortController().signal),
  ])
  const records = catalog.filter(main)
    .filter(r => ctx.workspaceRegistry.archivedSessionIds.includes(r.header.id) === archived)
    .filter(r => !members || members.has(r.header.id))
  if (workspace) {
    const order = new Map(workspace.sessionIds.map((id, index) => [id, index]))
    records.sort((a, b) => order.get(a.header.id) - order.get(b.header.id))
  }
  const candidates = all || needle ? records : records.slice(0, limit)
  // Listing and title search both use cached projections; neither opens cold logs.
  const summaries = new Map(listed.items
    .map(item => [item.sessionId, item]))
  const workspaces = workspaceIds(ctx)
  const pins = new Map(ctx.workspaceRegistry.pinnedSessionIds?.map((id, index) => [id, index + 1]) ?? [])
  const rows = candidates.map(r => ({
    sessionId: r.header.id, title: typeof summaries.get(r.header.id)?.projections?.values?.title === 'string' ? summaries.get(r.header.id).projections.values.title : null,
    cwd: r.header.cwd ?? null, workspaceId: workspaces.get(r.header.id) ?? null,
    createdAt: r.header.createdAt ?? null, updatedAt: r.header.updatedAt ?? null,
    parentSessionId: r.header.parentSession ?? null, live: r.live,
    status: summaries.has(r.header.id) ? summaries.get(r.header.id).running ? 'running' : 'idle' : 'unknown',
    pinned: pins.has(r.header.id), pinnedIndex: pins.get(r.header.id) ?? null,
    summary: (() => { const turn = summaries.get(r.header.id)?.projections?.values?.turnOutline?.at(-1); return turn?.response || turn?.prompt || null })(),
  }))
  if (!needle) return all ? rows : rows.slice(0, limit)
  const score = value => {
    const at = String(value ?? '').toLocaleLowerCase().indexOf(needle)
    return at === 0 ? 3 : at > 0 ? 2 : 0
  }
  return rows.map((row, i) => ({ row, score: Math.max(score(row.title) * 3, score(row.cwd) * 2, score(row.sessionId)), i }))
    .filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, all ? undefined : limit).map(hit => hit.row)
}

export async function listThreadsPage(ctx, { archived = false, limit = 50, query = '', workspaceId, cursor, signal } = {}) {
  const rows = await listThreads(ctx, { archived, limit, query, workspaceId, signal, all: true })
  let start = 0
  if (cursor !== undefined) {
    let parsed
    try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) } catch { throw new Error('Invalid list cursor') }
    if (parsed?.archived !== archived || parsed?.query !== query.trim() || parsed?.workspaceId !== (workspaceId ?? null)) throw new Error('List cursor does not match the filters')
    start = rows.findIndex(row => row.sessionId === parsed.after) + 1
    if (!start) throw new Error('List cursor is stale')
  }
  const items = rows.slice(start, start + limit)
  const nextCursor = start + items.length < rows.length
    ? Buffer.from(JSON.stringify({ archived, query: query.trim(), workspaceId: workspaceId ?? null, after: items.at(-1).sessionId })).toString('base64url')
    : null
  return { items, nextCursor, hasMore: nextCursor !== null }
}

export async function searchThreads(ctx, { query, limit = 20, workspaceId, cursor: pageCursor, signal } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 256) throw new Error('query must be 1 to 256 characters')
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('limit must be between 1 and 20')
  const workspace = workspaceId === undefined ? undefined : ctx.workspaceRegistry.get(workspaceId)
  if (workspaceId !== undefined && !workspace) throw new Error('Workspace not found')
  let after
  if (pageCursor !== undefined) {
    let page
    try { page = JSON.parse(Buffer.from(pageCursor, 'base64url').toString('utf8')) } catch { throw new Error('Invalid search cursor') }
    if (page?.query !== query.trim() || page?.workspaceId !== (workspaceId ?? null)) throw new Error('Search cursor does not match the query')
    if (page.backend !== 'direct-scan') throw new Error('Search backend changed; restart from the first page')
    if (typeof page.after !== 'string' || !page.after) throw new Error('Invalid search cursor')
    after = page.after
  }
  const requestSignal = signal ?? new AbortController().signal
  requestSignal.throwIfAborted()
  const [listed, records] = await Promise.all([
    ctx.sessionController.list({}, requestSignal),
    ctx.sessionQuery.listSessions(requestSignal),
  ])
  requestSignal.throwIfAborted()
  const titles = new Map(listed.items.map(item => [item.sessionId, item.projections?.values?.title]))
  const workspaces = workspaceIds(ctx)
  const archived = new Set(ctx.workspaceRegistry.archivedSessionIds)
  const allowedIds = workspace ? new Set(workspace.sessionIds) : new Set([...titles.keys(), ...workspaces.keys(), ...archived])
  // A creation-time order stays stable when messages arrive between page requests.
  const candidates = records.filter(main).filter(record => allowedIds.has(record.header.id)).sort((a, b) =>
    (b.header.createdAt ?? 0) - (a.header.createdAt ?? 0) || a.header.id.localeCompare(b.header.id))
  let start = 0
  if (after !== undefined) {
    start = candidates.findIndex(record => record.header.id === after) + 1
    if (!start) throw new Error('Search cursor is stale; restart from the first page')
  }
  const found = await scanSessionMessages(ctx, { records: candidates.slice(start), query: query.trim(), limit, signal: requestSignal })
  const sessions = new Map(candidates.map(record => [record.header.id, record]))
  const items = found.hits.slice(0, limit).map(hit => {
    const record = sessions.get(hit.sessionId)
    const title = titles.get(hit.sessionId)
    return {
      ...hit, title: typeof title === 'string' ? title : null,
      cwd: record.header.cwd ?? null, workspaceId: workspaces.get(hit.sessionId) ?? null,
      archived: archived.has(hit.sessionId),
      createdAt: record.header.createdAt ?? null, updatedAt: record.header.updatedAt ?? null,
    }
  })
  const nextCursor = found.hasMore ? Buffer.from(JSON.stringify({ query: query.trim(), workspaceId: workspaceId ?? null, backend: 'direct-scan', after: items.at(-1).sessionId })).toString('base64url') : null
  const skippedSessions = found.skipped + found.unsupported
  const messages = []
  if (found.unsupported) messages.push(`${found.unsupported} sessions use unsupported storage formats and were intentionally excluded without reading or migrating their histories. Retrying the same search will not include them.`)
  if (found.skipped) messages.push(`${found.skipped} sessions could not be read; results do not cover their contents.`)
  return { items, hasMore: nextCursor !== null, nextCursor, searchBackend: 'direct-scan',
    scannedSessions: found.scanned, skippedSessions, unsupportedFormatSessions: found.unsupported,
    unreadableSessions: found.skipped, incomplete: skippedSessions > 0,
    status: skippedSessions ? 'partial' : 'ready',
    ...(messages.length ? { message: messages.join(' ') } : {}),
  }
}

export async function requireMainThread(ctx, sessionId) {
  asId(sessionId, 'sessionId')
  const row = (await ctx.sessionQuery.listSessions()).find(r => r.header.id === sessionId)
  if (!row || !main(row)) throw new Error('Main conversation not found')
  return row
}

const serialize = (event, maxChars) => {
  const data = JSON.stringify(event.data)
  return { seq: event.seq, type: event.type, time: event.time, data: data.slice(0, maxChars), ...(data.length > maxChars ? { truncated: true, originalChars: data.length } : {}) }
}

const bounded = (value, maxChars) => typeof value === 'string'
  ? { text: value.slice(0, maxChars), truncated: value.length > maxChars, ...(value.length > maxChars ? { originalChars: value.length } : {}) }
  : null

const structuredItem = (event, maxChars) => {
  const item = { seq: event.seq, type: event.type, time: event.time }
  if (event.type === 'user/message' || event.type === 'assistant/message') {
    const source = event.type === 'user/message' ? event.data?.content : event.data?.message?.content
    const content = Array.isArray(source) ? source : typeof source === 'string' ? [{ type: 'text', text: source }] : []
    return { ...item, content: content.map(block => block?.type === 'text'
      ? { type: 'text', ...bounded(block.text, maxChars) }
      : { type: block?.type ?? 'unknown', ...(typeof block?.url === 'string' ? { url: block.url } : {}), ...(typeof block?.path === 'string' ? { path: block.path } : {}) }),
      ...(event.data?.source?.kind ? { source: event.data.source.kind } : {}) }
  }
  if (event.type === 'tool/call' || event.type === 'tool/result') {
    return { ...item, name: event.data?.name ?? event.data?.tool ?? null, callId: event.data?.callId ?? null,
      ...(event.type === 'tool/result' ? { output: bounded(JSON.stringify(event.data), maxChars) } : { input: bounded(JSON.stringify(event.data), maxChars) }) }
  }
  return item
}

const compactItem = (event, maxChars) => {
  if (!turnMessageTypes.has(event.type)) return structuredItem(event, maxChars)
  const source = event.type === 'user/message' ? event.data?.content : event.data?.message?.content
  const blocks = Array.isArray(source) ? source : typeof source === 'string' ? [{ type: 'text', text: source }] : []
  let remaining = maxChars
  const content = []
  for (const block of blocks) {
    if (remaining <= 0 || content.length >= 20) break
    if (block?.type === 'text') {
      const text = bounded(block.text, remaining)
      if (text) { content.push({ type: 'text', ...text }); remaining -= text.text.length }
    } else content.push({ type: block?.type ?? 'unknown',
      ...(typeof block?.path === 'string' ? { path: block.path.slice(0, 512) } : {}),
      ...(typeof block?.url === 'string' && !block.url.startsWith('data:') ? { url: block.url.slice(0, 512) } : {}) })
  }
  return { seq: event.seq, type: event.type, time: event.time, content,
    ...(content.length < blocks.length ? { truncated: true, omittedContentBlocks: blocks.length - content.length } : {}) }
}

export async function readThread(ctx, { sessionId, limit = 20, turnLimit, cursor, compact = true, includeOutputs = false, maxOutputCharsPerItem }, signal) {
  if (typeof compact !== 'boolean') throw new Error('compact must be a boolean')
  if (typeof includeOutputs !== 'boolean') throw new Error('includeOutputs must be a boolean')
  if (maxOutputCharsPerItem !== undefined && (!Number.isInteger(maxOutputCharsPerItem) || maxOutputCharsPerItem < 128 || maxOutputCharsPerItem > 12000)) throw new Error('maxOutputCharsPerItem must be between 128 and 12000')
  const legacyEvents = !compact && turnLimit === undefined && cursor === undefined
  if (legacyEvents && (!Number.isInteger(limit) || limit < 1 || limit > 50)) throw new Error('limit must be between 1 and 50')
  turnLimit ??= compact ? 1 : 5
  if (!Number.isInteger(turnLimit) || turnLimit < 1 || turnLimit > 10) throw new Error('turnLimit must be between 1 and 10')
  const maxChars = maxOutputCharsPerItem ?? (compact ? 2000 : 3000)
  signal?.throwIfAborted()
  await requireMainThread(ctx, sessionId)
  signal?.throwIfAborted()
  // Read the full log: readSurface omits turn boundaries and replaced history.
  const snapshot = await ctx.sessionQuery.readSession(sessionId)
  signal?.throwIfAborted()
  const selectedTypes = includeOutputs ? new Set([...messageTypes, ...turnOutputTypes]) : messageTypes
  const messages = snapshot.events.filter(e => selectedTypes.has(e.type))
  if (legacyEvents) return { sessionId, total: messages.length, events: messages.slice(-limit).map(e => serialize(e, maxOutputCharsPerItem ?? 6000)) }
  const turns = []
  let current = null
  for (const event of snapshot.events) {
    if (event.type === 'turn/start') {
      current = { startSeq: event.seq, startedAt: event.time, completedAt: null, status: 'running', error: null, raw: [] }
      turns.push(current)
    } else if (turnMessageTypes.has(event.type)) {
      if (!current || current.completedAt !== null) {
        current = { startSeq: event.seq, startedAt: event.time, completedAt: null, status: 'unknown', error: null, raw: [] }
        turns.push(current)
      }
      current.raw.push(event)
    } else if (includeOutputs && turnOutputTypes.has(event.type) && current) {
      current.raw.push(event)
    } else if (event.type === 'turn/end' && current) {
      current.completedAt = event.time
      current.status = event.data?.reason?.kind ?? 'completed'
      if (event.data?.reason?.kind === 'error') current.error = {
        code: event.data.reason.error?.code ?? null,
        message: bounded(event.data.reason.error?.message, maxChars),
      }
    }
  }
  const readable = turns.filter(turn => turn.raw.length)
  let end = readable.length
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !/^[0-9]+$/.test(cursor)) throw new Error('Invalid cursor')
    end = readable.findIndex(turn => String(turn.startSeq) === cursor)
    if (end < 0) throw new Error('Unknown cursor for conversation')
  }
  const selected = readable.slice(Math.max(0, end - turnLimit), end).reverse()
  // Bound an entire compact page, including unusually long single turns. Keep
  // the newest items and explicitly report omissions; compact:false is lossless
  // with respect to item count and retains the legacy event representation.
  let remaining = 40000
  const page = selected.map(({ raw, ...turn }) => {
    const items = []
    if (compact) {
      for (let i = raw.length - 1; i >= 0; i--) {
        const item = compactItem(raw[i], maxChars)
        const size = JSON.stringify(item).length
        if (size > remaining) break
        remaining -= size
        items.unshift(item)
      }
    } else for (const event of raw) items.push(structuredItem(event, maxChars))
    return { ...turn, durationMs: turn.completedAt === null ? null : turn.completedAt - turn.startedAt, items,
      ...(compact ? (items.length < raw.length ? { truncated: true, totalItems: raw.length, omittedItems: raw.length - items.length } : {})
        : { events: raw.map(event => serialize(event, maxChars)) }) }
  })
  const hasMore = end > page.length
  return {
    sessionId, total: messages.length, totalTurns: readable.length,
    page: { order: 'newest_first', limit: turnLimit, hasMore, nextCursor: hasMore ? String(page.at(-1).startSeq) : null,
      ...(compact && page.some(turn => turn.truncated) ? { truncated: true, message: 'Some earlier items in these turns were omitted. Use compact:false to read all items; nextCursor moves to older turns.' } : {}) },
    turns: page, ...(!compact ? { events: page.flatMap(turn => turn.events) } : {}),
  }
}

export async function waitThreads(ctx, { sessionIds, targets, timeoutMs = 120000 }, signal) {
  const requested = targets ?? sessionIds.map(sessionId => ({ sessionId }))
  const ids = new Set(requested.map(target => target.sessionId))
  const statuses = new Map()
  const errors = []
  const cursors = new Map()
  const after = new Map(requested.map(target => [target.sessionId, target.afterCursor]))
  let wake
  const cursorFor = row => String(row.projections?.values?.turnOutline?.at(-1)?.seq ?? row.updatedAt ?? 0)
  const unsubscribe = ctx.on('api-session/status', (sessionId, running) => {
    if (!ids.has(sessionId)) return
    statuses.set(sessionId, Boolean(running))
    if (!running) wake?.(sessionId)
  })
  let timer
  let onAbort
  try {
    const listed = await ctx.sessionController.list({}, signal ?? new AbortController().signal)
    const rows = new Map(listed.items.map(item => [item.sessionId, item]))
    for (const sessionId of ids) {
      if (!rows.has(sessionId)) { errors.push({ sessionId, error: 'Target conversation is not visible in the session catalog' }); continue }
      if (!statuses.has(sessionId)) statuses.set(sessionId, Boolean(rows.get(sessionId).running))
      cursors.set(sessionId, cursorFor(rows.get(sessionId)))
    }
    const result = (winner, timedOut = false) => ({
      items: [...ids].filter(id => rows.has(id)).map(sessionId => ({ sessionId, running: statuses.get(sessionId), found: true,
        cursor: cursors.get(sessionId), title: rows.get(sessionId).projections?.values?.title ?? null,
        summary: (() => { const turn = rows.get(sessionId).projections?.values?.turnOutline?.at(-1); return turn?.response || turn?.prompt || null })(),
        updatedAt: rows.get(sessionId).updatedAt ?? null })),
      errors, completedSessionId: winner, timedOut, needsAttentionSupported: false,
    })
    const alreadyIdle = [...ids].find(id => rows.has(id) && !statuses.get(id) && after.get(id) !== cursors.get(id))
    if (alreadyIdle) return result(alreadyIdle)
    const duration = Math.max(0, Math.min(120000, timeoutMs))
    if (!duration) return result(null, true)
    const winner = await new Promise((resolve, reject) => {
      wake = sessionId => {
        void ctx.sessionController.list({}, signal ?? new AbortController().signal).then(latest => {
          const row = latest.items.find(item => item.sessionId === sessionId)
          if (!row) throw new Error('Target conversation is no longer visible in the session catalog')
          rows.set(sessionId, row)
          const cursor = cursorFor(row)
          cursors.set(sessionId, cursor)
          if (after.get(sessionId) !== cursor) resolve(sessionId)
        }).catch(reject)
      }
      timer = setTimeout(() => resolve(null), duration)
      onAbort = () => reject(signal.reason ?? new Error('Wait aborted'))
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
      const justIdle = [...ids].find(id => rows.has(id) && !statuses.get(id) && after.get(id) !== cursors.get(id))
      if (justIdle) resolve(justIdle)
    })
    return result(winner, winner === null)
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    unsubscribe()
  }
}

export async function createThread(ctx, { workspaceId, cwd, prompt }, exec) {
  if (workspaceId && cwd) throw new Error('workspaceId and cwd are mutually exclusive')
  if (workspaceId && !ctx.workspaceRegistry.get(workspaceId)) throw new Error('Workspace not found')
  if (!workspaceId && !cwd) {
    const caller = exec?.agent?.session
    if (!caller) throw new Error('An agent-bound caller or explicit workspaceId/cwd is required')
    workspaceId = holder(ctx, caller.id)?.id
    cwd = workspaceId ? undefined : caller.header.cwd
  }
  const text = prompt === undefined ? undefined : boundedText(prompt, 'prompt', 30000)
  // DSH may reuse an existing blank session unless an unused identity is supplied.
  const created = await ctx.sessionController.create(workspaceId
    ? { workspaceId, sessionId: 'session-' + randomUUID() }
    : { cwd, sessionId: 'session-' + randomUUID() })
  if (text === undefined) return { ...created, created: true, promptAccepted: false }
  const requestId = randomUUID()
  try {
    const receipt = await ctx.sessionController.prompt({ requestId, sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text }] }, exec?.signal ?? new AbortController().signal)
    return { ...created, created: true, promptAccepted: receipt.accepted === true, requestId }
  } catch (error) {
    throw new Error('Conversation ' + created.sessionId + ' was created, but its initial prompt failed: ' + String(error?.message ?? error))
  }
}
