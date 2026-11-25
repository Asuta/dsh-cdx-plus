import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const fault = (code, message) => Object.assign(new Error(message), { code })
const digest = text => createHash('sha256').update(text).digest('hex')
export function defaultHome(env = process.env) {
  const home = env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.resolve(home === '~' ? os.homedir() : home.startsWith('~' + path.sep) ? path.join(os.homedir(), home.slice(2)) : home)
}
export const validProtectionId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)

export function createArchiveProtection({ home = defaultHome() } = {}) {
  const directory = path.join(home, 'plugin-data', 'projectless-chat')
  const file = path.join(directory, 'archive-protection.json')
  const lock = path.join(directory, 'archive-protection-lock.sqlite')
  let tail = Promise.resolve()
  async function read() {
    let raw
    try { raw = await fs.readFile(file, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const saved = JSON.parse(raw)
    if (saved?.version !== 1 || !Array.isArray(saved.ids) || !saved.ids.every(validProtectionId)) {
      throw fault('INVALID_PROTECTION', '归档保护配置无法读取。')
    }
    return [...new Set(saved.ids)]
  }
  function exclusive(run) {
    const operation = tail.then(async () => {
      const { DatabaseSync } = await import('node:sqlite')
      await fs.mkdir(directory, { recursive: true })
      // Keep the existing JSON format. SQLite provides an OS-backed lock that
      // releases on close or process exit, without a stale lockfile timeout.
      const db = new DatabaseSync(lock)
      try {
        const deadline = performance.now() + 15_000
        for (;;) {
          try { db.exec('BEGIN IMMEDIATE'); break }
          catch (error) {
            if (error.code !== 'ERR_SQLITE_ERROR' || (error.errcode & 0xff) !== 5) throw error
            if (performance.now() >= deadline) throw fault('PROTECTION_BUSY', '归档保护正在被其他实例使用，请重试。')
            await delay(25)
          }
        }
        return await run()
      } finally { db.close() }
    })
    tail = operation.catch(() => {})
    return operation
  }
  function set(id, protectedValue) {
    if (!validProtectionId(id) || typeof protectedValue !== 'boolean') throw fault('INVALID_PROTECTION', '无效的归档保护设置。')
    return exclusive(async () => {
      const ids = new Set(await read())
      if (ids.has(id) === protectedValue) return [...ids]
      if (protectedValue) ids.add(id)
      else ids.delete(id)
      const temporary = file + '.' + randomUUID() + '.tmp'
      try {
        await fs.writeFile(temporary, JSON.stringify({ version: 1, ids: [...ids] }), { flag: 'wx', mode: 0o600 })
        await fs.rename(temporary, file)
      } finally { await fs.rm(temporary, { force: true }) }
      return [...ids]
    })
  }
  function archiveIfUnprotected(id, archive) {
    if (!validProtectionId(id)) throw fault('INVALID_PROTECTION', '无效的会话标识。')
    return exclusive(async () => (await read()).includes(id) ? 'protected' : await archive(id))
  }
  return { read, set, archiveIfUnprotected }
}

export function createDirectorySettings({ home = defaultHome(), defaultRoot = path.join(os.homedir(), 'Documents', 'DSH'), clock = () => new Date() } = {}) {
  const file = path.join(home, 'plugin-data', 'projectless-chat', 'settings.json')
  let tail = Promise.resolve()
  const serial = operation => { const next = tail.then(operation); tail = next.catch(() => {}); return next }
  function normalize(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || [...value].some(c => c.charCodeAt(0) < 32)) throw fault('INVALID_PATH', '请输入有效的绝对目录路径。')
    const root = value.trim()
    const parsed = path.parse(root)
    if (!path.isAbsolute(root) || (process.platform === 'win32' && parsed.root.length < 3)) throw fault('INVALID_PATH', '请使用完整的绝对目录路径。')
    return path.normalize(root)
  }
  async function read() {
    let text
    try { text = await fs.readFile(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
    const saved = text === undefined ? null : JSON.parse(text)
    if (saved !== null && (saved.version !== 1 || !(saved.root === null || typeof saved.root === 'string'))) throw fault('INVALID_SETTINGS', '独立对话目录配置损坏，请检查设置文件。')
    const root = saved?.root === null || saved === null ? defaultRoot : normalize(saved.root)
    return { root, defaultRoot, isDefault: saved?.root == null, revision: digest(text ?? 'missing') }
  }
  async function ensureWritable(root) {
    await fs.mkdir(root, { recursive: true })
    if (!(await fs.stat(root)).isDirectory()) throw fault('INVALID_PATH', '所选路径不是文件夹。')
    const probe = path.join(root, '.dsh-write-check-' + randomUUID())
    await fs.writeFile(probe, '', { flag: 'wx', mode: 0o600 })
    await fs.unlink(probe)
  }
  function save({ root, revision }) {
    return serial(async () => {
      const previous = await read()
      if (revision !== previous.revision) throw fault('CONFLICT', '设置已在其他页面更改，请重新读取后保存。')
      const chosen = root === null ? defaultRoot : normalize(root)
      await ensureWritable(chosen)
      await fs.mkdir(path.dirname(file), { recursive: true })
      const temporary = file + '.' + randomUUID() + '.tmp'
      try {
        await fs.writeFile(temporary, JSON.stringify({ version: 1, root: root === null ? null : chosen }, null, 2), { flag: 'wx', mode: 0o600 })
        await fs.rename(temporary, file)
      } finally { await fs.rm(temporary, { force: true }) }
      return read()
    })
  }
  function allocate() {
    return serial(async () => {
      const settings = await read()
      await ensureWritable(settings.root)
      const now = clock()
      const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
      const parent = path.join(settings.root, date)
      await fs.mkdir(parent, { recursive: true })
      const cwd = await fs.mkdtemp(path.join(parent, 'new-chat-'))
      return { cwd }
    })
  }
  async function browse(value) {
    const root = value === undefined ? os.homedir() : normalize(value)
    const items = await fs.readdir(root, { withFileTypes: true })
    const directories = items.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    const base = path.parse(root).root
    const crumbs = [{ name: base, path: base }]
    let current = base
    for (const part of path.relative(base, root).split(path.sep).filter(Boolean)) { current = path.join(current, part); crumbs.push({ name: part, path: current }) }
    return { path: root, crumbs, entries: directories.slice(0, 200).map(item => ({ name: item.name, path: path.join(root, item.name) })), truncated: directories.length > 200 }
  }
  return { read, save, allocate, browse }
}
