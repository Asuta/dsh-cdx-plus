import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const inject = ['connection', 'webServer', 'profileContext']
const route = '/plugin-folders/api/layout'
const invalid = (code, status = 400) => Object.assign(new Error(code), { status })

// The only persistent data are folder names and package identities. No installer or loader writes.
export function createLibrary(directory) {
  const file = path.join(directory, 'layout.json')
  let tail = Promise.resolve()
  async function run(op) {
    let state
    try { state = JSON.parse(await fs.readFile(file, 'utf8')) }
    catch (err) { if (err.code !== 'ENOENT') throw err; state = { folders: [], members: {} } }
    const members = new Map(Object.entries(state.members)), folders = state.folders
    if (!op) return state
    if (!['create','rename','remove','move'].includes(op.type)) throw invalid('invalid')
    const target = folders.find(f => f.id === op.id)
    if (!target && !(op.type === 'create' || (op.type === 'move' && op.id === null))) throw invalid('missing', 409)
    if (op.type === 'create' || op.type === 'rename') {
      const name = typeof op.name === 'string' && op.name.trim()
      if (!name || name.length > 64) throw invalid('name')
      if (folders.some(f => (op.type === 'create' || f !== target) && f.name.toLowerCase() === name.toLowerCase())) throw invalid('duplicate', 409)
      if (op.type === 'create') { if (folders.length >= 256) throw invalid('limit'); folders.push({ id: randomUUID(), name }) }
      else target.name = name
    } else if (op.type === 'remove') {
      folders.splice(folders.indexOf(target), 1)
      for (const [pkg, id] of members) if (id === op.id) members.delete(pkg)
    } else {
      if (typeof op.pkg !== 'string' || op.pkg.length > 214 || !/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(op.pkg)) throw invalid('invalid')
      if (op.id === null) members.delete(op.pkg)
      else members.set(op.pkg, op.id)
      if (members.size > 10000) throw invalid('limit')
    }
    state.members = Object.fromEntries(members)
    await fs.mkdir(directory, { recursive: true })
    const tmp = file + '.' + randomUUID() + '.tmp'
    try { await fs.writeFile(tmp, JSON.stringify(state), { flag:'wx' }); await fs.rename(tmp, file) }
    finally { await fs.rm(tmp, { force: true }) }
    return state
  }
  return op => { const result = tail.then(() => run(op)); tail = result.catch(() => {}); return result }
}

export function apply(ctx) {
  const library = createLibrary(path.join(ctx.profileContext.dir, '.plugin-folders'))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: route, async handler(req, res) {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body)) }
    const rejected = ctx.connection.requestRejection(req)
    if (rejected !== undefined) return send(rejected, { error:'denied' })
    try {
      if (req.method === 'GET') return send(200, await library())
      if (req.method !== 'POST') return send(405, { error:'method' })
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(415, { error:'format' })
      const chunks = []; let bytes = 0
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) throw invalid('limit', 413); chunks.push(chunk) }
      let op
      try { op = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw invalid('invalid') }
      if (!op || typeof op !== 'object') throw invalid('invalid')
      send(200, await library(op))
    } catch (err) { send(err.status || 500, { error: err.status ? err.message : 'storage' }) }
  } }), 'plugin-folders: profile library')
}
