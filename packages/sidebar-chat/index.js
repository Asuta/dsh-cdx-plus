/**
 * Side chat host half: one isolated child conversation per side thread.
 *
 * A side thread is created by this plugin through the public AgentRegistry
 * seam (`agents.create`) with the parent conversation's event log as its
 * seed, so it inherits the history the user sees. It is deliberately NOT
 * created through the subagent supervisor: a supervisor-managed continuable
 * child posts a settlement notice back into its parent every time it
 * finishes, which would leak side-chat answers into the main conversation.
 * Everything a side thread does stays inside its own session, and its
 * transcript is served by this plugin's own routes.
 */
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { installLifecycle } from './lifecycle.js'

export const inject = [
  'webServer', 'connection', 'agents', 'agentPresets', 'sessionPersistence',
  'workingDirectory', 'sessionTitle',
  'systemPrompt', 'workspaceRegistry', 'storageDomain',
]

const API_PREFIX = '/sidebar-chat/api'
const LABEL_PREFIX = 'Side: '
const LABEL_MAX = 46
const BOUNDARY_PREFIX = 'Side conversation boundary'
const MAX_BODY_BYTES = 64 * 1024
const MAX_ROWS = 240
const MAX_ARG_CHARS = 180
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000
/** The native composer's localized claim tokens (dsh-client-ui-commands), mapped to Host command names. */
const COMMAND_ALIASES = {
  目标: 'goal', 计划: 'plan', 反馈: 'feedback', 压缩: 'compact', 权限: 'permission', 导出: 'export', 下载日志: 'export',
}

const COPY = {
  en: {
    marker: `── Side conversation starts here ──

Everything above was inherited from the main conversation and is reference only. Only the messages below are this thread's own task.`,
    boundary: `Side conversation boundary.

Everything before this boundary was inherited from the main conversation, including any unfinished turn. Keep it as reference material; it is not an active task or authorization in this side conversation. Only the user's messages after this boundary define the current task. If none have arrived, wait.

Do not resume inherited tasks, plans, tool calls, approvals, edits, or requests. Earlier tool calls and outputs describe work in the parent; they do not authorize running or retrying anything here.

Answer questions and use non-mutating inspection by default. Modify files, source code, Git state, permissions, configuration, or workspace state only when the user explicitly requests that change after this boundary. Request broader permissions only when that explicit change requires them. Keep authorized changes limited to the request and avoid disrupting the main conversation or other side conversations.

Do not create a worktree here; refer work requiring a new worktree to the main conversation. Do not create, contact, or control subagents, including ones mentioned in inherited history. Never send messages, results, or completion notices back to the main conversation.

This is an independent, persistent DSH conversation. Other side conversations may coexist; do not treat them as this thread's history.`,
    empty: 'New side conversation.',
    newThread: 'New thread',
  },
  zh: {
    marker: `── 侧边对话从这里开始 ──

上方完整继承自主对话，仅作参考；只处理这条线之后的消息。`,
    boundary: `侧边对话分隔线。

分隔线之前完整继承了主对话的历史，包括可能尚未结束的回合。它们仅供参考，不是本侧边对话的当前任务或有效授权。只有用户在分隔线之后提交的消息才定义当前任务；如果还没有新问题，就等待。

不要接着执行历史中的任务、计划、工具调用、审批、修改或请求。历史工具调用和输出发生在主对话中，不代表可以在这里执行或重试。

默认回答问题并进行不改变状态的查看、搜索。只有用户在分隔线之后明确要求相应变更，才能修改文件、源码、Git 状态、权限、配置或工作区状态；只有该项明确变更确实需要时，才能申请更高权限。变更应限于当前请求，并避免干扰主对话或其他侧边对话。

不要在这里创建 worktree，需要新 worktree 的工作应交回主对话。不要创建、联系或控制任何子代理，即使历史中使用过子代理。不要向主对话发送消息、结果或完成通知。

这是独立、持久保存的 DSH 会话，可以与其他侧边对话并存；其他侧边对话的内容不属于本线程。`,
    empty: '新的侧边对话。',
    newThread: '新对话',
  },
}

/** Per-thread live agents created or resumed by this plugin. */
const threads = new Map()

/** In-flight assistant text per thread (published outside the session log). */
const liveText = new Map()

/** Pick a copy set from a loose locale tag ("zh-CN", "en-US"). */
function copyOf(locale) {
  return String(locale ?? '').toLowerCase().startsWith('zh') ? COPY.zh : COPY.en
}

/** Truncate one question into a durable thread label. */
function shortLabel(question, newThread) {
  const line = String(question ?? '').replace(/\s+/g, ' ').trim()
  if (line === '') return LABEL_PREFIX + newThread
  const chars = Array.from(line)
  return LABEL_PREFIX + (chars.length > LABEL_MAX ? chars.slice(0, LABEL_MAX - 1).join('') + '…' : line)
}

function fail(message, code = 'bad-request') {
  const error = new Error(message)
  error.code = code
  return error
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw fail('request body is too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw fail('request body is not valid JSON')
  }
}

function requireId(value, field) {
  if (typeof value !== 'string' || value === '' || value.length > 200) {
    throw fail(field + ' must be a non-empty string')
  }
  return value
}

function requireText(value) {
  if (typeof value !== 'string' || value.trim() === '') throw fail('text must be a non-empty string')
  return value
}

/** Durable side-thread identity, distinct from host-managed delegated agents. */
function isSideThreadHeader(header) {
  return header.isSeeded === true
    && header.origin !== 'subagent'
    && typeof header.parentSession === 'string'
    && Number.isSafeInteger(header.delegationDepth)
    && header.delegationDepth >= 1
}

/** One session event's payload. */
function dataOf(event) {
  const data = event?.data
  return data !== null && typeof data === 'object' ? data : {}
}

/** Flatten a content block array into display text. */
function textOfBlocks(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

function messageOfEvent(event) {
  const data = dataOf(event)
  return data.message !== null && typeof data.message === 'object' ? data.message : data
}

/** Build one user message (the runtime shape `createUserMessage` produces). */
function userMessage(text, source = { kind: 'user' }) {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source }
}

/** The events a thread produced itself (everything after its seeded prefix). */
function ownEventsOf(events, inheritedHint) {
  // The parent's history may itself contain fork/resume markers. The durable
  // inherited count is authoritative; no marker inside that prefix belongs to us.
  if (Number.isSafeInteger(inheritedHint) && inheritedHint >= 0) return events.slice(inheritedHint)
  for (let index = 0; index < events.length; index++) {
    if (events[index]?.type === 'session/end-seed') return events.slice(index + 1)
  }
  return events
}

/** Last display event before the side thread's own conversation begins. */
function inheritedDisplayBoundary(events, inheritedEventCount) {
  if (!Number.isSafeInteger(inheritedEventCount) || inheritedEventCount <= 0) return null
  const marker = events.slice(inheritedEventCount).find(event => event.type === 'user/message'
    && messageOfEvent(event).source?.kind === 'plugin:sidebar-chat')
  const last = marker ?? events[inheritedEventCount - 1]
  return Number.isSafeInteger(last?.seq) ? last.seq : null
}

/** One unclaimed inbox row, in the order the next step will claim it. */
function pendingOf(agent) {
  try {
    const rows = []
    for (const [target, list] of [['next-step', agent.inbox.nextStep], ['next-turn', agent.inbox.nextTurn]]) {
      for (const message of list ?? []) {
        if (typeof message?.id !== 'string' || message.id === '') continue
        if (message.source?.kind === 'plugin:sidebar-chat') continue
        rows.push({ id: message.id, target, text: textOfBlocks(message.content) })
      }
    }
    return rows
  } catch {
    return []
  }
}

/** Project a thread's own log into display rows. */
function rowsOf(events) {
  const rows = []
  const calls = new Map()
  for (const event of events) {
    const data = dataOf(event)
    if (event.type === 'user/message') {
      const message = messageOfEvent(event)
      const text = textOfBlocks(message.content)
      const source = message.source
      if (text === '' || text.startsWith(BOUNDARY_PREFIX) || text.startsWith('侧边对话分隔线。') || source?.kind === 'plugin:sidebar-chat') continue
      if (source !== null && typeof source === 'object' && source.kind !== 'user') continue
      rows.push({ kind: 'user', text })
      continue
    }
    if (event.type === 'assistant/message') {
      const message = data.message
      const text = textOfBlocks(message?.content)
      if (text !== '') rows.push({ kind: 'assistant', text })
      continue
    }
    if (event.type === 'tool/call') {
      const args = typeof data.arguments === 'string' ? data.arguments : ''
      const row = {
        kind: 'tool',
        name: typeof data.name === 'string' ? data.name : 'tool',
        args: args.length > MAX_ARG_CHARS ? args.slice(0, MAX_ARG_CHARS) + '…' : args,
      }
      rows.push(row)
      if (typeof data.callId === 'string') calls.set(data.callId, row)
      continue
    }
    if (event.type === 'tool/result') {
      const callId = data.message?.source?.callId
      const row = typeof callId === 'string' ? calls.get(callId) : undefined
      const text = textOfBlocks(data.message?.content)
      if (row !== undefined && text !== '') {
        row.result = text.length > MAX_ARG_CHARS ? text.slice(0, MAX_ARG_CHARS) + '…' : text
      }
      continue
    }
    if (event.type === 'turn/end') {
      const reason = data.reason
      if (reason !== null && typeof reason === 'object' && reason.kind === 'error') {
        const message = reason.error?.message ?? reason.message ?? 'error'
        rows.push({ kind: 'error', text: String(message) })
      }
      continue
    }
    if (event.type === 'command/run') {
      const row = {
        kind: 'command',
        name: typeof data.name === 'string' ? data.name : '',
        args: typeof data.args === 'string' ? data.args.trim() : '',
      }
      rows.push(row)
      if (typeof data.commandId === 'string') calls.set('cmd:' + data.commandId, row)
      continue
    }
    if (event.type === 'command/done') {
      const row = typeof data.commandId === 'string' ? calls.get('cmd:' + data.commandId) : undefined
      if (row !== undefined) {
        row.status = data.kind === 'error' ? 'error' : 'success'
        if (typeof data.text === 'string' && data.text !== '') row.result = data.text
      }
    }
  }
  return rows.length > MAX_ROWS ? rows.slice(rows.length - MAX_ROWS) : rows
}

/** The checked-out branch (or short commit) of the git checkout holding `cwd`. */
async function branchOf(cwd) {
  if (typeof cwd !== 'string' || cwd === '' || !isAbsolute(cwd)) return undefined
  let dir = resolve(cwd)
  for (let depth = 0; depth < 40; depth++) {
    const dotGit = join(dir, '.git')
    try {
      const info = await stat(dotGit)
      let gitDir = dotGit
      if (info.isFile()) {
        const pointer = /^gitdir:\s*(.+)\s*$/m.exec(await readFile(dotGit, 'utf8'))
        if (pointer === null) return undefined
        gitDir = resolve(dir, pointer[1].trim())
      }
      const head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim()
      const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head)
      if (ref !== null) return ref[1]
      return /^[0-9a-f]{7,}$/i.test(head) ? head.slice(0, 7) : undefined
    } catch {
      // No checkout marker here; keep walking up.
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

/** Resolve the preset composition a child inherits from its parent. */
async function composedSetup(ctx, presetId) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return {}
  try {
    const resolved = await presets.resolve(presetId)
    return {
      agentPreset: resolved?.id ?? presetId,
      setup: async (agentCtx) => {
        await presets.mount(agentCtx, resolved?.id ?? presetId)
      },
    }
  } catch {
    return {}
  }
}

/** Read one persisted session's header and log through a read-only handle. */
async function readPersisted(ctx, sessionId) {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) throw fail('the session persistence service is unavailable', 'unavailable')
  const handle = await persistence.open(sessionId, 'read')
  try {
    const { events } = await handle.read()
    return {
      header: handle.header ?? {},
      events: Array.isArray(events) ? events : [],
      inheritedEventCount: Number.isSafeInteger(handle.inheritedEventCount) ? handle.inheritedEventCount : 0,
    }
  } finally {
    await handle.close()
  }
}

/** The model route a session will request with next, from its durable log. */
function routeOf(events) {
  const read = (config) => {
    if (config === null || typeof config !== 'object') return undefined
    if (typeof config.provider !== 'string' || config.provider === '') return undefined
    if (typeof config.model !== 'string' || config.model === '') return undefined
    return {
      provider: config.provider,
      model: config.model,
      ...(typeof config.reasoningEffort === 'string' && config.reasoningEffort !== ''
        ? { reasoningEffort: config.reasoningEffort }
        : {}),
    }
  }
  let pending
  let used
  for (const event of events) {
    if (event?.type === 'model/selection') {
      pending = read(dataOf(event)) ?? pending
      continue
    }
    if (event?.type !== 'request/header') continue
    const selection = read(dataOf(event).header?.config)
    if (selection === undefined) continue
    used = selection
    if (pending !== undefined
      && pending.provider === selection.provider
      && pending.model === selection.model
      && pending.reasoningEffort === selection.reasoningEffort) pending = undefined
  }
  return pending ?? used
}

/** The agent preset a persisted session records. */
function presetOf(header, events) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type !== 'agent-preset/selected') continue
    const preset = dataOf(events[index]).agentPreset
    if (typeof preset === 'string' && preset !== '') return preset
  }
  return typeof header.agentPreset === 'string' && header.agentPreset !== '' ? header.agentPreset : undefined
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.pnpm-store', 'dist', 'build', 'out', '.next', '.turbo', '.cache', 'coverage', '__pycache__', '.venv', 'venv'])
const FILE_SCAN_LIMIT = 4000
const FILE_CACHE_MS = 30 * 1000
/** Short-lived workspace file listings keyed by cwd, for the `@` menu. */
const fileCache = new Map()

/** Breadth-first relative file paths under `cwd`, skipping heavy build/vendor folders. */
async function workspaceFiles(cwd) {
  const cached = fileCache.get(cwd)
  if (cached !== undefined && Date.now() - cached.time < FILE_CACHE_MS) return cached.files
  const { readdir } = await import('node:fs/promises')
  const files = []
  const queue = ['']
  while (queue.length > 0 && files.length < FILE_SCAN_LIMIT) {
    const relative = queue.shift()
    let entries
    try {
      entries = await readdir(join(cwd, relative), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = relative === '' ? entry.name : relative + '/' + entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path)
      } else if (entry.isFile()) {
        files.push(path)
        if (files.length >= FILE_SCAN_LIMIT) break
      }
    }
  }
  fileCache.set(cwd, { time: Date.now(), files })
  return files
}

/** Rank workspace paths for one `@` query: basename prefix, basename substring, path substring. */
function rankFiles(files, query) {
  const needle = query.toLowerCase()
  if (needle === '') return files.slice(0, 40)
  const scored = []
  for (const path of files) {
    const lower = path.toLowerCase()
    const base = lower.slice(lower.lastIndexOf('/') + 1)
    const score = base.startsWith(needle) ? 0 : base.includes(needle) ? 1 : lower.includes(needle) ? 2 : -1
    if (score >= 0) scored.push([score, path.length, path])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return scored.slice(0, 40).map((item) => item[2])
}

export function apply(ctx) {
  const visibilityStreams = new Set()
  ctx.effect(() => () => { for (const response of visibilityStreams) response.end() }, 'sidebar-chat: visibility streams')
  const lifecycle = installLifecycle(ctx, {
    read: async id => {
      const session = ctx.get('agents').get(id)?.session
      return session ? { header: session.header, events: session.snapshotEvents(), inheritedEventCount: session.inheritedEventCount } : readPersisted(ctx, id)
    },
    isSideHeader: isSideThreadHeader,
    releaseThread: id => disposeThread(id),
  })
  ctx.effect(() => ctx.provide('sidebarChatLifecycle', lifecycle), 'sidebar-chat: lifecycle service')
  ctx.effect(() => () => lifecycle.dispose(), 'sidebar-chat: lifecycle cleanup')
  // Optional peers may mount after this plugin. Repair only this plugin's old,
  // already-detached worktree sessions; do not delay lifecycle initialization.
  ctx.inject(['worktreeSessions', 'sessionMover'], () => {
    lifecycle.repairDetachedWorktrees().catch(error => ctx.logger?.warn('sidebar-chat worktree recovery: ' + error.message))
  })
  // Persist the boundary in the transcript, and repeat its policy as required
  // runtime context on every request, including after a cold resume.
  ctx.systemPrompt.context({
    name: 'sidebar-chat:boundary',
    order: ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') + 1,
    required: true,
    interpolate: false,
    text: ({ agent }) => {
      if (agent === undefined) return ''
      // Durable classification rather than process memory: the native composer
      // sends through the host, so a side thread may be driven without ever
      // passing through this plugin's own prompt route.
      return isSideThreadHeader(agent.session.header) && !lifecycle.isDetached(agent.session.id) ? COPY.en.boundary : ''
    },
  })

  const agentsOf = () => {
    const agents = ctx.get('agents')
    if (agents === undefined) throw fail('the agents service is unavailable', 'unavailable')
    return agents
  }

  /** Return the live agent of one thread, resuming a cold one on demand. */
  const agentOf = async (childId) => {
    const agents = agentsOf()
    const live = agents.get(childId)
    if (live !== undefined) return live
    const persisted = await readPersisted(ctx, childId)
    const route = routeOf(persisted.events)
    const { setup } = await composedSetup(ctx, presetOf(persisted.header, persisted.events))
    const parentId = persisted.header.parentSession
    const parent = typeof parentId === 'string' ? agents.get(parentId) : undefined
    const handle = await agents.resume({
      resumeSessionId: childId,
      ...(parent === undefined ? {} : { parentAgent: parent }),
      ...(route === undefined ? {} : { agentOptions: route }),
      ...(setup === undefined ? {} : { setup }),
    })
    threads.set(childId, { agent: handle.agent, dispose: () => handle.dispose() })
    return handle.agent
  }

  // Read only headers, without resuming agents or reading their transcripts.
  // This also discovers threads absent from this browser's recent-30 index.
  const visibility = async (payload) => {
    if (!Array.isArray(payload.ids) || payload.ids.length > 100) throw fail('ids must contain at most 100 session ids')
    const ids = [...new Set(payload.ids.map(id => requireId(id, 'id')))]
    const hiddenIds = [], checkedIds = [], detachedIds = []
    for (const id of ids) {
      let handle
      try {
        let header = agentsOf().get(id)?.session.header
        if (header === undefined) {
          handle = await ctx.get('sessionPersistence').open(id, 'read')
          header = handle.header
        }
        if (isSideThreadHeader(header) && !lifecycle.isDetached(id)) hiddenIds.push(id)
        if (lifecycle.isDetached(id)) detachedIds.push(id)
        checkedIds.push(id)
      } catch {
        // Unreadable rows stay visible and can be checked on a later update.
      } finally {
        await handle?.close()
      }
    }
    return { hiddenIds, checkedIds, ...(detachedIds.length ? { detachedIds } : {}) }
  }

  /** The live agent of a thread that must belong to `parentSessionId`. */
  const ownedAgent = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const parentSessionId = requireId(payload.parentSessionId, 'parentSessionId')
    const agent = await agentOf(childId)
    if (agent.session.header.parentSession !== parentSessionId) throw fail('thread does not belong to this conversation', 'forbidden')
    return agent
  }

  /** Resolve a typed `/name rest` line to an effective Host command, honoring the native localized tokens. */
  const commandLine = (agent, text) => {
    const commands = ctx.get('commands')
    if (commands === undefined) return undefined
    const match = /^\/(\S+)(?=$|\s)/u.exec(text)
    if (match === null) return undefined
    const typed = match[1]
    const name = commands.find(agent, typed) !== undefined ? typed : COMMAND_ALIASES[typed]
    if (name === undefined || commands.find(agent, name) === undefined) return undefined
    return '/' + name + text.slice(match[0].length)
  }

  const runCommand = async (agent, line) => {
    const commands = ctx.get('commands')
    const settled = await commands.execute(agent, line, [], AbortSignal.timeout(COMMAND_TIMEOUT_MS))
    if (settled === undefined) return { kind: 'error', name: '', text: 'unknown command' }
    return {
      kind: settled.result.kind,
      name: /^\/([a-z][a-z0-9_-]*)/.exec(line)?.[1] ?? '',
      ...(settled.result.text === undefined ? {} : { text: settled.result.text }),
    }
  }

  /** The composer's catalog: Host commands, user skills, permission presets and branch for one thread. */
  const composer = async (payload) => {
    const agent = await ownedAgent(payload)
    const commands = ctx.get('commands')
    const commandRows = commands === undefined
      ? []
      : commands.list(agent).map((descriptor) => ({
        name: descriptor.name,
        description: descriptor.description,
        ...(descriptor.definitionId === undefined ? {} : { definitionId: descriptor.definitionId }),
        ...(descriptor.input === undefined ? {} : { hint: descriptor.input.hint }),
      }))
    const cwd = await (async () => {
      const service = ctx.get('workingDirectory')
      try {
        return typeof service?.ensure === 'function' ? await service.ensure(agent) : (service?.get(agent.session) ?? agent.session.header.cwd)
      } catch {
        return service?.get?.(agent.session) ?? agent.session.header.cwd
      }
    })()
    let skills = []
    try {
      const registry = ctx.get('agentPresets')?.serviceFor?.(agent, 'skills') ?? ctx.get('skills')
      if (registry !== undefined) {
        const listed = await registry.list({ cwd, scope: agent })
        skills = listed
          .filter((skill) => skill?.invocation?.userInvocable !== false)
          .map((skill) => ({
            name: skill.name,
            description: String(skill.description ?? ''),
            modelInvocable: skill.invocation?.modelInvocable !== false,
          }))
      }
    } catch {
      // A composition without skills still offers its commands.
    }
    let permission
    const presets = ctx.get('permissionPresets')
    if (presets !== undefined) {
      try {
        const catalog = presets.catalog()
        permission = { current: presets.current(agent.session), options: catalog.options }
      } catch {
        permission = undefined
      }
    }
    return {
      commands: commandRows,
      skills,
      ...(permission === undefined ? {} : { permission }),
      ...(typeof cwd === 'string' ? { cwd } : {}),
      branch: await branchOf(cwd),
    }
  }

  const command = async (payload) => {
    const agent = await ownedAgent(payload)
    const line = commandLine(agent, requireText(payload.line).trim())
    if (line === undefined) throw fail('unknown command', 'unknown-command')
    return runCommand(agent, line)
  }

  const files = async (payload) => {
    const agent = await ownedAgent(payload)
    const cwd = ctx.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) return { files: [] }
    const query = typeof payload.query === 'string' ? payload.query.slice(0, 200) : ''
    return { files: rankFiles(await workspaceFiles(cwd), query) }
  }

  const start = async (payload) => {
    await lifecycle.ready
    const parentSessionId = requireId(payload.parentSessionId, 'parentSessionId')
    return lifecycle.create(parentSessionId, async register => {
      const question = typeof payload.question === 'string' ? payload.question.trim() : ''
      const copy = copyOf(payload.locale)
      const parent = agentsOf().get(parentSessionId)
      if (parent === undefined) {
        throw fail('this conversation is not live; open it before starting a side chat', 'parent-not-live')
      }
      const parentEvents = parent.session.snapshotEvents()
      const header = parent.session.header ?? {}
      // Ordinary conversation forks also have parentSession, but retain depth 0.
      // Only delegated agents and still-attached side threads are disallowed.
      if ((isSideThreadHeader(header) && !lifecycle.isDetached(parentSessionId)) || header.origin === 'subagent') {
        throw fail('open the main conversation before starting a side chat', 'parent-seeded')
      }
      // The public rc.3 helper retains EVERY parent event, then appends only the
      // inherited marker and synthetic results/endings for an unfinished tail.
      const seed = parentEvents.length === 0 ? [] : buildForkSeed(parentEvents, parentEvents.length - 1)
      const workingDirectory = ctx.get('workingDirectory')
      const cwd = workingDirectory?.get(parent.session) ?? header.cwd
      const presetId = header.agentPreset
      const composed = await composedSetup(ctx, presetId)
      const childId = randomUUID()
      const handle = await agentsOf().create({
        sessionId: childId,
        meta: {
          // Workspace ownership follows the original project, while the seeded
          // working-directory events keep the child's effective worktree.
          ...((header.cwd ?? cwd) === undefined ? {} : { cwd: header.cwd ?? cwd }),
          parentSession: parentSessionId,
          isSeeded: true,
          delegationDepth: (Number.isSafeInteger(header.delegationDepth) ? header.delegationDepth : 0) + 1,
          ...(composed.agentPreset === undefined ? {} : { agentPreset: composed.agentPreset }),
        },
        seed,
        inheritedEventCount: parentEvents.length,
        agentOptions: { ...parent.options, ...(routeOf(parentEvents) ?? {}) },
        ...(composed.setup === undefined ? {} : { setup: composed.setup }),
        signal: AbortSignal.timeout(15000),
      })
      threads.set(childId, { agent: handle.agent, dispose: () => handle.dispose() })
      // The runtime inbox folds the seeded prefix, which may still hold input the
      // parent never claimed. Nothing of this thread's own can be pending yet.
      try {
        handle.agent.inbox.clear()
      } catch {
        // A host without an inbox unit keeps the (harmless) inherited queue.
      }
      const label = shortLabel(question, copy.newThread)
      // The native transcript shows the inherited prefix, so one visible marker
      // separates history from this thread's own task. The full boundary policy
      // still travels as required runtime context on every request.
      try {
        if (cwd !== undefined && workingDirectory?.get(handle.agent.session) !== cwd) {
          await workingDirectory?.set(handle.agent, cwd)
        }
        handle.agent.inject(userMessage(copy.marker, { kind: 'plugin:sidebar-chat' }))
        await register(handle.agent.session.header)
      } catch (error) {
        await disposeThread(childId)
        throw error
      }
      if (question !== '') handle.agent.followup(userMessage(question))
      return { childId, title: label.slice(LABEL_PREFIX.length), label }
    })
  }

  const prompt = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const text = requireText(payload.text).trim()
    const copy = copyOf(payload.locale)
    const agent = await agentOf(childId)
    if (typeof payload.parentSessionId === 'string' && agent.session.header.parentSession !== payload.parentSessionId) {
      throw fail('thread does not belong to this conversation', 'forbidden')
    }
    const line = commandLine(agent, text)
    const titles = ctx.get('sessionTitle')
    if (titles !== undefined && line === undefined) {
      try {
        titles.rename(agent.session, shortLabel(text, copy.newThread))
      } catch {
        // Keep the auto-generated title; the thread stays usable.
      }
    }
    if (line !== undefined) return { accepted: true, command: await runCommand(agent, line) }
    liveText.delete(childId)
    agent.followup(userMessage(text))
    return { accepted: true }
  }

  const disposeThread = async (childId) => {
    const entry = threads.get(childId)
    threads.delete(childId)
    liveText.delete(childId)
    if (entry !== undefined) {
      try { await entry.dispose() } catch {}
    }
    return { accepted: true }
  }

  const info = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const live = agentsOf().get(childId)
    if (live !== undefined) {
      const events = live.session.snapshotEvents()
      const selection = routeOf(events)
      return {
        live: true,
        status: live.status,
        legacy: live.session.header.origin === 'subagent',
        inheritedEventCount: live.session.inheritedEventCount,
        inheritedDisplayBoundary: inheritedDisplayBoundary(events, live.session.inheritedEventCount),
        preset: live.session.header.agentPreset,
        ...(selection ?? {}),
      }
    }
    const persisted = await readPersisted(ctx, childId)
    return {
      live: false,
      // Threads written before the native view carried `origin: 'subagent'`
      // without a subagent descriptor, so the host cannot retain them.
      legacy: persisted.header.origin === 'subagent',
      inheritedEventCount: persisted.inheritedEventCount,
      inheritedDisplayBoundary: inheritedDisplayBoundary(persisted.events, persisted.inheritedEventCount),
      preset: presetOf(persisted.header, persisted.events),
      ...(routeOf(persisted.events) ?? {}),
    }
  }

  const models = async () => {
    const controller = ctx.get('sessionController')
    if (typeof controller?.modelCatalog !== 'function') return { available: false, groups: [], failures: [] }
    try {
      const catalog = await controller.modelCatalog()
      return {
        available: true,
        ...(catalog?.default === undefined ? {} : { default: catalog.default }),
        groups: Array.isArray(catalog?.groups) ? catalog.groups : [],
        failures: Array.isArray(catalog?.failures) ? catalog.failures : [],
      }
    } catch (error) {
      return { available: false, groups: [], failures: [{ id: 'host', message: String(error?.message ?? error) }] }
    }
  }

  const setModel = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const selection = {
      provider: requireText(payload.provider).trim(),
      model: requireText(payload.model).trim(),
      ...(typeof payload.reasoningEffort === 'string' && payload.reasoningEffort !== ''
        ? { reasoningEffort: payload.reasoningEffort }
        : {}),
    }
    const agent = await agentOf(childId)
    const controller = ctx.get('sessionController')
    const owner = controller?.agents ?? controller
    if (typeof owner?.selectForNextRequest === 'function') {
      owner.selectForNextRequest(agent, selection)
    } else {
      agent.session.append('model/selection', selection)
    }
    return { accepted: true, selection }
  }

  const dequeue = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const agent = agentsOf().get(childId)
    if (agent === undefined) return { accepted: true, removed: 0 }
    if (typeof payload.messageId !== 'string' || payload.messageId === '') {
      const count = pendingOf(agent).length
      agent.inbox.clear()
      return { accepted: true, removed: count }
    }
    return { accepted: true, removed: agent.inbox.remove(payload.messageId) ? 1 : 0 }
  }

  const cancel = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const parentSessionId = requireId(payload.parentSessionId, 'parentSessionId')
    const agent = agentsOf().get(childId)
    if (agent !== undefined && agent.session.header.parentSession !== parentSessionId) throw fail('thread does not belong to this conversation', 'forbidden')
    if (agent !== undefined) {
      try {
        agent.cancel({ kind: 'user' }, { keepInbox: true })
      } catch {
        // An already idle thread has nothing to cancel.
      }
    }
    liveText.delete(childId)
    return { accepted: true }
  }

  const events = async (payload) => {
    const childId = requireId(payload.childId, 'childId')
    const parentSessionId = requireId(payload.parentSessionId, 'parentSessionId')
    const agents = agentsOf()
    const live = agents.get(childId)
    if (live !== undefined) {
      if (live.session.header.parentSession !== parentSessionId) throw fail('thread does not belong to this conversation', 'forbidden')
      return {
        rows: rowsOf(ownEventsOf(live.session.snapshotEvents(), live.session.inheritedEventCount)),
        running: live.status === 'running',
        live: live.status === 'running' ? (liveText.get(childId) ?? '') : '',
        pending: pendingOf(live),
      }
    }
    const persisted = await readPersisted(ctx, childId)
    if (persisted.header.parentSession !== parentSessionId) throw fail('thread does not belong to this conversation', 'forbidden')
    liveText.delete(childId)
    return {
      rows: rowsOf(ownEventsOf(persisted.events, persisted.inheritedEventCount)),
      running: false,
      live: '',
      pending: [],
    }
  }

  const list = async (payload) => {
    const parentSessionId = requireId(payload.parentSessionId, 'parentSessionId')
    const inventory = await lifecycle.inventory(parentSessionId)
    const metadata = new Map(inventory.map(row => [row.id, row]))
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((id) => typeof id === 'string').slice(0, 100) : inventory.map(row => row.id)
    const rows = []
    for (const id of ids) {
      try {
        const live = agentsOf().get(id)
        const persisted = live === undefined ? await readPersisted(ctx, id) : undefined
        const header = live?.session.header ?? persisted.header
        if (header.parentSession !== parentSessionId) continue
        const events = live?.session.snapshotEvents() ?? persisted.events
        const own = ownEventsOf(events, live?.session.inheritedEventCount ?? persisted?.inheritedEventCount)
        const firstQuestion = own.find((event) => {
          if (event.type !== 'user/message') return false
          const message = messageOfEvent(event)
          const text = textOfBlocks(message.content)
          return message.source?.kind === 'user' && !text.startsWith(BOUNDARY_PREFIX) && !text.startsWith('侧边对话分隔线。')
        })
        const question = firstQuestion === undefined ? copyOf(payload.locale).newThread : textOfBlocks(messageOfEvent(firstQuestion).content)
        if (lifecycle.isDetached(id)) continue
        rows.push({ id, ...metadata.get(id), title: shortLabel(question, copyOf(payload.locale).newThread).slice(LABEL_PREFIX.length), running: live?.status === 'running' })
      } catch {
        // A removed or unreadable thread is omitted from the recent list.
      }
    }
    return { threads: rows }
  }

  // Assistant deltas are published outside the session log; keep the tail of
  // the current attempt so an open thread can show text as it arrives.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    const childId = agent?.session?.id
    if (typeof childId !== 'string' || !threads.has(childId)) return
    const chunk = frame?.chunk ?? frame
    if (chunk === null || typeof chunk !== 'object') return
    if (chunk.type === 'block-start') {
      if (chunk.blockType === 'text') liveText.set(childId, '')
      return
    }
    if (chunk.type !== 'text-delta' || typeof chunk.text !== 'string') return
    const next = (liveText.get(childId) ?? '') + chunk.text
    liveText.set(childId, next.length > 4000 ? next.slice(next.length - 4000) : next)
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      const rejection = ctx.connection?.requestRejection?.(req)
      if (rejection !== undefined) {
        json(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith(API_PREFIX + '/') ? pathname.slice(API_PREFIX.length + 1) : ''
      if (req.method === 'GET' && method === 'visibility-events') {
        try {
          await lifecycle.ready
          if (res.destroyed) return
          res.setHeader('content-type', 'text/event-stream')
          res.setHeader('cache-control', 'no-cache, no-transform')
          visibilityStreams.add(res)
          const unsubscribe = lifecycle.subscribeDetached(ids => res.write('data: ' + JSON.stringify({ detachedIds: ids }) + '\n\n'))
          res.once('close', () => { unsubscribe(); visibilityStreams.delete(res) })
        } catch (error) {
          visibilityStreams.delete(res)
          if (!res.headersSent) json(res, 500, { ok: false, error: { message: error.message } })
          else res.end()
        }
        return
      }
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      try {
        const payload = await readJson(req)
        await lifecycle.ready
        if (method === 'new') return json(res, 200, { ok: true, value: await start(payload) })
        if (method === 'prompt') return json(res, 200, { ok: true, value: await prompt(payload) })
        if (method === 'dispose') return json(res, 200, { ok: true, value: await disposeThread(requireId(payload.childId, 'childId')) })
        if (method === 'cancel') return json(res, 200, { ok: true, value: await cancel(payload) })
        if (method === 'events') return json(res, 200, { ok: true, value: await events(payload) })
        if (method === 'info') return json(res, 200, { ok: true, value: await info(payload) })
        if (method === 'visibility') return json(res, 200, { ok: true, value: await visibility(payload) })
        if (method === 'models') return json(res, 200, { ok: true, value: await models(payload) })
        if (method === 'model') return json(res, 200, { ok: true, value: await setModel(payload) })
        if (method === 'dequeue') return json(res, 200, { ok: true, value: await dequeue(payload) })
        if (method === 'list') return json(res, 200, { ok: true, value: await list(payload) })
        if (method === 'detach') return json(res, 200, { ok: true, value: await lifecycle.detach(requireId(payload.parentSessionId, 'parentSessionId'), requireId(payload.childId, 'childId')) })
        if (method === 'close') return json(res, 200, { ok: true, value: await lifecycle.close(requireId(payload.parentSessionId, 'parentSessionId'), requireId(payload.childId, 'childId')) })
        if (method === 'restore') {
          const rows = await lifecycle.inventory(requireId(payload.parentSessionId, 'parentSessionId'))
          if (!rows.some(row => row.id === payload.childId)) throw fail('thread does not belong to this conversation', 'forbidden')
          await ctx.get('workspaceRegistry').unarchiveSession(payload.childId)
          return json(res, 200, { ok: true, value: { childId: payload.childId } })
        }
        if (method === 'composer') return json(res, 200, { ok: true, value: await composer(payload) })
        if (method === 'command') return json(res, 200, { ok: true, value: await command(payload) })
        if (method === 'files') return json(res, 200, { ok: true, value: await files(payload) })
        json(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method' } })
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'error'
        const message = error instanceof Error ? error.message : String(error)
        json(res, code === 'forbidden' ? 403 : 500, { ok: false, error: { code, message } })
      }
    },
  }), 'sidebar-chat: api')
}

