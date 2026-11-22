/**
 * Host half of the archived-sessions manager.
 *
 * The framework has no delete-a-session API anywhere — `sessionPersistence` is
 * append-only (`create/open/stat/list/flush` only), `sessionController` has no
 * delete, and `workspaceRegistry.delete` removes a workspace registration while
 * keeping every session. So permanent deletion is an out-of-band maintenance
 * operation, and this route is the only entry point to it.
 *
 * Everything the App knows about a session is derived from its durable log. The
 * log removal must therefore be verified before clearing its archive marker.
 */

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'archived-sessions'

/**
 * `storageDomain` is deliberately absent: the projection cache is a pure derived
 * cache, so its cleanup is best-effort through `ctx.get` and never gates the
 * operation. `agents`/`sessions` are read through `ctx.get` for the same reason.
 */
export const inject = ['webServer', 'connection', 'workspaceRegistry', 'sessionPersistence']

/** Route prefix. Chosen to avoid `/plugins`, `/open-in-app/*` and the `/api` RPC channel. */
const ROUTE = '/archived-sessions/api'

/** Quarantine folder under DSH_HOME, deliberately OUTSIDE `sessions/`. */
const QUARANTINE_DIR = '.deleted-sessions'
const PENDING_DIR = '.archive-deletion-plans'

/** Guard against a traversal segment reaching the filesystem as a path. */
const SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/

const MAX_BODY_BYTES = 64 * 1024
const MAX_BATCH_SIZE = 1000

/** A session id is a single safe path segment; reject anything else outright. */
function isSafeSessionId(value) {
  return typeof value === 'string' && SAFE_SESSION_ID.test(value) && value !== '.' && value !== '..'
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function sendMethodNotAllowed(res, allowed) {
  res.setHeader('allow', allowed)
  sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: `use ${allowed}` } })
}

function statusFor(code) {
  switch (code) {
    case 'bad-request': return 400
    case 'session/unknown': return 404
    case 'session/active':
    case 'session/has-children':
    case 'session/duplicate-artifacts': return 409
    default: return 500
  }
}

function deletionError(error) {
  if (error.blockers) return { code: 'session/has-children', message: error.message, details: { blockers: error.blockers } }
  if (error.active) return { code: 'session/active', message: error.message, details: { sessionId: error.active } }
  return { code: error.code === 'archive/scope-changed' ? 'bad-request' : 'internal', message: error.message || String(error) }
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

export function apply(ctx) {
  const confirmations = new Map()
  let deleteTail = Promise.resolve()
  let lineageRevision = 0
  ctx.on?.('session/created', session => {
    if (session.header?.parentSession) lineageRevision++
  }, { global: true })
  const lifecycle = () => ctx.get('sidebarChatLifecycle')
  const emptyIndex = { parents: new Map(), children: new Map(), detached: new Set() }
  const scopeChanged = () => Object.assign(new Error('The deletion scope changed or expired. Review it again.'), { code: 'archive/scope-changed' })

  const pendingPath = id => home(PENDING_DIR, id + '.json')
  async function pendingIds() {
    const entries = await readdir(home(PENDING_DIR), { withFileTypes: true }).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return []
    })
    return entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name.slice(0, -5)).filter(isSafeSessionId)
  }
  async function readPending(id) {
    const ids = JSON.parse(await readFile(pendingPath(id), 'utf8'))
    if (!Array.isArray(ids) || ids.length < 2 || ids.at(-1) !== id
      || !ids.every(isSafeSessionId) || new Set(ids).size !== ids.length) {
      throw new Error('Invalid pending deletion plan for ' + id)
    }
    return ids
  }
  async function savePending(id, ids) {
    await mkdir(home(PENDING_DIR), { recursive: true })
    const temporary = home(PENDING_DIR, randomUUID() + '.tmp')
    try {
      await writeFile(temporary, JSON.stringify(ids), { flag: 'wx', flush: true })
      await rename(temporary, pendingPath(id))
    } finally { await rm(temporary, { force: true }) }
  }

  async function deletionPlans(ids, service = lifecycle()) {
    const known = new Set(await pendingIds())
    const plans = service?.deletionPlans ? await service.deletionPlans(ids)
      : service ? await Promise.all(ids.map(id => service.deletionPlan(id)))
        : ids.map(id => ({ ids: [id], index: emptyIndex }))
    return Promise.all(plans.map(async (plan, i) => {
      const standalone = known.has(ids[i]) ? await readPending(ids[i]) : undefined
      return standalone ? { ...plan, standalone, deleting: true } : plan
    }))
  }

  // Old side chats used origin=subagent too. Only an own descriptor identifies
  // a real subagent outside the side-chat lifecycle's registered membership.
  async function isOwnedSubagent(header) {
    try {
      const live = ctx.get('sessions')?.get?.(header.id)
      const handle = live ? null : await ctx.sessionPersistence.open(header.id, 'read')
      try {
        const { events } = handle ? await handle.read() : { events: live.snapshotEvents() }
        const inherited = (handle ?? live).inheritedEventCount
        const offset = inherited ?? (header.isSeeded ? NaN : 0)
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > events.length) return false
        const descriptor = events.slice(offset).find(event => event.type === 'subagent/descriptor')?.data
        return (descriptor?.version === 2 || descriptor?.version === 3)
          && typeof descriptor.provider === 'string' && descriptor.provider.length > 0
          && (descriptor.mode === 'one-shot' || (descriptor.mode === 'continuable' && typeof descriptor.label === 'string'))
      } finally { await handle?.close() }
    } catch {
      return false
    }
  }

  async function expandPlan(root, plan, catalog) {
    const { detached, parents: sideParents, children: sideChildren } = plan.index ?? legacySideIndex(root, plan)
    const ignored = new Set()
    const ids = [], visited = new Set(), visiting = new Set(), blockers = new Set()
    const inspect = async id => {
      if (visiting.has(id)) { blockers.add(id); return }
      if (visited.has(id)) return
      visiting.add(id)
      const children = catalog.lineage.get(id) ?? new Map()
      const candidates = new Set([...(sideChildren.get(id) ?? []), ...children.keys()])
      for (const child of [...candidates].sort()) {
        if (detached.has(child)) { ignored.add(child); continue }
        const header = children.get(child)
        if (!isSafeSessionId(child) || (sideParents.has(child) && sideParents.get(child) !== id)
          || (catalog.parents.has(child) && catalog.parents.get(child) !== id)) { blockers.add(child); continue }
        if (sideParents.get(child) === id || (header?.origin === 'subagent' && await isOwnedSubagent(header))) {
          await inspect(child)
        } else if (header?.origin === undefined && (header?.delegationDepth ?? 0) === 0) {
          // Historical ordinary forks copied their history. The source ID is not ownership.
          ignored.add(child)
        } else {
          blockers.add(child)
        }
      }
      visiting.delete(id)
      visited.add(id)
      ids.push(id)
    }
    // A previous attempt may have moved a child's log before its removal was
    // verified. Reconcile that ID, but never use the journal to claim live logs.
    for (const id of [...(plan.deleteIds ?? []), ...(plan.standalone ?? [])]) {
      if (id !== root && isSafeSessionId(id) && !detached.has(id) && !catalog.headers.has(id)) await inspect(id)
    }
    await inspect(root)
    return { ids, ignored, blockers: blockers.size ? [...blockers].sort() : null }
  }

  // A separately installed older sidebar package may still return arrays.
  function legacySideIndex(root, plan) {
    const parents = new Map(plan.sideParents ?? plan.ids.filter(id => id !== root).map(id => [id, root]))
    const children = new Map()
    for (const [id, parent] of parents) {
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent).push(id)
    }
    return { detached: new Set(plan.detachedIds), parents, children }
  }

  async function preview(ids) {
    const plans = await deletionPlans(ids)
    const catalog = await loadLineage()
    const time = Date.now()
    for (const [token, value] of confirmations) if (time - value.time > 600000) confirmations.delete(token)
    return Promise.all(plans.map(async (plan, i) => {
      const { ids: scope, blockers } = await expandPlan(ids[i], plan, catalog)
      const confirmation = randomUUID()
      confirmations.set(confirmation, { id: ids[i], ids: scope, time })
      return { ids: scope, deleting: plan.deleting, confirmation, blockers }
    }))
  }

  async function deleteGroup(id, confirmation, batch) {
    if (!isSafeSessionId(id)) return { ok: false, error: { code: 'bad-request', message: 'sessionId must be a plain session id' } }
    const service = lifecycle()
    const [plan] = await deletionPlans([id], service)
    const approved = confirmations.get(confirmation)
    const validConfirmation = () => approved?.id === id && Date.now() - approved.time <= 600000
    if (batch || service || plan.standalone || confirmation !== undefined) {
      if (!validConfirmation()) throw scopeChanged()
      if (!plan.deleting && !ctx.workspaceRegistry.archivedSessionIds.includes(id)) {
        return { ok: false, error: { code: 'bad-request', message: 'Archive the main conversation before deleting it.' } }
      }
    }
    const perform = async (current, release = async () => {}, beginMutation = async () => {}) => {
      const catalog = await (batch ?? batchCatalog()).catalog()
      const { ids, ignored, blockers } = await expandPlan(id, current, catalog)
      if (blockers) throw Object.assign(new Error('Could not identify linked conversations: ' + blockers.join(', ')), { blockers })
      if ((batch || service || plan.standalone || ids.length > 1 || confirmation !== undefined)
        && (!validConfirmation() || JSON.stringify(approved.ids) !== JSON.stringify(ids))) {
        throw scopeChanged()
      }
      if (!service && !plan.standalone && ids.length === 1) {
        const result = await deleteSession(id, { ignoredChildren: ignored, catalog })
        if (result.ok) confirmations.delete(confirmation)
        return result
      }
      for (const target of ids) {
        if (!isSafeSessionId(target)) throw new Error('Invalid child session id')
        if ((await locateSessionDirs(target)).length > 1) throw new Error('Duplicate session directories; deletion refused.')
        const activity = await ctx.waterfall('workspace/session-activity', { sessionId: target }, () => Promise.resolve([]))
        if (activity.length) throw Object.assign(new Error('Stop all tasks before deleting conversation ' + target + '.'), { active: target })
      }
      // Release all writers before touching the first directory.
      for (const target of ids) {
        try { await release(target) } catch (error) { throw Object.assign(error, { active: target }) }
      }
      for (const target of ids) {
        if (ctx.get('agents')?.get?.(target) || ctx.get('sessions')?.get?.(target)) {
          throw Object.assign(new Error('Close conversation ' + target + ' before deleting it.'), { active: target })
        }
      }
      const deleted = []
      const remaining = []
      let purged = 0
      // Do not rebuild or broaden the approved group mid-operation.
      await beginMutation(ids)
      if (!service && ids.length > 1) await savePending(id, ids)
      for (const target of ids) {
        const result = await deleteSession(target, { ignoredChildren: ignored, keepArchived: true, catalog })
        if (!result.ok) throw Object.assign(new Error(result.error.message), result.error.code === 'session/active' ? { active: target } : {})
        deleted.push(target)
        purged += result.value.purged
        remaining.push(...result.value.remaining)
      }
      // Keep the archive rows discoverable until the entire group has moved.
      // Keep the journal until both log removal and archive cleanup succeed.
      for (const target of ids) {
        if (service) await service.forgetArchive(target)
        else await ctx.workspaceRegistry.unarchiveSession(target)
      }
      confirmations.delete(confirmation)
      return {
        ok: true,
        value: {
          sessionId: id,
          deletedSessionIds: deleted,
          purged,
          remaining,
          quarantine: home(QUARANTINE_DIR),
          // A machine code, not prose: the client owns the localized wording.
          warning: remaining.length === 0 ? null : 'quarantine-partial',
        },
      }
    }
    const result = service ? await service.deleteGroup(id, plan.ids, (current, ...args) => perform({ ...current, standalone: plan.standalone }, ...args))
      : await perform(plan)
    if (result.ok && (plan.standalone || (!service && result.value.deletedSessionIds))) await rm(pendingPath(id), { force: true })
    return result
  }
  /** Resolve a path under DSH_HOME through the boot-provided helper when present. */
  const home = (...segments) => {
    const resolver = ctx.get('dshHomePath')
    if (typeof resolver === 'function') return resolver(...segments)
    const base = process.env.DSH_HOME || join(homedir(), '.dsh')
    return join(base, ...segments)
  }

  const sessionsRoot = () => home('sessions')

  /**
   * Staged copies this plugin left behind: `<stamp>__<id>` and its manifest.
   * The name pattern is the plugin's own, so purge never touches anything else
   * that happens to live in the quarantine folder.
   */
  async function stagedEntries(id) {
    let entries
    try {
      entries = await readdir(home(QUARANTINE_DIR), { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const matches = []
    for (const entry of entries) {
      const { name } = entry
      const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z)__(.+)$/.exec(name)
      if (!match) continue
      const [stamp, raw] = match.slice(1)
      const date = new Date(stamp.slice(0, 13) + ':' + stamp.slice(14, 16) + ':' + stamp.slice(17, 19) + '.' + stamp.slice(20))
      if (!Number.isFinite(date.getTime()) || date.toISOString().replace(/[:.]/g, '-') !== stamp) continue
      // A directory's entire suffix is its ID, even when it ends in .json.
      // Only regular manifest files have the extra .json extension; skip links.
      const stem = entry.isDirectory() ? raw
        : entry.isFile() && raw.endsWith('.json') ? raw.slice(0, -5) : null
      if (!isSafeSessionId(stem)) continue
      if (id === undefined || stem === id) matches.push(name)
    }
    return matches
  }

  /**
   * Remove staged copies for one session, or every staged copy when id is
   * omitted. Returns the removals and the failures separately so a partial
   * purge is reported instead of being mistaken for a complete deletion.
   */
  async function purgeStaged(id) {
    const root = home(QUARANTINE_DIR)
    const names = await stagedEntries(id)
    const failures = []
    let removed = 0
    for (const name of names) {
      try {
        await rm(join(root, name), { recursive: true, force: true })
        removed += 1
      } catch (error) {
        failures.push({ name, message: error && error.message ? error.message : String(error) })
      }
    }
    return { removed, failures }
  }

  /**
   * Find every stored directory for one session id.
   *
   * A session directory is named after the encoded id, and a real `session-<uuid>`
   * id encodes to itself. More than one match is the one condition that breaks the
   * whole application: the JSONL backend throws
   * `duplicate JSONL session id ... appears in multiple project directories`, which
   * fails `sessionPersistence.list()` and with it the session list and workspace
   * grouping. Callers must refuse rather than guess which copy is real.
   */
  async function locateSessionDirs(id) {
    let projectDirs
    try {
      projectDirs = await readdir(sessionsRoot(), { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const found = []
    for (const entry of projectDirs) {
      if (!entry.isDirectory()) continue
      const candidate = join(sessionsRoot(), entry.name, id)
      try {
        const info = await stat(candidate)
        if (info.isDirectory()) found.push(candidate)
      } catch (error) {
        // Absent in this project directory; that is the normal case.
        if (error.code !== 'ENOENT') throw error
      }
    }
    return found
  }

  async function loadLineage() {
    const revision = lineageRevision
    const snapshots = await ctx.sessionPersistence.list()
    const lineage = new Map(), parents = new Map(), headers = new Map()
    const live = ctx.get('sessions')?.list?.() ?? ctx.get('agents')?.list?.().map(agent => agent.session) ?? []
    for (const { header } of [...snapshots, ...live.filter(Boolean)]) {
      if (header?.id) headers.set(header.id, header)
    }
    for (const header of headers.values()) {
      if (!header.parentSession) continue
      const children = lineage.get(header.parentSession) ?? new Map()
      children.set(header.id, header)
      lineage.set(header.parentSession, children)
      parents.set(header.id, header.parentSession)
    }
    return { lineage, parents, headers, revision }
  }

  async function inventory(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return []
    })
    return entries.filter(entry => entry.isDirectory()).map(entry => join(dir, entry.name))
  }

  async function sessionDirs() {
    const projects = await inventory(sessionsRoot())
    return new Set((await Promise.all(projects.map(inventory))).flat())
  }

  function sameDirs(before, after) {
    return before.size === after.size && [...after].every(dir => before.has(dir))
  }

  // Other profiles can share the store without emitting local Cordis events.
  // Check directory names between groups; only reopen log headers on changes.
  function batchCatalog() {
    let cached
    return {
      async catalog() {
        const dirs = await sessionDirs()
        if (!cached || cached.revision !== lineageRevision || !sameDirs(cached.dirs, dirs)) {
          cached = { ...await loadLineage(), dirs }
        }
        return cached
      },
    }
  }

  async function streamBatch(plans, res) {
    if (res.destroyed) return
    const batch = batchCatalog()
    for (const { sessionId, confirmation } of plans) {
      if (res.destroyed) return
      let result
      try {
        result = await deleteGroup(sessionId, confirmation, batch)
      } catch (error) {
        result = { ok: false, error: deletionError(error) }
      }
      if (res.destroyed) return
      if (!res.headersSent) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
      }
      res.write(JSON.stringify({ sessionId, ...result }) + '\n')
    }
    if (!res.destroyed) res.end(JSON.stringify({ done: true }) + '\n')
  }

  /** How many per-record projection-cache documents exist right now. */
  async function projectionCacheCount() {
    try {
      const names = await readdir(home('storages', 'session_projcache', 'sessions'))
      return names.filter((entry) => entry.endsWith('.json') && !entry.includes('.bak.')).length
    } catch {
      return 0
    }
  }

  /**
   * Drop one projection-cache record through the domain API.
   *
   * The domain layer keeps memory authoritative and treats its files as a
   * projection, so deleting the file alone is a no-op — the record keeps being
   * served and is rewritten at the next checkpoint.
   *
   * The last remaining record is deliberately left in place: an empty per-record
   * tree makes the JSON storage backend bootstrap the legacy `single`-layout unit
   * (`storages/session_projcache.json`, v3, ~126 records) back into v7 documents,
   * because v3 sits inside the spec's `compatibleVersions`. One stale record is
   * harmless — a fold seed requires formatVersion, lifecycle and
   * `inheritedEventCount` to match exactly — whereas that resurrection is not.
   */
  async function cleanProjectionCache(id, remaining) {
    if (remaining <= 1) return remaining === 1 ? 'skipped-last-record' : 'absent'
    const domain = ctx.get('storageDomain')?.get?.('session_projcache')
    const table = domain?.table?.('sessions')
    if (table === undefined || typeof table.delete !== 'function') return 'unavailable'
    await table.delete(id)
    return 'deleted'
  }

  /**
   * Permanently remove one archived session.
   *
   * Keep the archive marker until the log is gone and clients have received the
   * removal event. Otherwise a cached list row becomes visible as unarchived.
   * Stage outside `sessions/` before purging so interrupted removal never leaves
   * a half-written directory that the JSONL backend would try to parse.
   */
  async function deleteSession(id, { ignoredChildren, keepArchived = false, catalog }) {
    if (!isSafeSessionId(id)) {
      return { ok: false, error: { code: 'bad-request', message: 'sessionId must be a plain session id' } }
    }

    // Refuse to touch a session that is still live or still doing work: its write
    // handle keeps the path, and on Windows the lease is a named kernel semaphore
    // that does NOT block the move — the log would silently reappear or corrupt.
    if (ctx.get('agents')?.get?.(id) !== undefined || ctx.get('sessions')?.get?.(id) !== undefined) {
      return { ok: false, error: { code: 'session/active', message: 'session is live in this process' } }
    }
    let activity
    try {
      activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
    } catch (error) {
      return { ok: false, error: { code: 'internal', message: `activity probe failed: ${error && error.message ? error.message : String(error)}` } }
    }
    if (Array.isArray(activity) && activity.length > 0) {
      return {
        ok: false,
        error: {
          code: 'session/active',
          message: 'session still has running work',
          details: { activity: activity.map((entry) => ({ kind: entry.kind, items: entry.items ?? [] })) },
        },
      }
    }

    // Even after group planning, refuse to orphan any child that wasn't cleared
    // for deletion or identified as independent.
    if (catalog.revision !== lineageRevision) throw scopeChanged()
    const children = [...(catalog.lineage.get(id)?.keys() ?? [])].filter(child => !ignoredChildren.has(child))
    if (children.length > 0) {
      return {
        ok: false,
        error: { code: 'session/has-children', message: 'session still owns child sessions', details: { children } },
      }
    }

    const directories = await locateSessionDirs(id)
    if (directories.length > 1) {
      return {
        ok: false,
        error: {
          code: 'session/duplicate-artifacts',
          message: 'this session id exists in more than one project directory; refusing to guess',
          details: { directories },
        },
      }
    }

    let movedFrom
    let movedTo
    let quarantineRoot
    if (directories.length === 1) {
      movedFrom = directories[0]
      quarantineRoot = home(QUARANTINE_DIR)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      movedTo = join(quarantineRoot, `${stamp}__${id}`)
      await mkdir(quarantineRoot, { recursive: true })
      // Move before removing: a partial unlink inside `sessions/` would leave a
      // half-written directory that every later `sessionPersistence.list()` tries
      // to parse, which breaks the session list for unrelated conversations.
      // Another process may create a child while this group is deleting its
      // earlier members. Stop on any unexpected change, including a directory
      // whose writer has not finished its header. Retry takes a fresh inventory.
      if (!sameDirs(catalog.dirs, await sessionDirs()) || catalog.revision !== lineageRevision) throw scopeChanged()
      await rename(movedFrom, movedTo)
      catalog.dirs.delete(movedFrom)
    }

    // The label says permanent, so the staged log is deleted as well. This also
    // retries copies left behind by older versions that only moved the log.
    const purged = await purgeStaged(id)
    if (purged.failures.length > 0) {
      // Keep a manifest only when something survived, so an out-of-band cleanup
      // can identify the copy and a later retry can finish the job.
      if (quarantineRoot) {
        await writeFile(
          join(quarantineRoot, new Date().toISOString().replace(/[:.]/g, '-') + `__${id}.json`),
          JSON.stringify({ sessionId: id, removedAt: new Date().toISOString(), failed: purged.failures }, null, 2),
          'utf8',
        ).catch(() => {})
      }
    }

    try {
      if ((await ctx.sessionPersistence.stat(id)) !== undefined) {
        return { ok: false, error: { code: 'session/delete-unverified', message: 'The session is still stored. Its archive marker was kept; retry deletion.' } }
      }
    } catch (error) {
      return { ok: false, error: { code: 'session/delete-unverified', message: `Could not verify deletion; the archive marker was kept: ${error.message}` } }
    }

    catalog.lineage.get(catalog.parents.get(id))?.delete(id)
    catalog.parents.delete(id)
    catalog.headers.delete(id)

    const projectionCache = await cleanProjectionCache(id, await projectionCacheCount())
    const detached = []
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(id)) continue
      await workspace.detachSession(id)
      detached.push(workspace.id)
    }
    // Filesystem removal does not emit session/disposed. Notify every connected
    // client explicitly before dropping the archive filter over its cached row.
    ctx.emit('api-session/removed', id)
    if (!keepArchived) {
      const unarchive = ctx.get('sidebarChatLifecycle')?.forgetArchive
      if (unarchive) await unarchive(id)
      else await ctx.workspaceRegistry.unarchiveSession(id)
    }

    return {
      ok: true,
      value: {
        sessionId: id,
        logFound: directories.length === 1,
        movedFrom,
        movedTo,
        quarantine: home(QUARANTINE_DIR),
        purged: purged.removed,
        remaining: purged.failures.map((failure) => failure.name),
        // A machine code, not prose: the client owns the localized wording.
        warning: purged.failures.length === 0 ? null : 'quarantine-partial',
        ledgerUnarchived: !keepArchived,
        ledgerDetached: detached,
        projectionCache,
        stillStored: false,
      },
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: async (req, res) => {
          // A destructive route carries the same browser authentication and
          // Host/Origin checks as the shipped ones; an unauthenticated local
          // process must not be able to delete a session with one POST.
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            sendJson(res, rejection, { ok: false, error: { code: 'unauthorized', message: 'request rejected' } })
            return
          }
          if (req.method !== 'POST') {
            sendMethodNotAllowed(res, 'POST')
            return
          }
          const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
          if (contentType !== 'application/json') {
            sendJson(res, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'content-type must be application/json' } })
            return
          }

          const pathname = new URL(String(req.url), 'http://localhost').pathname
          const operation = pathname.slice(ROUTE.length).replace(/^\//, '')
          if (!['delete', 'preview', 'preview-batch', 'delete-batch', 'pending', 'leftovers', 'purge'].includes(operation)) {
            sendJson(res, 404, { ok: false, error: { code: 'unknown-operation', message: `unknown operation "${operation}"` } })
            return
          }

          let body
          try {
            const many = operation === 'preview-batch' || operation === 'delete-batch'
            body = await readJsonBody(req, many ? 512 * 1024 : MAX_BODY_BYTES)
          } catch (error) {
            sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: error && error.message ? error.message : String(error) } })
            return
          }

          try {
            if (operation === 'pending') {
              const ids = [...new Set([...(await lifecycle()?.pendingDeletions?.() ?? []), ...await pendingIds()])]
              sendJson(res, 200, { ok: true, value: { ids } })
              return
            }
            if (operation === 'preview' || operation === 'preview-batch') {
              const single = operation === 'preview'
              const ids = single ? [body?.sessionId] : body?.sessionIds
              if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH_SIZE
                || !ids.every(isSafeSessionId) || new Set(ids).size !== ids.length) {
                sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'Invalid session IDs.' } })
                return
              }
              const plans = await preview(ids)
              sendJson(res, 200, { ok: true, value: single ? plans[0] : plans })
              return
            }
            if (operation === 'delete-batch') {
              const plans = body?.plans
              if (!Array.isArray(plans) || plans.length === 0 || plans.length > MAX_BATCH_SIZE
                || !plans.every(plan => isSafeSessionId(plan?.sessionId) && typeof plan.confirmation === 'string')
                || new Set(plans.map(plan => plan.sessionId)).size !== plans.length) {
                sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'Invalid deletion plans.' } })
                return
              }
              const task = deleteTail.then(() => streamBatch(plans, res))
              deleteTail = task.catch(() => {})
              await task
              return
            }
            if (operation === 'leftovers') {
              sendJson(res, 200, { ok: true, value: { count: (await stagedEntries()).length } })
              return
            }
            if (operation === 'purge') {
              // Serialize with delete so a purge cannot remove a directory that a
              // delete in flight has just staged but not yet reported.
              const task = deleteTail.then(() => purgeStaged())
              deleteTail = task.catch(() => {})
              const purged = await task
              sendJson(res, 200, { ok: true, value: purged })
              return
            }
            const task = deleteTail.then(() => deleteGroup(body.sessionId, body.confirmation))
            deleteTail = task.catch(() => {})
            const result = await task
            sendJson(res, result.ok ? 200 : statusFor(result.error.code), result)
          } catch (error) {
            ctx.logger.warn(`archived-sessions: delete failed: ${error && error.stack ? error.stack : String(error)}`)
            const detail = deletionError(error)
            sendJson(res, statusFor(detail.code), { ok: false, error: detail })
          }
        },
      }),
    `archived-sessions: POST ${ROUTE}/delete`,
  )
}
