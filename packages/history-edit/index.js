import { randomUUID } from 'node:crypto'
import {
  appendReplacement,
  buildEditPlan,
  createUserMessage,
  eventsOf,
  HistoryEditError,
  sameNumbers,
  surfaceOf,
} from './core.js'

export const inject = ['webServer', 'connection', 'agents', 'sessions', 'attachments']

const API_PATH = '/history-edit/api'
const MAX_REQUEST_BYTES = 20 * 1024 * 1024
const TRIGGER_KIND = 'dsh-history-edit-trigger'
const TRIGGER_VERSION = 1
const activeTransactions = new WeakMap()
const recoveringAgents = new WeakSet()

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) throw new HistoryEditError('请求内容过大。', 413, 'request-too-large')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch { throw new HistoryEditError('请求格式无效。', 400, 'invalid-request') }
}

function flush(ctx, agent) {
  return Promise.resolve(ctx.sessions.flush(agent.session)).then(ok => {
    if (ok === false) throw new Error('会话检查点未能写入磁盘。')
  })
}

function ownsAgent(ctx, agent) {
  return ctx.agents.get(agent.id) === agent
}

function pending(agent) {
  return [...(agent.inbox.nextStep ?? []), ...(agent.inbox.nextTurn ?? [])]
}

function nextTurnNumber(agent) {
  let latest = 0
  for (const event of eventsOf(agent.session)) {
    if (event.type === 'turn/start' && Number.isSafeInteger(event.data?.turn)) latest = Math.max(latest, event.data.turn)
  }
  return latest + 1
}

function triggerSource(value) {
  if (!value || typeof value !== 'object' || value.kind !== TRIGGER_KIND || value.version !== TRIGGER_VERSION) return null
  if (typeof value.transactionId !== 'string' || !value.transactionId || !Number.isSafeInteger(value.targetSeq)) return null
  if (!Array.isArray(value.surfaceNodes) || value.surfaceNodes.length === 0 || !value.surfaceNodes.every(Number.isSafeInteger)) return null
  const followup = value.followup
  if (!followup || followup.role !== 'user' || typeof followup.id !== 'string' ||
      followup.source?.kind !== 'user' || !Array.isArray(followup.content) || followup.content.length === 0 ||
      followup.content.some(block =>
        block?.type === 'text'
          ? typeof block.text !== 'string'
          : block?.type !== 'image' || block.attachment === undefined || block.attachment === null
      ) || !followup.content.some(block => block.type === 'image' || block.text.trim())) return null
  return value
}

function isTrigger(message) {
  return triggerSource(message?.source) !== null
}

function currentStepTrigger(agent, turn, step, txid) {
  const events = eventsOf(agent.session)
  let start = -1
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type === 'step/start' && event.data?.turn === turn && event.data?.step === step) {
      start = i
      break
    }
  }
  if (start < 0) return undefined
  return events.slice(start + 1).find(event => event.type === 'user/message' &&
    isTrigger(event.data) && (!txid || event.data.source.transactionId === txid))?.data
}

function requestConfig(agent) {
  const events = eventsOf(agent.session)
  let previous
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'request/header') {
      previous = events[i].data?.header?.config
      break
    }
  }
  const options = agent.options ?? {}
  const maxTokens = options.maxTokens ?? previous?.maxTokens
  const reasoningEffort = options.reasoningEffort ?? previous?.reasoningEffort
  return {
    provider: options.provider ?? previous?.provider ?? 'history-edit',
    model: options.model ?? previous?.model ?? 'surface-replacement',
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

function replacementNodes(agent, source, trigger) {
  const current = surfaceOf(agent.session)
  const base = source.surfaceNodes
  if (current.length < base.length || !sameNumbers(current.slice(0, base.length), base)) {
    throw new HistoryEditError('对话内容在编辑期间发生变化，请刷新后重试。', 409, 'source-changed')
  }
  const events = eventsOf(agent.session)
  const extra = current.slice(base.length)
  if (extra.some(seq => {
    const event = events.find(row => row.seq === seq)
    return event?.type !== 'user/message' || event.data?.id !== trigger.id ||
      event.data?.source?.transactionId !== source.transactionId
  })) throw new HistoryEditError('编辑期间有新消息进入，请稍后重试。', 409, 'source-changed')
  const index = current.indexOf(source.targetSeq)
  if (index < 0) throw new HistoryEditError('原消息已不在当前对话中，请刷新后重试。', 409, 'source-changed')
  return current.slice(index)
}

function appendTriggerReplacement(agent, source, trigger, turn, step) {
  const tailNodes = replacementNodes(agent, source, trigger)
  return appendReplacement(agent, { messageSeq: source.targetSeq, tailNodes }, turn, step)
}

function wakeWithRemovedToken(agent) {
  const token = {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: 'history-edit-wake' }],
    source: { kind: 'plugin:dsh-asuta-history-edit' },
  }
  agent.send(token, 'next-turn', true)
  agent.inbox.remove(token.id)
}

function isSameMessageIn(events, messageId) {
  return events.some(event => event.type === 'user/message' && event.data?.id === messageId)
}

async function queueEdited(ctx, agent, state) {
  await agent.runMaintenance(async signal => {
    signal.throwIfAborted()
    if (!ownsAgent(ctx, agent)) throw new HistoryEditError('对话已卸载，请重新打开后再试。')
    agent.inbox.remove(state.trigger.id)
    const alreadyPending = pending(agent).some(message => message.id === state.source.followup.id)
    const alreadySent = isSameMessageIn(eventsOf(agent.session), state.source.followup.id)
    if (!alreadyPending && !alreadySent) agent.inbox.splice('next-turn', 0, 0, [state.source.followup])
    if (!alreadySent) {
      await flush(ctx, agent)
      wakeWithRemovedToken(agent)
      await flush(ctx, agent)
    }
  })
}

async function cleanTrigger(ctx, agent, state) {
  if (!state?.trigger?.id) return
  agent.inbox.remove(state.trigger.id)
  try { await flush(ctx, agent) }
  catch (error) { ctx.logger.warn('history-edit: trigger cleanup failed for ' + agent.id + ': ' + String(error)) }
}

function liveStateFromTrigger(trigger, orphan = false) {
  const source = triggerSource(trigger?.source)
  if (!source) return null
  return { source, trigger, outcome: undefined, orphan }
}

async function guardRequest(ctx, payload, next) {
  const agent = payload?.agent
  if (!agent) return next()
  let state = activeTransactions.get(agent)
  const stepTrigger = currentStepTrigger(agent, payload.turn, payload.step, state?.source.transactionId)
  if (!state && stepTrigger) {
    state = liveStateFromTrigger(stepTrigger, true)
    if (state) state.expectedTurn = payload.turn
    if (state) activeTransactions.set(agent, state)
  }
  if (!state) return next()

  try {
    const matchingTrigger = stepTrigger?.id === state.trigger.id ||
      (!stepTrigger && state.expectedTurn === payload.turn && payload.step === 1)
    if (!matchingTrigger) {
      throw new HistoryEditError('无法确认内部编辑请求，已安全取消。', 409, 'trigger-mismatch')
    }
    const unrelatedPending = pending(agent).some(message => message.id !== state.trigger.id)
    if (unrelatedPending) throw new HistoryEditError('编辑期间有新消息进入，请稍后重试。', 409, 'source-changed')
    state.replacementSeq = appendTriggerReplacement(agent, state.source, state.trigger, payload.turn, payload.step)
    state.outcome = { ok: true }
  } catch (error) {
    state.outcome = { ok: false, error }
  } finally {
    try { agent.cancel({ kind: 'hook', reason: 'history-edit' }, { keepInbox: true }) }
    catch (error) { ctx.logger.error('history-edit: could not cancel internal request for ' + agent.id + ': ' + String(error)) }
  }

  if (state.orphan) {
    void agent.whenIdle().then(async () => {
      try {
        if (state.outcome?.ok) {
          await flush(ctx, agent)
          activeTransactions.delete(agent)
          await queueEdited(ctx, agent, state)
        } else {
          await cleanTrigger(ctx, agent, state)
          activeTransactions.delete(agent)
        }
      } catch (error) {
        ctx.logger.error('history-edit: recovery failed for ' + agent.id + ': ' + String(error))
      }
    })
  }
  return requestConfig(agent)
}

function hasReplacement(events, source, triggerSeq) {
  const targetIndex = source.surfaceNodes.indexOf(source.targetSeq)
  if (targetIndex < 0) return false
  const expected = source.surfaceNodes.slice(targetIndex)
  return events.some(event => event.seq > triggerSeq && event.type === 'system/message' &&
    event.surfaceOp?.op === 'replace' && event.surfaceOp.startSeq === source.targetSeq &&
    Array.isArray(event.sourceEventSeqs) && expected.every((seq, i) => event.sourceEventSeqs[i] === seq))
}

async function recoverAgent(ctx, agent) {
  if (recoveringAgents.has(agent) || activeTransactions.has(agent) || agent.status !== 'idle') return
  recoveringAgents.add(agent)
  try {
    const events = eventsOf(agent.session)
    const records = new Map()
    for (const event of events) {
      if (event.type !== 'agent/inbox/spliced' || !Array.isArray(event.data?.inserted)) continue
      for (const message of event.data.inserted) {
        if (isTrigger(message)) records.set(message.source.transactionId, { source: message.source, trigger: message, seq: event.seq })
      }
    }
    for (const record of records.values()) {
      const alreadySent = isSameMessageIn(events, record.source.followup.id)
      const followupPending = pending(agent).some(message => message.id === record.source.followup.id)
      if (alreadySent) continue
      const replaced = hasReplacement(events, record.source, record.seq)
      if (replaced) {
        const marker = events.find(event => event.seq > record.seq && event.type === 'system/message' &&
          event.surfaceOp?.op === 'replace' && event.surfaceOp.startSeq === record.source.targetSeq)
        const state = { ...record, expectedTurn: nextTurnNumber(agent), outcome: { ok: true }, replacementSeq: marker?.seq }
        activeTransactions.set(agent, state)
        if (followupPending) wakeWithRemovedToken(agent)
        else await queueEdited(ctx, agent, state)
        activeTransactions.delete(agent)
        return
      }
      if (followupPending) continue
      const queued = pending(agent).find(message => isTrigger(message) && message.source.transactionId === record.source.transactionId)
      if (!queued) continue
      const state = { ...record, trigger: queued, expectedTurn: nextTurnNumber(agent), orphan: true }
      activeTransactions.set(agent, state)
      wakeWithRemovedToken(agent)
      return
    }
  } catch (error) {
    ctx.logger.error('history-edit: orphan recovery failed for ' + agent.id + ': ' + String(error))
  } finally {
    recoveringAgents.delete(agent)
  }
}

async function editMessage(ctx, payload) {
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
  const agent = sessionId && ctx.agents.get(sessionId)
  if (!agent) throw new HistoryEditError('请先打开要编辑的对话，再重试。', 404, 'session-not-live')
  if (agent.status !== 'idle' || activeTransactions.has(agent)) {
    throw new HistoryEditError('请等待当前回复完成后再编辑。', 409, 'session-busy')
  }

  let state
  try {
    await agent.runMaintenance(async signal => {
      signal.throwIfAborted()
      if (!ownsAgent(ctx, agent)) throw new HistoryEditError('对话已切换或卸载，请重新打开后重试。')
      if (agent.status !== 'maintenance' && agent.status !== 'idle') throw new HistoryEditError('请等待当前回复完成后再编辑。')
      if (pending(agent).length) throw new HistoryEditError('请先发送或清除待处理消息，再编辑历史内容。')

      const uploads = payload.images ?? []
      if (!Array.isArray(uploads) || uploads.length > 12 || uploads.some(image =>
        !image || typeof image.data !== 'string' || typeof image.mediaType !== 'string' ||
        !image.mediaType.startsWith('image/') || (image.name !== undefined && typeof image.name !== 'string')
      )) {
        throw new HistoryEditError('新增图片格式无效，请重新选择图片。', 400, 'invalid-images')
      }
      const plan = buildEditPlan(agent, {
        ...payload,
        removeImageIndices: payload.removeImageIndices ?? [],
        addedImageCount: uploads.length,
      })
      if (plan.imageCount + uploads.length > 12) {
        throw new HistoryEditError('单条消息最多包含 12 张图片。', 400, 'too-many-images')
      }
      if (uploads.length > 0) {
        const admitted = await ctx.attachments.admitPromptContent(uploads.map(image => ({
          type: 'image', data: image.data, mediaType: image.mediaType,
          ...(image.name === undefined ? {} : { name: image.name }),
        })))
        const additions = admitted.filter(block => block.type === 'image')
        if (additions.length !== uploads.length) throw new Error('新增图片未能完成存储。')
        plan.content = [...plan.content, ...additions]
        plan.imageCount += additions.length
      }
      const followup = createUserMessage(plan.content)
      const transactionId = randomUUID()
      const source = {
        kind: TRIGGER_KIND,
        version: TRIGGER_VERSION,
        transactionId,
        targetSeq: plan.messageSeq,
        surfaceNodes: [...plan.surfaceNodes],
        followup,
      }
      const trigger = {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: 'history-edit-internal-' + transactionId }],
        source,
      }
      state = { source, trigger, expectedTurn: nextTurnNumber(agent), plan }
      activeTransactions.set(agent, state)
      agent.inbox.splice('next-turn', 0, 0, [trigger])
      try {
        await flush(ctx, agent)
        signal.throwIfAborted()
        if (pending(agent).length !== 1 || pending(agent)[0]?.id !== trigger.id) {
          throw new HistoryEditError('待处理消息在编辑期间发生变化，请重试。', 409, 'source-changed')
        }
        wakeWithRemovedToken(agent)
      } catch (error) {
        agent.inbox.remove(trigger.id)
        activeTransactions.delete(agent)
        try { await flush(ctx, agent) } catch {}
        throw error
      }
    })

    await agent.whenIdle()
    if (!state?.outcome?.ok) {
      await cleanTrigger(ctx, agent, state)
      throw state?.outcome?.error ?? new HistoryEditError('编辑请求未能安全完成，请重试。')
    }
    await flush(ctx, agent)
    agent.inbox.remove(state.trigger.id)
    activeTransactions.delete(agent)
    await queueEdited(ctx, agent, state)
    return { sessionId, replacementSeq: state.replacementSeq, queued: true }
  } catch (error) {
    if (state && activeTransactions.get(agent) === state) activeTransactions.delete(agent)
    if (state && !state.replacementSeq) await cleanTrigger(ctx, agent, state)
    if (state?.replacementSeq && !isSameMessageIn(eventsOf(agent.session), state.source.followup.id)) {
      try {
        activeTransactions.delete(agent)
        await queueEdited(ctx, agent, state)
      } catch (recoveryError) {
        ctx.logger.error('history-edit: could not queue edited message for ' + agent.id + ': ' + String(recoveryError))
      }
    }
    throw error
  }
}

export function apply(ctx) {
  ctx.on('agent/request', (payload, next) => guardRequest(ctx, payload, next), { global: true })
  ctx.on('agent/created', ({ agent }) => {
    void agent.whenIdle().then(() => recoverAgent(ctx, agent))
  }, { global: true })
  for (const agent of ctx.agents.list()) {
    void agent.whenIdle().then(() => recoverAgent(ctx, agent))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    async handler(req, res) {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) return sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
      if (req.headers.origin && req.headers.origin !== ctx.webServer.getOrigin()) {
        return sendJson(res, 403, { ok: false, error: { code: 'origin-rejected', message: '跨站请求已拒绝。' } })
      }
      try {
        const payload = await readJson(req)
        const value = await editMessage(ctx, payload)
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500
        sendJson(res, status, { ok: false, error: { code: error?.code ?? 'internal-error', message: error instanceof Error ? error.message : String(error) } })
      }
    },
  }), 'history-edit: same-session message regeneration')
}
