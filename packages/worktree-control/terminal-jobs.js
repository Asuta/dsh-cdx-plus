import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const live = job => ['preparing', 'waiting', 'running'].includes(job.status)
const clientFile = fileURLToPath(new URL('./terminal-client.mjs', import.meta.url))

/** Commands start only when their visible native terminal connects. */
export class EnvironmentTerminals {
  constructor(ctx, signal, { launchTimeout = 45000 } = {}) {
    this.ctx = ctx
    this.signal = signal
    this.launchTimeout = launchTimeout
    this.jobs = new Map()
  }

  summary(job) {
    return { id: job.id, key: job.key, sessionId: job.sessionId, title: job.title, cwd: job.cwd,
      status: job.status, error: job.error, owner: job.owner, terminalId: job.terminalId, tabId: job.tabId }
  }

  list(sessionId) {
    return [...this.jobs.values()].filter(job => job.sessionId === sessionId).map(job => this.summary(job))
  }

  active(sessionId, title, cwd, script) {
    const key = createHash('sha256').update(JSON.stringify([sessionId, cwd, title, script])).digest('hex')
    return [...this.jobs.values()].find(job => job.key === key && live(job))
  }

  using(cwd) {
    const normalized = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
    return [...this.jobs.values()].some(job => live(job) && normalized(job.cwd) === normalized(cwd))
  }

  enqueue(sessionId, title, cwd, script, execute, { timeout = 10 * 60 * 1000, signal } = {}) {
    this.signal.throwIfAborted()
    signal?.throwIfAborted()
    const key = createHash('sha256').update(JSON.stringify([sessionId, cwd, title, script])).digest('hex')
    const previous = this.active(sessionId, title, cwd, script)
    if (previous) return previous
    const active = [...this.jobs.values()].filter(job => job.sessionId === sessionId && live(job))
    if (active.length >= 8) throw new Error('此对话已有 8 个环境命令，请先停止其中一个。')
    const controller = new AbortController()
    const job = { id: randomUUID(), key, sessionId, title, cwd, script, execute, timeout, controller,
      status: 'preparing', secret: randomBytes(32).toString('hex') }
    job.done = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject })
    // Manual runs outlive the HTTP request; callers may still await automatic setup.
    void job.done.catch(() => {})
    const abort = () => this.cancel(job, '命令已停止。')
    const signals = [this.signal, signal].filter(Boolean)
    for (const item of signals) item.addEventListener('abort', abort, { once: true })
    job.release = () => { for (const item of signals) item.removeEventListener('abort', abort) }
    this.jobs.set(job.id, job)
    const finished = [...this.jobs.values()].filter(item => item.sessionId === sessionId && !live(item))
    for (const old of finished.slice(0, Math.max(0, finished.length - 24))) this.jobs.delete(old.id)
    void this.prepare(job).catch(error => this.finish(job, error))
    return job
  }

  async prepare(job) {
    // Only a local Node helper is launched in the shell; the host still applies
    // the existing sandbox policy to the actual command's PTY process.
    const node = await this.ctx.subprocess.resolveExecutable('node', undefined, this.signal)
    job.directory = await mkdtemp(join(tmpdir(), 'dsh-environment-terminal-'))
    const file = join(job.directory, 'connection.json')
    await writeFile(file, JSON.stringify({ url: this.ctx.webServer.getOrigin() + '/worktree-control/terminal/' + job.id, secret: job.secret }), { mode: 0o600, flag: 'wx' })
    if (job.controller.signal.aborted) { await rm(job.directory, { recursive: true, force: true }); return }
    job.argv = [node, clientFile, file]
    job.platform = process.platform
    job.status = 'waiting'
    job.timer = setTimeout(() => this.cancel(job, '内置终端未能启动，命令尚未执行。请打开此对话后重试。'), this.launchTimeout)
  }

  get(sessionId, id) {
    const job = this.jobs.get(id)
    if (!job || job.sessionId !== sessionId) throw new Error('环境执行任务不存在。')
    return job
  }

  claim(sessionId, id, owner) {
    const job = this.get(sessionId, id)
    if (job.status !== 'waiting' || job.owner) return null
    if (typeof owner !== 'string' || !/^[\w-]{1,128}$/.test(owner)) throw new Error('无效的终端窗口。')
    job.owner = owner
    return { ...this.summary(job), argv: job.argv, platform: job.platform }
  }

  bind(sessionId, id, owner, terminalId, tabId) {
    const job = this.get(sessionId, id)
    if (job.status !== 'waiting' || job.owner !== owner) throw new Error('执行任务已被其他窗口接管。')
    if (typeof terminalId !== 'string' || !/^[\w-]{1,128}$/.test(terminalId)) throw new Error('无效的终端。')
    job.terminalId = terminalId
    job.tabId = typeof tabId === 'string' ? tabId.slice(0, 128) : undefined
  }

  cancel(job, reason = '命令已停止。') {
    if (!live(job)) return
    const error = new Error(reason)
    job.controller.abort(error)
    if (job.status !== 'running') this.finish(job, error)
  }

  finish(job, error, output = '') {
    if (!live(job)) return
    clearTimeout(job.timer)
    job.status = error ? (job.controller.signal.aborted ? 'stopped' : 'failed') : 'succeeded'
    job.error = error?.message
    job.release()
    if (error) job.reject(error)
    else job.resolve(output)
    if (job.directory) void rm(job.directory, { recursive: true, force: true }).catch(() => {})
  }

  async handle(req, res) {
    const id = new URL(req.url, 'http://dsh.local').pathname.split('/').at(-1)
    const job = this.jobs.get(id)
    // A per-job capability authenticates the local terminal, without exporting
    // the user's DSH browser token or allowing cross-session command selection.
    if (req.method !== 'POST' || !job || req.headers['x-worktree-terminal'] !== job.secret || req.headers.origin) {
      res.writeHead(403); res.end(); return
    }
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 65536) { res.writeHead(413); res.end(); return }
      chunks.push(chunk)
    }
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (request.action === 'stop') { this.cancel(job); res.end('{}'); return }
    if (request.action === 'input') {
      if (job.status !== 'running' || !job.terminal || typeof request.data !== 'string') { res.writeHead(409); res.end(); return }
      await job.terminal.write(request.data)
      res.end('{}'); return
    }
    if (request.action === 'resize') {
      const { cols, rows } = request
      if (job.terminal && Number.isInteger(cols) && Number.isInteger(rows) && cols >= 2 && cols <= 500 && rows >= 1 && rows <= 200) await job.terminal.resize(cols, rows)
      res.end('{}'); return
    }
    if (request.action !== 'run' || job.status !== 'waiting' || !job.owner || !job.terminalId) { res.writeHead(409); res.end(); return }
    clearTimeout(job.timer)
    job.status = 'running'
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.flushHeaders()
    const send = frame => {
      if (res.destroyed || res.writableEnded) return
      if (res.writableLength > 2 * 1024 * 1024) { this.cancel(job, '终端输出连接过慢，命令已停止。'); return }
      res.write(JSON.stringify(frame) + '\n')
    }
    const disconnected = () => { if (job.status === 'running') this.cancel(job, '执行终端已关闭，命令已停止。') }
    res.on('close', disconnected)
    send({ data: '\r\n' + job.title + '\r\n目录：' + job.cwd + '\r\n' + job.script.replace(/\r?\n/g, '\r\n') + '\r\n────────────────────────\r\n' })
    try {
      const output = await job.execute({ terminal: true, timeout: job.timeout, signal: job.controller.signal,
        onTerminal: terminal => { job.terminal = terminal; send({ ready: true }) }, onOutput: data => send({ data }) })
      this.finish(job, undefined, output)
    } catch (error) { this.finish(job, error) }
    finally {
      job.terminal = undefined
      send({ status: job.status, error: job.error })
      res.off('close', disconnected)
      res.end()
    }
  }
}
