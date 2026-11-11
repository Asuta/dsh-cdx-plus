import { createDirectorySettings } from './core.js'
export const inject = ['webServer', 'connection']
function respond(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}
export function apply(ctx) {
  const settings = createDirectorySettings()
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/projectless-chat/api',
    async handler(req, res) {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) return respond(res, rejection, { ok: false, error: '需要 DSH 身份验证。' })
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
        throw new Error('未知操作。')
      } catch (error) { respond(res, error.code === 'CONFLICT' ? 409 : 400, { ok: false, code: error.code, error: error.message }) }
    },
  }), 'projectless-chat: authenticated directory settings')
}
