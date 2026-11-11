import { catalog, inspect, summary } from './git.js'

export const name = 'local-git-diff'
export const inject = ['webServer', 'connection', 'agents', 'workingDirectory']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/git-diff/api', handler: async (req, res) => {
    const send = (status, value) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(value))
    }
    if (ctx.connection.requestRejection(req) !== undefined) return send(403, { ok: false, error: 'forbidden' })
    if (req.method !== 'POST') return send(405, { ok: false, error: 'POST required' })
    const action = new URL(req.url, 'http://dsh.local').pathname.slice('/git-diff/api/'.length)
    if (!['catalog', 'inspect', 'summary'].includes(action)) return send(404, { ok: false, error: 'unknown action' })
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 4096) throw new Error('请求过大。')
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (typeof body?.sessionId !== 'string' || !/^[\w-]{1,100}$/.test(body.sessionId)) throw new Error('无效的会话 ID。')
      const agent = ctx.agents.get(body.sessionId)
      if (!agent) throw new Error('请先打开主对话，等待会话连接。')
      const cwd = ctx.workingDirectory.get(agent.session) ?? agent.session.header.cwd
      if (!cwd) throw new Error('当前对话没有工作目录。')
      const value = action === 'catalog' ? await catalog(cwd) : action === 'summary' ? await summary(cwd) : await inspect(cwd, body.scope, body.ref)
      send(200, { ok: true, value })
    } catch (error) { send(400, { ok: false, error: String(error.message ?? error) }) }
  } }), 'git-diff: api')
}
