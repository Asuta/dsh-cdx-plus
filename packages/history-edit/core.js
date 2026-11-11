import { randomUUID } from 'node:crypto'

export class HistoryEditError extends Error {
  constructor(message, status = 409, code = 'edit-conflict') {
    super(message)
    this.name = 'HistoryEditError'
    this.status = status
    this.code = code
  }
}

const reject = (message, status = 409, code = 'edit-conflict') => {
  throw new HistoryEditError(message, status, code)
}

export function eventsOf(session) {
  const events = session?.events ?? session?.log
  return Array.isArray(events) ? [...events] : []
}

export function surfaceOf(session) {
  const nodes = session?.surface?.nodes
  return nodes ? [...nodes] : []
}

export function visibleSurfaceSeqs(events) {
  const nodes = []
  for (const event of events) {
    const op = event?.surfaceOp
    if (op === 'append') {
      nodes.push(event.seq)
      continue
    }
    if (op?.op !== 'replace') continue
    const start = nodes.indexOf(op.startSeq)
    const end = nodes.indexOf(op.endSeq)
    if (start < 0 || end < start) continue
    nodes.splice(start, end - start + 1, event.seq)
  }
  return nodes
}

export function visibleTurnNumbers(events) {
  const visible = new Set(visibleSurfaceSeqs(events))
  const turns = new Set()
  let turn
  for (const event of events) {
    if (event.type === 'turn/start') turn = event.data?.turn
    if (event.type === 'user/message' && event.surfaceOp === 'append' && visible.has(event.seq) && Number.isSafeInteger(turn)) turns.add(turn)
    if (event.type === 'turn/end' && event.data?.turn === turn) turn = undefined
  }
  return turns
}

function editableContent(message) {
  if (!Array.isArray(message?.content) || message.content.length === 0) return undefined
  let text = ''
  let imageCount = 0
  for (const block of message.content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += block.text
      continue
    }
    if (block?.type === 'image' && block.attachment !== undefined && block.attachment !== null) {
      imageCount++
      continue
    }
    return undefined
  }
  return text.trim() || imageCount > 0 ? { text, imageCount, content: message.content } : undefined
}

function editedContent(content, text, removedImageIndices) {
  const result = []
  const removed = new Set(removedImageIndices)
  let imageIndex = 0
  let insertedText = false
  for (const block of content) {
    if (block.type === 'image') {
      if (!removed.has(imageIndex)) result.push(block)
      imageIndex++
      continue
    }
    if (block.type === 'text' && !insertedText && text.length > 0) {
      result.push({ type: 'text', text })
      insertedText = true
    }
  }
  if (!insertedText && text.length > 0) result.unshift({ type: 'text', text })
  return result
}

function targetTurn(events, targetIndex) {
  let current = null
  let found = null
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.type === 'turn/start') current = { turn: event.data?.turn, startIndex: index }
    if (index === targetIndex) found = current
    if (event.type === 'turn/end' && current && event.data?.turn === current.turn) {
      if (found === current) return { ...current, endIndex: index }
      current = null
    }
  }
  return undefined
}

export function buildEditPlan(agent, { messageSeq, text, removeImageIndices = [], addedImageCount = 0 }) {
  if (!Number.isSafeInteger(messageSeq) || messageSeq < 0) reject('这条消息无法识别，请刷新后重试。', 400, 'invalid-message')
  if (typeof text !== 'string') reject('修改后的消息格式无效。', 400, 'invalid-message')
  if (text.length > 50000) reject('消息过长，请缩短后重试。', 413, 'message-too-large')
  if (!Array.isArray(removeImageIndices) || removeImageIndices.length > 12 ||
      removeImageIndices.some(index => !Number.isSafeInteger(index) || index < 0) ||
      new Set(removeImageIndices).size !== removeImageIndices.length ||
      !Number.isSafeInteger(addedImageCount) || addedImageCount < 0 || addedImageCount > 12) {
    reject('图片编辑信息无效，请重新选择图片。', 400, 'invalid-images')
  }

  const events = eventsOf(agent?.session)
  const nodes = surfaceOf(agent?.session)
  const targetIndex = nodes.indexOf(messageSeq)
  if (targetIndex < 0) reject('这条消息已不在当前对话内容中，请刷新后重试。', 404, 'message-not-found')

  const eventIndex = events.findIndex(event => event.seq === messageSeq)
  const event = events[eventIndex]
  const message = event?.data
  const before = editableContent(message)
  if (event?.type !== 'user/message' || message?.source?.kind !== 'user' || before === undefined) {
    reject('目前只支持编辑包含文本和图片的用户消息。', 409, 'unsupported-message')
  }
  if (removeImageIndices.some(index => index >= before.imageCount)) {
    reject('要移除的图片已变化，请刷新后重试。', 409, 'source-changed')
  }
  const imageCount = before.imageCount - removeImageIndices.length
  if (!text.trim() && imageCount + addedImageCount === 0) reject('修改后的消息不能为空。', 400, 'invalid-message')
  if (message.source.rpcId !== undefined && typeof message.source.rpcId !== 'string') {
    reject('这条消息来源无法确认，请刷新后重试。', 409, 'unsupported-message')
  }

  const turn = targetTurn(events, eventIndex)
  if (!turn) reject('只能编辑已经完成回复的消息。', 409, 'turn-incomplete')
  const userMessages = events.slice(turn.startIndex + 1, turn.endIndex)
    .filter(row => row.type === 'user/message' && row.data?.source?.kind === 'user')
  if (userMessages.length !== 1 || userMessages[0]?.seq !== messageSeq) {
    reject('这条消息所在轮次包含额外输入，暂不支持单独编辑。', 409, 'unsupported-turn')
  }

  const intake = events.find(row => row.seq < messageSeq && row.type === 'agent/inbox/spliced' &&
    row.data?.target === 'next-turn' && Array.isArray(row.data.inserted) &&
    row.data.inserted.length === 1 &&
    (row.data.inserted[0]?.id === message.id ||
      (typeof message.source.rpcId === 'string' && row.data.inserted[0]?.source?.rpcId === message.source.rpcId)))
  if (!intake) reject('无法确认这条消息的入队边界，暂不支持编辑。', 409, 'unsupported-message')

  const tailNodes = nodes.slice(targetIndex)
  if (!tailNodes.length || tailNodes.some(seq => !events.some(row => row.seq === seq))) {
    reject('对话内容已变化，请刷新后重试。', 409, 'source-changed')
  }
  return {
    messageSeq,
    before: before.text,
    text,
    content: editedContent(before.content, text, removeImageIndices),
    imageCount,
    surfaceNodes: nodes,
    tailNodes,
  }
}

export function createUserMessage(content) {
  const id = randomUUID()
  return { id, role: 'user', content, source: { kind: 'user', rpcId: id } }
}

/** Append the DSH 0.2.1-rc.5 replacement checkpoint without changing Session identity. */
export function appendReplacement(agent, { messageSeq, tailNodes }, turn, step) {
  const endSeq = tailNodes.at(-1)
  if (!Number.isSafeInteger(endSeq)) reject('当前对话没有可替换的消息范围。')
  const event = agent.session.append('system/message', {
    turn,
    step,
    message: {
      id: randomUUID(),
      role: 'system',
      content: [],
      source: { kind: 'system-prompt' },
    },
  }, {
    surfaceOp: { op: 'replace', startSeq: messageSeq, endSeq },
    sourceEventSeqs: [...tailNodes],
  })
  return event.seq
}

export function sameNumbers(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
