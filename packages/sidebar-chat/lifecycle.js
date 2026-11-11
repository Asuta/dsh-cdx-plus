import { z } from 'zod'

// The rc.3 StorageDomain spec contract (the same global singleton form as workspace).
const spec = {
  name: 'sidebar_chat', version: 1, tables: {},
  global: {
    schema: z.object({
      threads: z.record(z.string(), z.object({
        parentId: z.string(), createdAt: z.number(), detached: z.boolean().default(false),
        worktreeLinked: z.boolean().optional(),
      })),
      groups: z.record(z.string(), z.object({
        restoreIds: z.array(z.string()), phase: z.enum(['archiving', 'archived', 'restoring', 'deleting']),
      })),
    }),
    initial: { threads: {}, groups: {} },
  },
}

/** Host-owned membership, archive reasons, and serialized group operations. */
export function installLifecycle(ctx, { read, isSideHeader, releaseThread }) {
  const workspace = ctx.get('workspaceRegistry')
  const agents = ctx.get('agents')
  const originalArchive = workspace.archiveSession
  const originalRestore = workspace.unarchiveSession
  const handles = new Map()
  const detachedListeners = new Set()
  let domain, state, tail = Promise.resolve(), scanned = false
  let ready
  const rawArchive = (id, options) => originalArchive.call(workspace, id, options)
  const rawRestore = id => originalRestore.call(workspace, id)
  const save = async next => { await domain.global.set(next); state = next }
  const serial = operation => {
    const result = tail.then(() => ready).then(operation)
    tail = result.catch(() => {})
    return result
  }
  const members = parentId => Object.entries(state.threads)
    .filter(([, row]) => row.parentId === parentId && !row.detached).map(([id]) => id)
  const archived = id => workspace.archivedSessionIds.includes(id)
  const putGroup = (id, group) => save({ ...state, groups: { ...state.groups, [id]: group } })
  const dropGroup = async id => { const groups = { ...state.groups }; delete groups[id]; await save({ ...state, groups }) }
  const detachedIds = () => Object.entries(state.threads).filter(([, row]) => row.detached).map(([id]) => id)
  async function archiveMember(id, options) {
    const row = state.threads[id]
    const wasArchived = archived(id)
    await rawArchive(id, options)
    const group = state.groups[row.parentId]
    if (!wasArchived && group?.restoreIds.includes(id)) await putGroup(row.parentId, { ...group, restoreIds: group.restoreIds.filter(child => child !== id) })
  }

  async function scan() {
    if (scanned) return
    const snapshots = await ctx.get('sessionPersistence').list()
    const live = ctx.get('sessions')?.list?.() ?? agents.list?.().map(agent => agent.session) ?? []
    const headers = new Map([...snapshots.map(item => item.header), ...live.map(session => session.header)].map(h => [h.id, h]))
    const threads = { ...state.threads }
    for (const [id, header] of headers) {
      if (threads[id] || !header.parentSession || !header.isSeeded) continue
      // A fork/delegated child can share all header fields. Only our own marker
      // AFTER the inherited prefix is evidence that this plugin created it.
      let value
      try { value = await read(id) } catch (error) {
        ctx.logger?.warn('sidebar-chat: could not inspect session ' + id + ': ' + error.message)
        continue
      }
      const own = value.events.slice(value.inheritedEventCount ?? 0)
      if (!own.some(event => event.type === 'user/message'
        && event.data?.source?.kind === 'plugin:sidebar-chat')) continue
      threads[id] = { parentId: header.parentSession, createdAt: header.createdAt, detached: false }
    }
    await save({ ...state, threads })
    scanned = true
  }

  async function finishArchive(parentId, group, options = { stopActivity: true }) {
    await rawArchive(parentId, options)
    for (const id of group.restoreIds) await rawArchive(id, { stopActivity: true })
    await putGroup(parentId, { ...group, phase: 'archived' })
  }
  async function finishRestore(parentId, group) {
    // Keep the parent's gate closed until every child is restored.
    for (const id of group.restoreIds) {
      if (state.threads[id]?.detached !== true) await rawRestore(id)
    }
    await rawRestore(parentId)
    await dropGroup(parentId)
  }
  ready = (async () => {
    domain = await ctx.get('storageDomain').open(spec)
    state = domain.global.get()
    await scan()
  })()
  // Keep initialization errors observable to callers without an unhandled rejection.
  ready.catch(error => ctx.logger?.warn('sidebar-chat lifecycle: ' + error.message))

  const archive = (id, options = {}) => serial(async () => {
    await scan()
    const row = state.threads[id]
    if (row && !row.detached) {
      await archiveMember(id, options)
      return
    }
    if (state.groups[id]?.phase === 'deleting') throw new Error('This conversation is being deleted.')
    let group = state.groups[id]
    if (group?.phase === 'archived' && archived(id)) return
    if (!group) {
      group = { restoreIds: members(id).filter(child => !archived(child)), phase: 'archiving' }
      await putGroup(id, group)
    }
    try { await finishArchive(id, group, options) } catch (error) {
      // A normal active-task refusal happened before the parent was archived.
      if (!archived(id)) await dropGroup(id)
      throw error
    }
  })
  const restore = id => serial(async () => {
    await scan()
    const row = state.threads[id]
    if (row && !row.detached) {
      if (archived(row.parentId)) throw new Error('Restore the main conversation first.')
      await rawRestore(id)
      return
    }
    const group = state.groups[id]
    if (!group) return rawRestore(id)
    if (group.phase === 'deleting') throw new Error('This conversation is being deleted.')
    await putGroup(id, { ...group, phase: 'restoring' })
    await finishRestore(id, group)
  })
  workspace.archiveSession = archive
  workspace.unarchiveSession = restore

  // Retain the public factory's disposal handle. Never edit a live log or move
  // its directory while an Agent still owns the persistence writer.
  const originals = new Map()
  for (const method of ['create', 'resume']) {
    const original = agents[method]
    if (typeof original !== 'function') continue
    const wrapped = async function (...args) {
      const handle = await original.apply(this, args)
      handles.set(handle.agent.id ?? handle.agent.session.id, handle)
      return handle
    }
    originals.set(method, { original, wrapped })
    agents[method] = wrapped
  }

  const service = {
    ready,
    forgetArchive: rawRestore,
    subscribeDetached(listener) {
      detachedListeners.add(listener)
      listener(detachedIds())
      return () => detachedListeners.delete(listener)
    },
    async close(parentId, childId) {
      return serial(async () => {
        const row = state.threads[childId]
        if (!row || row.parentId !== parentId) throw new Error('This side chat does not belong to this conversation.')
        if (!row.detached) await archiveMember(childId, { stopActivity: true })
        return { childId, detached: row.detached }
      })
    },
    async create(parentId, operation) {
      return serial(async () => {
        service.assertCanStart(parentId)
        return operation(async header => {
          await save({ ...state, threads: { ...state.threads, [header.id]: { parentId, createdAt: header.createdAt, detached: false } } })
        })
      })
    },
    async register(header) {
      return serial(async () => {
        if (archived(header.parentSession) || state.groups[header.parentSession]) throw new Error('The main conversation is archived or changing state.')
        await save({ ...state, threads: { ...state.threads, [header.id]: { parentId: header.parentSession, createdAt: header.createdAt, detached: false } } })
      })
    },
    assertCanStart(parentId) {
      if (archived(parentId) || state?.groups[parentId]) throw new Error('Restore the main conversation before starting a side chat.')
    },
    isDetached(id) { return state?.threads[id]?.detached === true },
    isBlocked(id) {
      const row = state?.threads[id]
      return state?.groups[id]?.phase === 'deleting' || (row && !row.detached
        && (archived(row.parentId) || state.groups[row.parentId] !== undefined))
    },
    async inventory(parentId) {
      return serial(async () => {
        await scan()
        return members(parentId).map(id => ({ id, ...state.threads[id], archived: archived(id) }))
      })
    },
    async repairDetachedWorktrees() {
      await ready
      for (const [id, row] of Object.entries(state.threads)) {
        if (!row.detached || row.worktreeLinked) continue
        try { await service.detach(row.parentId, id, { repair: true }) } catch (error) {
          ctx.logger?.warn('sidebar-chat worktree repair ' + id + ': ' + error.message)
        }
      }
    },
    async detach(parentId, childId, { repair = false } = {}) {
      return serial(async () => {
        await scan()
        const row = state.threads[childId]
        if (!row || row.parentId !== parentId) throw new Error('This side chat does not belong to this conversation.')
        if (row.detached && !repair) return { childId, workspaceId: workspace.list().find(item => item.sessionIds.includes(childId))?.id ?? null }
        // Previously detached conversations may have been deliberately moved or
        // archived. Recovery only considers ungrouped, unarchived old entries.
        if (repair && (row.worktreeLinked || archived(childId) || workspace.list().some(item => item.sessionIds.includes(childId)))) return { childId }
        if (!row.detached && state.groups[parentId]) throw new Error('Restore the main conversation before detaching a side chat.')
        // The parent may have moved since this child was seeded. Membership
        // must follow the child's own canonical cwd, as attachSession requires.
        let value = await read(childId)
        let targetWorkspace = value.header.cwd ? await workspace.resolveByPath(value.header.cwd) : undefined
        const worktrees = ctx.get('worktreeSessions')
        if (repair && (targetWorkspace || !worktrees)) return { childId }
        let moved, mover, attach = false
        try {
          if (!targetWorkspace && worktrees && value.header.cwd) {
            // Only Git-verified, plugin-managed trees qualify for this legacy
            // repair. Never infer ownership from the parent's current workspace.
            const membership = await worktrees.describe(value.header.cwd)
            if (repair && !membership) return { childId }
            targetWorkspace = membership && await workspace.resolveByPath(membership.projectPath)
            if (repair && !targetWorkspace) return { childId }
            if (targetWorkspace) {
              mover = ctx.get('sessionMover')
              if (!mover) throw new Error('旧侧边对话需要启用“对话搬家”插件后重试，才能保留工作树并修复项目归属。')
              moved = await mover.move({ sessionId: childId, workspaceId: targetWorkspace.id, preserveWorkingDirectory: true })
              if (!moved.ok) throw new Error(moved.error || '无法修复侧边对话的项目归属。')
              value = await read(childId)
            }
          }
          const cwd = [...value.events].reverse().find(event => event.type === 'working-directory/change')?.data.cwd ?? value.header.cwd
          if (worktrees && cwd) await worktrees.register(cwd, childId)
          attach = targetWorkspace && !targetWorkspace.sessionIds.includes(childId)
          if (attach) await targetWorkspace.attachSession(childId)
          await save({ ...state, threads: { ...state.threads, [childId]: { ...row, detached: true, worktreeLinked: Boolean(worktrees) } } })
        } catch (error) {
          if (attach) {
            try { await targetWorkspace.detachSession(childId) } catch (rollback) {
              ctx.logger?.warn('sidebar-chat workspace rollback: ' + rollback.message)
            }
          }
          if (moved?.ok && moved.undoToken) {
            try {
              const rollback = await mover.move({ sessionId: childId, undoToken: moved.undoToken })
              if (!rollback.ok) throw new Error(rollback.error)
            } catch (rollback) { ctx.logger?.warn('sidebar-chat project rollback: ' + rollback.message) }
          }
          throw error
        }
        for (const listener of detachedListeners) {
          try { listener(detachedIds()) } catch (error) { ctx.logger?.warn('sidebar-chat visibility: ' + error.message) }
        }
        return { childId, workspaceId: targetWorkspace?.id ?? null }
      })
    },
    async deletionPlan(parentId) {
      return serial(async () => { await scan(); return plan(parentId) })
    },
    async pendingDeletions() {
      return serial(() => Object.keys(state.groups).filter(id => state.groups[id].phase === 'deleting'))
    },
    async deleteGroup(parentId, expectedIds, operation) {
      return serial(async () => {
        await scan()
        const current = plan(parentId)
        if (JSON.stringify(current.ids) !== JSON.stringify(expectedIds)) throw new Error('The side chat list changed. Review the deletion again.')
        const group = state.groups[parentId]
        let mutationStarted = false
        await putGroup(parentId, { restoreIds: group?.restoreIds ?? [], phase: 'deleting' })
        try {
          const result = await operation(current, release, () => { mutationStarted = true })
          const threads = { ...state.threads }
          for (const id of current.ids) delete threads[id]
          const groups = Object.fromEntries(Object.entries(state.groups).map(([id, row]) => [id, { ...row, restoreIds: row.restoreIds.filter(child => !current.ids.includes(child)) }]))
          await save({ ...state, threads, groups })
          await dropGroup(parentId)
          return result
        } catch (error) {
          if (!mutationStarted) {
            if (group) await putGroup(parentId, group)
            else await dropGroup(parentId)
          }
          // Keep the journal/membership for safe retries after a partial deletion.
          throw error
        }
      })
    },
    async dispose() {
      await tail
      if (workspace.archiveSession === archive) workspace.archiveSession = originalArchive
      if (workspace.unarchiveSession === restore) workspace.unarchiveSession = originalRestore
      for (const [method, { original, wrapped }] of originals) if (agents[method] === wrapped) agents[method] = original
      handles.clear()
      detachedListeners.clear()
      await domain?.close()
    },
  }
  function plan(parentId) {
    const ids = [...members(parentId), parentId].sort()
    // Detached children are ordinary independent conversations, even though an
    // immutable historical header still records the source of their seed.
    return { ids, detachedIds: detachedIds(), deleting: state.groups[parentId]?.phase === 'deleting', sideCount: ids.length - 1, archivedSideCount: ids.filter(id => id !== parentId && archived(id)).length }
  }
  async function release(id) {
    const live = agents.get(id)
    if (!live) return
    if (live.status === 'running') throw new Error('Stop the conversation before deleting it.')
    const handle = handles.get(id)
    if (isSideHeader(live.session?.header)) await releaseThread(id)
    if (agents.get(id) === live && handle?.agent === live) await handle.dispose()
    handles.delete(id)
    if (agents.get(id) !== undefined) throw new Error('The conversation is still open. Close it before deleting it.')
  }
  // Native archive confirmation includes activity in every attached side chat.
  ctx.on('workspace/session-activity', async (request, next) => {
    const activity = await next()
    await ready
    await scan()
    for (const child of members(request.sessionId)) {
      const entries = await ctx.waterfall('workspace/session-activity', { sessionId: child }, () => Promise.resolve([]))
      activity.push(...entries)
    }
    return activity
  })
  ctx.on('agent/pre-step', (payload, next) => service.isBlocked(payload.agent.id) ? Promise.resolve({ kind: 'reject' }) : next())
  // Recover outside initialization: the native archive activity hooks await ready.
  serial(async () => {
    for (const [id, group] of Object.entries(state.groups)) {
      if (group.phase === 'archiving') await finishArchive(id, group)
      if (group.phase === 'restoring') await finishRestore(id, group)
    }
  }).catch(error => ctx.logger?.warn('sidebar-chat recovery: ' + error.message))
  return service
}
