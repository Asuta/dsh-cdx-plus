import fs from 'node:fs/promises'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { placementBefore, captureOrder, restoreBefore } from './placement.js?v=0.4.1'

const ORIGINAL = Symbol.for('cordis.original')
const EFFECT = Symbol.for('cordis.effect')
/** Pseudo workspace id for conversations no Workspace accounts (the sidebar's 未分组). */
export const UNGROUPED = 'ungrouped'
const raw = value => value?.[ORIGINAL] ?? value
const fail = (code, message) => Object.assign(new Error(message), { code })
const message = error => error instanceof Error ? error.message : String(error)

/** Read both public Inbox queues now; keep a value snapshot across unload/reopen. */
export function snapshotInbox(agent) {
  const inbox = raw(agent)?.inbox
  const nextTurn = inbox?.nextTurn
  const nextStep = inbox?.nextStep
  if (!Array.isArray(nextTurn) || !Array.isArray(nextStep)) {
    throw fail('UNSUPPORTED', 'Durable inbox adapter is unavailable')
  }
  // These public getters also exist on the older ProjectedInbox. Its private
  // current() helper was removed in DSH 0.2.2-rc.1; never depend on it.
  return JSON.stringify({ 'next-turn': nextTurn, 'next-step': nextStep })
}

/** Runtime-shape-checked, per-session lifecycle adapter. All patches are effect-owned. */
export function createMover(ctx, io) {
  const moving = new Map()
  const active = new Map()
  const undoMoves = new Map()
  const owner = new AsyncLocalStorage()
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const controller = ctx.get('sessionController')
  const registry = ctx.get('workspaceRegistry')
  const persistence = ctx.get('sessionPersistence')
  const resolver = raw(controller)?.agents
  const commands = raw(controller)?.commands
  const factory = raw(agents)?.factory?.target
  const events = raw(ctx.events)
  const restores = []
  let stopping = false
  let supported = false
  let failure = null
  let failureCode = null
  let suppressedRemovals = 0

  function patch(target, key, build) {
    target = raw(target)
    if (!target || typeof target[key] !== 'function') throw fail('UNSUPPORTED', `Missing lifecycle adapter: ${key}`)
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    const original = target[key]
    const replacement = build(original)
    Object.defineProperty(target, key, { configurable: true, writable: true, value: replacement })
    const restore = () => {
      if (target[key] !== replacement) return
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete target[key]
    }
    restores.push(restore)
    return restore
  }

  const own = id => moving.get(id) !== undefined && owner.getStore() === moving.get(id)
  async function admitted(id, operation) {
    while (moving.has(id) && !own(id)) {
      await moving.get(id).done
      if (stopping) throw fail('UNAVAILABLE', 'Session mover is unloading; retry the operation')
    }
    active.set(id, (active.get(id) ?? 0) + 1)
    try { return await operation() }
    finally {
      const count = active.get(id) - 1
      if (count) active.set(id, count)
      else active.delete(id)
    }
  }

  ctx.effect(() => {
    try {
      if (!resolver || !commands || !factory || !persistence || !registry) throw fail('UNSUPPORTED', 'Required session services are unavailable')
      // This is the shared entry used by Web commands, Typert lookups and follow promotion.
      patch(resolver, 'resolve', original => async function (id, observation) {
        const entry = moving.get(id)
        if (entry && !own(id)) {
          await entry.done
          observation = undefined // an observation retained before a move has the old header
        }
        return admitted(id, () => original.call(this, id, observation))
      })
      // Count whole mutations, including work after agent lookup (attachments, model selection).
      for (const name of ['prompt', 'rename', 'updateQueue', 'selectModel', 'fork', 'create']) {
        patch(commands, name, original => function (request, ...rest) {
          if (!request?.sessionId) return original.call(this, request, ...rest)
          return admitted(request.sessionId, () => original.call(this, request, ...rest))
        })
      }
      patch(ctx.get('commands'), 'execute', original => function (agent, ...rest) {
        return admitted(agent.id, () => {
          if (raw(agents.get(agent.id)) !== raw(agent)) throw fail('SESSION_BUSY', 'The conversation moved; retry the command')
          return original.call(this, agent, ...rest)
        })
      })
      patch(factory, 'resumeWith', original => function (context, store, options) {
        return admitted(options.resumeSessionId, () => original.call(this, context, store, options))
      })
      patch(factory, 'createAgent', original => function (context, options) {
        return admitted(options.sessionId, () => original.call(this, context, options))
      })
      patch(ctx.get('sessionQuery'), 'observeSession', original => function (id, ...rest) {
        return admitted(id, () => original.call(this, id, ...rest))
      })
      patch(persistence, 'open', original => function (id, ...rest) {
        return admitted(id, () => original.call(this, id, ...rest))
      })
      // A transient registry detach during relocation is not a user deletion.
      // Preserve Client Session/binding/draft/scroll identities in every connected window.
      patch(events, 'emit', original => function (...args) {
        const offset = typeof args[0] === 'object' || typeof args[0] === 'function' ? 1 : 0
        if (args[offset] === 'api-session/removed' && moving.has(args[offset + 1])) {
          suppressedRemovals += 1
          return
        }
        return original.apply(this, args)
      })
      supported = true
    } catch (error) {
      for (const restore of restores.splice(0).reverse()) restore()
      failure = message(error)
      // Services are guaranteed by `inject`, so a wiring failure here means the
      // host shape changed; restarting will not help. Keep the thrown code.
      failureCode = error?.code ?? 'UNSUPPORTED'
      ctx.logger.warn(`session-mover: live relocation unavailable: ${message(error)}`)
    }
    return async () => {
      stopping = true
      await Promise.allSettled([...moving.values()].map(entry => entry.done))
      supported = false
      for (const restore of restores.splice(0).reverse()) restore()
    }
  }, 'session-mover: lifecycle admission and transient detach adapter')

  function lifecycle(id) {
    const fibers = new Set([ctx.root.fiber])
    for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) fibers.add(fiber)
    const matches = []
    for (const fiber of fibers) for (const fn of fiber._disposables ?? []) {
      if (fn[EFFECT]?.label === `agentLoop.lifecycle(${id})`) matches.push(fn)
    }
    if (matches.length !== 1) throw fail('UNSUPPORTED', `Expected one lifecycle owner; found ${matches.length}`)
    return matches[0]
  }

  async function unload(agent) {
    agent = raw(agent)
    if (agent.phase?.kind !== 'idle') throw fail('AGENT_RUNNING', 'Stop the reply or tool execution before moving this conversation')
    snapshotInbox(agent)
    const dispose = lifecycle(agent.id)
    const descriptor = Object.getOwnPropertyDescriptor(agent, 'cancel')
    const original = agent.cancel
    // The standard teardown clears the inbox. Keep its durable splices intact instead.
    agent.cancel = function (cause, options) { return original.call(this, cause, { ...options, keepInbox: true }) }
    try {
      await dispose()
      if (agents.get(agent.id) || sessions.get(agent.id)) throw fail('UNLOAD_FAILED', 'The conversation did not fully detach')
    } finally {
      if (descriptor) Object.defineProperty(agent, 'cancel', descriptor)
      else delete agent.cancel
    }
  }

  async function reopen(id, expectedCwd, inbox) {
    const result = await controller.resolveAgent(id)
    if (result.error) throw fail('REOPEN_FAILED', result.error.message)
    const agent = result.agent
    if (agent.session.header.cwd !== expectedCwd) throw fail('REOPEN_FAILED', 'The restored conversation has an unexpected directory')
    if (inbox !== null && snapshotInbox(agent) !== inbox) throw fail('QUEUE_MISMATCH', 'Pending input changed during restoration')
    return agent
  }

  async function exists(file) {
    try { await fs.lstat(file); return true }
    catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }

  async function transfer(from, to) {
    if (await exists(to)) throw fail('DESTINATION_EXISTS', 'The destination already contains this conversation')
    await fs.mkdir(path.dirname(to), { recursive: true })
    try { await fs.rename(from, to) }
    catch (error) {
      if (error.code !== 'EXDEV') throw error
      // Keep the source until the complete copy exists. The transaction's backup
      // is authoritative if either a copy or source removal fails part way.
      await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false })
      await fs.rm(from, { recursive: true })
    }
  }

  const holderOf = id => registry.list().find(workspace => workspace.sessionIds.includes(id)) ?? null
  const idOf = workspace => workspace ? workspace.id : UNGROUPED

  async function isDirectory(dir) {
    try { return (await fs.stat(dir)).isDirectory() } catch { return false }
  }

  async function transaction(id, workspaceId, position, undoRecord, preserveWorkingDirectory) {
    let source, target, located, destination, backup, indexBackup, originalCwd, createdDir
    let wasLive = false, unloaded = false, touched = false, inbox = null
    let originalOrder, pinned, sourceId, effectiveDirectory
    try {
      // Ungrouped is a real source and target: it has no registry record, so it
      // never attaches, detaches or orders on the Host. Its order is browser-local.
      target = workspaceId === UNGROUPED ? null : registry.get(workspaceId)
      if (workspaceId !== UNGROUPED && !target) throw fail('UNKNOWN_WORKSPACE', 'Unknown target workspace')
      source = holderOf(id)
      if (idOf(source) === idOf(target)) return { ok: true, unchanged: true, sessionId: id }
      if (!source) {
        // Any id is "ungrouped" until proven to be a stored, ordinary conversation.
        let header
        try { header = await raw(registry).readSessionHeader(id) } catch { throw fail('NOT_FOUND', 'Session not found') }
        if (header?.origin === 'subagent') throw fail('SUBAGENT', 'Move the parent conversation instead of its subagent')
      }
      const initial = await io.readWorkspaces()
      if (!Array.isArray(initial?.global?.pinnedSessionIds)) throw fail('UNSUPPORTED', 'Pin metadata is unavailable')
      if (initial.global.archivedSessionIds?.includes(id)) throw fail('ARCHIVED', 'Unarchive this conversation before moving it')
      pinned = initial.global.pinnedSessionIds.includes(id)
      originalOrder = source ? captureOrder([...source.sessionIds], id) : null
      sourceId = idOf(source)
      if (undoRecord && (sourceId !== undoRecord.targetId || pinned !== undoRecord.pinned)) throw fail('STALE_UNDO', 'The conversation moved or its pin state changed after this action')
      // Validate anchor before saving or unloading; opposite pin regions intentionally mean partition head.
      if (!undoRecord && target) placementBefore([...target.sessionIds], initial.global.pinnedSessionIds, id, position)
      if (resolver.resumes?.has(id) || resolver.claims?.has(id)) throw fail('SESSION_BUSY', 'The conversation is being opened or configured; retry shortly')
      let targetPath
      if (target) targetPath = await fs.realpath(target.path)
      else {
        // Undo returns to the directory it came from; a fresh move gets its own
        // standalone directory, never a workspace path.
        const previous = undoRecord?.originalCwd
        const workspacePaths = new Set(registry.list().map(workspace => workspace.path))
        const reuse = previous && await isDirectory(previous) ? await fs.realpath(previous) : undefined
        if (reuse && !workspacePaths.has(reuse)) targetPath = reuse
        else {
          createdDir = await io.allocateLooseDir()
          targetPath = await fs.realpath(createdDir)
        }
      }
      const targetFolder = io.folderNameFor(targetPath)
      destination = path.join(io.sessionsRoot(), targetFolder, id)
      if (await exists(destination)) throw fail('DESTINATION_EXISTS', 'The destination already contains this conversation')
      let agent = agents.get(id)
      // Side chats created by older plugins used the worktree as header.cwd.
      // Rehome their project identity while durably preserving their directory.
      if (preserveWorkingDirectory && !agent) {
        const result = await controller.resolveAgent(id)
        if (result.error) throw fail('REOPEN_FAILED', result.error.message)
        agent = result.agent
      }
      wasLive = Boolean(agent)
      if (!agent && sessions.get(id)) throw fail('SESSION_BUSY', 'The conversation is attached without an ordinary Agent')
      if (agent) {
        const concrete = raw(agent)
        if (concrete.phase?.kind !== 'idle') throw fail('AGENT_RUNNING', 'Stop the reply or tool execution before moving this conversation')
        if (agent.session.header.origin === 'subagent') throw fail('SUBAGENT', 'Move the parent conversation instead of its subagent')
        inbox = snapshotInbox(concrete)
        originalCwd = agent.session.header.cwd
        if (preserveWorkingDirectory) {
          const directories = ctx.get('workingDirectory')
          if (!directories) throw fail('UNSUPPORTED', 'Working directory service is unavailable')
          effectiveDirectory = directories.get(agent.session)
          if (!path.isAbsolute(effectiveDirectory)) throw fail('UNSUPPORTED', 'The working directory is unavailable')
          // Append even when equal to the old header: changing that header must
          // not change the projection's default. No inbox message is introduced.
          agent.session.append('working-directory/change', { cwd: effectiveDirectory })
        }
        if (!await sessions.flush(agent.session)) throw fail('SAVE_FAILED', 'No session durability checkpoint participated')
        // Saving can run asynchronous listeners; recheck before lifecycle teardown.
        if (concrete.phase?.kind !== 'idle' || raw(agents.get(id)) !== concrete) throw fail('SESSION_BUSY', 'The conversation became active while saving')
        unloaded = true // teardown can detach successfully and still report a cleanup failure
        await unload(agent)
      }
      located = await io.findSessionFolder(id)
      if (!located) throw fail('NOT_FOUND', 'Session log folder not found')
      if (located.folderName === targetFolder) throw fail('ALREADY_THERE', 'The log is already in that workspace')
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      backup = path.join(io.pluginDir(), 'session-backups', `${id}-${stamp}`)
      await fs.mkdir(path.dirname(backup), { recursive: true })
      await fs.cp(located.sessionFolder, backup, { recursive: true, errorOnExist: true, force: false })
      indexBackup = await io.backupIndex('before-relocate')
      // A preparation-only failure must not rewrite or restore any log bytes.
      touched = true
      const rewrite = await io.rewriteSessionCwd(located.sessionFolder, targetPath)
      originalCwd ??= rewrite.previousCwd
      await transfer(located.sessionFolder, destination)
      io.evictHeaderIndex(registry, id)
      if (target) await target.attachSession(id)
      if (source) await source.detachSession(id)
      const current = await io.readWorkspaces()
      if (current.global.pinnedSessionIds.includes(id) !== pinned) throw fail('PIN_CHANGED', 'Pin state changed during the move; retry')
      let beforeId
      if (target) {
        beforeId = undoRecord?.originalOrder
          ? restoreBefore([...target.sessionIds], id, undoRecord.originalOrder)
          : placementBefore([...target.sessionIds], current.global.pinnedSessionIds, id, undoRecord ? undefined : position)
        await target.insertSessionBefore(id, beforeId)
        const applied = [...target.sessionIds]
        if (applied.indexOf(id) + 1 !== (beforeId === undefined ? applied.length : applied.indexOf(beforeId))) throw fail('ORDER_MISMATCH', 'Target order could not be confirmed')
      }
      const accounted = io.holders(await io.readWorkspaces(), id)
      if (target ? accounted.length !== 1 || accounted[0].workspaceId !== target.id : accounted.length !== 0) throw fail('INDEX_MISMATCH', 'Workspace membership did not settle')
      if (wasLive) {
        const reopened = await reopen(id, targetPath, inbox)
        if (effectiveDirectory !== undefined && ctx.get('workingDirectory').get(reopened.session) !== effectiveDirectory) {
          throw fail('DIRECTORY_MISMATCH', 'The working directory changed during project reassignment')
        }
      }
      // A full summary refresh also covers cold moves and other open windows.
      try {
        const summary = (await controller.list({}, new AbortController().signal)).items.find(row => row.sessionId === id)
        if (summary) ctx.emit('api-session/added', summary)
      } catch (error) { ctx.logger.warn(`session-mover: summary refresh: ${message(error)}`) }
      let undoToken
      if (!undoRecord) {
        for (const [key, value] of undoMoves) if (value.expires < Date.now()) undoMoves.delete(key)
        if (undoMoves.size >= 100) undoMoves.delete(undoMoves.keys().next().value)
        undoToken = randomUUID()
        undoMoves.set(undoToken, { id, sourceId, targetId: idOf(target), originalOrder, pinned, originalCwd: source ? undefined : originalCwd, expires: Date.now() + 30 * 60 * 1000 })
      }
      // An empty working directory may already be shared by a fork, a cold
      // session or a new workspace. Undo restores membership, not directory
      // ownership; keep standalone directories after a successful move.
      return {
        ok: true, sessionId: id, reopened: wasLive, queuePreserved: true, pinned, undoToken,
        placement: { beforeSessionId: beforeId ?? null },
        source: { id: sourceId, title: source?.title ?? null },
        target: { id: idOf(target), title: target?.title ?? null },
        cwd: targetPath, backup, indexBackup,
      }
    } catch (error) {
      let restoreError = null
      let rolledBack = false
      try {
        if (touched) {
          const loaded = agents.get(id)
          if (loaded) await unload(loaded)
          if (sessions.get(id)) throw fail('RESTORE_BUSY', 'Cannot restore a log while it remains attached')
          // Both exact paths are derived from the checked UUID and registry paths.
          // Never replace any other conversation or the whole workspace index.
          if (await exists(destination)) await fs.rm(destination, { recursive: true })
          if (await exists(located.sessionFolder)) await fs.rm(located.sessionFolder, { recursive: true })
          await fs.cp(backup, located.sessionFolder, { recursive: true, errorOnExist: true, force: false })
          if (target) await target.detachSession(id)
          if (source) await source.detachSession(id)
          io.evictHeaderIndex(registry, id)
          if (source) {
            await source.attachSession(id)
            await source.insertSessionBefore(id, restoreBefore([...source.sessionIds], id, originalOrder))
          }
          const accounted = io.holders(await io.readWorkspaces(), id)
          if (source ? accounted.length !== 1 || accounted[0].workspaceId !== source.id : accounted.length !== 0) throw fail('RESTORE_INDEX', 'Original workspace membership could not be restored')
          rolledBack = true
        }
        if (wasLive && (unloaded || touched) && !agents.get(id)) {
          await reopen(id, originalCwd, inbox)
        }
      } catch (restore) { restoreError = message(restore); rolledBack = false }
      if (createdDir) await fs.rmdir(createdDir).catch(() => {})
      return { ok: false, code: error.code ?? 'MOVE_FAILED', error: message(error), rolledBack, restoreError, backup, indexBackup }
    }
  }

  async function move({ sessionId: id, workspaceId, position, undoToken, preserveWorkingDirectory = false } = {}) {
    const undoRecord = undoToken === undefined ? undefined : undoMoves.get(undoToken)
    if (undoToken !== undefined) {
      if (!undoRecord || undoRecord.id !== id || undoRecord.expires < Date.now()) return { ok: false, code: 'STALE_UNDO', error: 'This undo expired or belongs to another conversation' }
      workspaceId = undoRecord.sourceId
      position = undefined
    }
    if (position !== undefined && (!position || typeof position !== 'object' || (position.edge === 'end' ? position.anchorSessionId !== undefined : (!/^session-[0-9a-f-]{36}$/i.test(position.anchorSessionId ?? '') || !['before', 'after'].includes(position.edge) || position.anchorSessionId === id)))) return { ok: false, code: 'BAD_REQUEST', error: 'Position requires another conversation and edge before or after' }
    if (!/^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '') || typeof workspaceId !== 'string' || !workspaceId) return { ok: false, code: 'BAD_REQUEST', error: 'Valid sessionId and workspaceId are required' }
    if (stopping) return { ok: false, code: 'NOT_READY', error: 'Session mover is unloading; retry the operation' }
    if (!supported) return { ok: false, code: failureCode ?? 'NOT_READY', error: `Live relocation is not wired: ${failure ?? 'initialization has not completed'}` }
    if (moving.size) return { ok: false, code: 'MOVE_IN_PROGRESS', error: 'Another conversation is being moved; retry when it finishes' }
    if (active.get(id)) return { ok: false, code: 'SESSION_BUSY', error: 'The conversation has an operation in progress; retry shortly' }
    let release
    const entry = { done: new Promise(resolve => { release = resolve }) }
    moving.set(id, entry)
    try {
      const result = await owner.run(entry, () => transaction(id, workspaceId, position, undoRecord, preserveWorkingDirectory))
      if (result.ok && undoToken) undoMoves.delete(undoToken)
      return result
    }
    finally { moving.delete(id); release() }
  }

  return {
    move,
    settle: async id => { const entry = moving.get(id); if (entry) await entry.done; return { ok: true } },
    list: () => ({ ok: true, workspaces: [...registry.list().map(w => ({ workspaceId: w.id, title: w.title, path: w.path, sessionCount: w.sessionIds.length })), { workspaceId: UNGROUPED, title: 'Ungrouped', path: null, note: 'Moving here gives the conversation a new standalone directory' }] }),
    status: () => ({ supported, failure, failureCode, moving: [...moving.keys()], suppressedRemovals }),
  }
}
