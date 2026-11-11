import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const fault = (code, message) => Object.assign(new Error(message), { code })
const digest = text => createHash('sha256').update(text).digest('hex')
export function defaultHome(env = process.env) {
  const home = env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.resolve(home === '~' ? os.homedir() : home.startsWith('~' + path.sep) ? path.join(os.homedir(), home.slice(2)) : home)
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
