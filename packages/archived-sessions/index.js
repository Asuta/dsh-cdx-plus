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

import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
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

/** Guard against a traversal segment reaching the filesystem as a path. */
const SAFE_SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/

const MAX_BODY_BYTES = 64 * 1024

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

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

export function apply(ctx) {
  const confirmations = new Map()
  let deleteTail = Promise.resolve()
  const lifecycle = () => ctx.get('sidebarChatLifecycle')
  const deletionPlan = async id => lifecycle() ? lifecycle().deletionPlan(id)
    : { ids: [id], detachedIds: [], sideCount: 0, archivedSideCount: 0 }

  async function preview(id) {
    if (!isSafeSessionId(id)) throw new Error('sessionId must be a plain session id')
    const plan = await deletionPlan(id)
    for (const [token, value] of confirmations) if (Date.now() - value.time > 600000) confirmations.delete(token)
    const confirmation = randomUUID()
    confirmations.set(confirmation, { id, ids: plan.ids, time: Date.now() })
    return { ...plan, confirmation }
  }

  async function deleteGroup(id, confirmation) {
    const plan = await deletionPlan(id)
    if (lifecycle() || plan.sideCount > 0) {
      const approved = confirmations.get(confirmation)
      if (!approved || approved.id !== id || Date.now() - approved.time > 600000
        || JSON.stringify(approved.ids) !== JSON.stringify(plan.ids)) {
        return { ok: false, error: { code: 'bad-request', message: 'The deletion scope changed or expired. Review it again.' } }
      }
      if (!plan.deleting && !ctx.workspaceRegistry.archivedSessionIds.includes(id)) {
        return { ok: false, error: { code: 'bad-request', message: 'Archive the main conversation before deleting it.' } }
      }
    }
    const perform = async (current, release = async () => {}, beginMutation = () => {}) => {
      const snapshots = await storedSnapshots()
      if (!snapshots.ok) throw new Error(snapshots.message)
      const scope = new Set(current.ids)
      const ignore = new Set(current.detachedIds)
      // Preflight the complete group before any ledger or log is changed. Ordinary
      // forks and delegated children retain the existing refusal behavior.
      for (const target of current.ids) {
        if (!isSafeSessionId(target)) throw new Error('Invalid child session id')
        const foreign = snapshots.snapshots.filter(row => row.header?.parentSession === target
          && !scope.has(row.header.id) && !ignore.has(row.header.id))
        if (foreign.length) throw new Error('This conversation has ordinary branches or subagents; handle them before deleting it.')
        if ((await locateSessionDirs(target)).length > 1) throw new Error('Duplicate session directories; deletion refused.')
        const activity = await ctx.waterfall('workspace/session-activity', { sessionId: target }, () => Promise.resolve([]))
        if (activity.length) throw new Error('Stop all tasks before deleting this conversation.')
      }
      // Release all writers before touching the first directory.
      for (const target of current.ids) await release(target)
      for (const target of current.ids) {
        if (ctx.get('agents')?.get?.(target) || ctx.get('sessions')?.get?.(target)) throw new Error('A conversation is still open; close it before deleting it.')
      }
      const deleted = []
      const remaining = []
      let purged = 0
      beginMutation()
      for (const target of [...current.ids.filter(child => child !== id), id]) {
        const result = await deleteSession(target, ignore, true)
        if (!result.ok) throw new Error(result.error.message)
        deleted.push(target)
        purged += result.value.purged
        remaining.push(...result.value.remaining)
      }
      // Keep the archive rows discoverable until the entire group has moved.
      // The durable deleting journal permits retry if cleanup itself fails.
      for (const target of current.ids) await lifecycle().forgetArchive(target)
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
    if (!lifecycle()) return deleteSession(id)
    return lifecycle().deleteGroup(id, plan.ids, perform)
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

  /** Stored snapshots, or a refusal reason when the backend itself cannot enumerate. */
  async function storedSnapshots() {
    try {
      return { ok: true, snapshots: await ctx.sessionPersistence.list() }
    } catch (error) {
      return {
        ok: false,
        message: error && error.message ? error.message : String(error),
      }
    }
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
  async function deleteSession(id, ignoredChildren = new Set(), keepArchived = false) {
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

    // No cascade exists in this model: lineage lives only in the child's immutable
    // header, so deleting a parent would leave silent orphans. Refuse and name them.
    const listed = await storedSnapshots()
    if (!listed.ok) {
      return { ok: false, error: { code: 'session/duplicate-artifacts', message: listed.message } }
    }
    const children = listed.snapshots
      .filter((snapshot) => snapshot?.header?.parentSession === id && !ignoredChildren.has(snapshot.header.id))
      .map((snapshot) => snapshot.header.id)
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
      await rename(movedFrom, movedTo)
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
          if (operation !== 'delete' && operation !== 'preview' && operation !== 'pending'
            && operation !== 'leftovers' && operation !== 'purge') {
            sendJson(res, 404, { ok: false, error: { code: 'unknown-operation', message: `unknown operation "${operation}"` } })
            return
          }

          let body
          try {
            body = await readJsonBody(req)
          } catch (error) {
            sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: error && error.message ? error.message : String(error) } })
            return
          }

          try {
            if (operation === 'pending') {
              sendJson(res, 200, { ok: true, value: { ids: await lifecycle()?.pendingDeletions?.() ?? [] } })
              return
            }
            if (operation === 'preview') {
              sendJson(res, 200, { ok: true, value: await preview(body.sessionId) })
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
            sendJson(res, 500, {
              ok: false,
              error: { code: 'internal', message: error && error.message ? error.message : String(error) },
            })
          }
        },
      }),
    `archived-sessions: POST ${ROUTE}/delete`,
  )
}
