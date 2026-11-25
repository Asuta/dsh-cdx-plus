import { createArchiveProtection, createDirectorySettings } from './core.js'
export const inject = ['webServer', 'connection', 'workspaceRegistry', 'sessions', 'sessionPersistence']
function respond(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}
export function apply(ctx) {
  const settings = createDirectorySettings()
  const protection = createArchiveProtection()
  async function archiveUngrouped(id) {
    const registry = ctx.workspaceRegistry
    const header = ctx.sessions.get(id)?.header ?? (await ctx.sessionPersistence.stat(id))?.header
    if (header?.cwd === undefined || header.origin === 'subagent' || registry.archivedSessionIds.includes(id)
      || registry.pinnedSessionIds.includes(id) || registry.list().some(workspace => workspace.sessionIds.includes(id))) return 'changed'
    try {
      // Reuse the native activity check and never request that running work stop.
      await registry.archiveSession(id)
      return 'archived'
    } catch (error) {
      if (error.name === 'WorkspaceActiveSessionError') return 'running'
      if (error.name === 'WorkspaceUnknownSessionError') return 'changed'
      throw error
    }
  }
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/projectless-chat/api',
    async handler(req, res) {
      const admission = ctx.connection.admit(req)
      if (admission.rejection !== undefined) return respond(res, admission.rejection, { ok: false, error: '需要 DSH 身份验证。' })
      if (req.method !== 'POST') return respond(res, 405, { ok: false, error: 'POST only' })
      if (req.headers['x-projectless-chat'] !== '1' || (req.headers.origin && req.headers.origin !== ctx.webServer.getOrigin())) return respond(res, 403, { ok: false, error: '不允许跨站请求。' })
      try {
        const chunks = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new Error('请求过大。'); chunks.push(chunk) }
        const args = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (args.action === 'read') return respond(res, 200, { ok: true, ...await settings.read() })
        if (args.action === 'save') return respond(res, 200, { ok: true, ...await settings.save(args) })
        if (args.action === 'allocate') return respond(res, 200, { ok: true, ...await settings.allocate() })
        if (args.action === 'browse') return respond(res, 200, { ok: true, ...await settings.browse(args.path) })
        if (args.action === 'archive-protection') return respond(res, 200, { ok: true, ids: await protection.read() })
        if (args.action === 'set-archive-protection') {
          return respond(res, 200, { ok: true, ids: await protection.set(args.id, args.protected) })
        }
        if (args.action === 'archive-ungrouped') {
          if (admission.peer.principal.kind !== 'owner') return respond(res, 403, { ok: false, error: '当前没有归档权限。' })
          return respond(res, 200, { ok: true, outcome: await protection.archiveIfUnprotected(args.id, archiveUngrouped) })
        }
        throw new Error('未知操作。')
      } catch (error) { respond(res, ['CONFLICT', 'PROTECTION_BUSY'].includes(error.code) ? 409 : 400, { ok: false, code: error.code, error: error.message }) }
    },
  }), 'projectless-chat: authenticated directory settings')
}
