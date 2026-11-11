import { execFile } from 'node:child_process'
import { promisify, stripVTControlCharacters } from 'node:util'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import ignore from 'ignore'
import { parse as parseToml } from 'smol-toml'

const execute = promisify(execFile)
const COMMAND_CONTEXT = new AsyncLocalStorage()
const SETUP_RUNNER = new AsyncLocalStorage()
const LIMIT = 8 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024
const LOCKS = new Map()
const GIT_ENV_KEYS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
  'GIT_CEILING_DIRECTORIES', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE', 'GIT_REPLACE_REF_BASE', 'GIT_ATTR_SOURCE',
]

function envForGit(extra = {}) {
  const allowed = process.platform === 'win32'
    ? ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SSH_AUTH_SOCK']
    : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'SSH_AUTH_SOCK']
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.some(name => name.toLowerCase() === key.toLowerCase())))
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', ...extra })
  for (const key of GIT_ENV_KEYS) if (!(key in extra)) delete env[key]
  return env
}

export async function git(cwd, args, options = {}) {
  const runtime = COMMAND_CONTEXT.getStore()
  if (runtime) return runManagedCommand(runtime, cwd, ['git', '--no-pager', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], options)
  const { stdout } = await execute('git', ['--no-pager', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], {
    cwd, windowsHide: true, encoding: 'utf8', timeout: options.timeout ?? 30000,
    maxBuffer: options.maxBuffer ?? LIMIT, env: envForGit(options.env),
  })
  return stdout
}

async function runManagedCommand(runtime, cwd, argv, options = {}) {
  const timeoutMs = options.timeout ?? 30000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('工作树命令超时。')), timeoutMs)
  const signal = runtime.signal ? AbortSignal.any([runtime.signal, controller.signal]) : controller.signal
  let child
  try {
    signal.throwIfAborted()
    const command = [await runtime.ctx.subprocess.resolveExecutable(argv[0], undefined, signal), ...argv.slice(1)]
    const wrapped = runtime.policy.mode === 'danger-full-access' ? command : (await runtime.ctx.sandbox.confine(command, { ...runtime.policy, mode: runtime.policy.mode }, signal)).argv
    child = runtime.ctx.subprocess.spawn({
      argv: wrapped, cwd, env: envForGit(options.env), signal,
      graceMs: 3000,
      stdio: { stdin: 'ignore', stdout: { maxBytes: options.maxBuffer ?? LIMIT }, stderr: { maxBytes: options.maxBuffer ?? LIMIT } },
    })
    const outcome = await child.done
    const captured = child.collected
    const stdout = captured.stdout.readFrom(0)
    const stderr = captured.stderr.readFrom(0)
    const allowed = options.allowedExitCodes ?? [0]
    if (outcome.exitCode === null || !allowed.includes(outcome.exitCode)) {
      const detail = stderr.text.trim() || stdout.text.trim()
      throw new Error(argv[0] + ' command failed (' + (outcome.signal ?? outcome.exitCode) + '): ' + detail.slice(-4000))
    }
    if (stdout.lossy || stderr.lossy) throw new Error('工作树命令输出超过大小上限。')
    return stdout.text
  } finally {
    clearTimeout(timeout)
    if (child) { child.terminate(); await child.waitForExit() }
  }
}

export function withCommandContext(ctx, session, operation, signal) {
  const policy = ctx.sandboxPolicy.resolve({ session })
  return COMMAND_CONTEXT.run({ ctx, session, policy, signal }, operation)
}

// The UI adapter supplies a visible terminal without changing Git operations.
export function withSetupRunner(runner, operation) {
  return SETUP_RUNNER.run(runner, operation)
}

async function runManagedTerminal(runtime, cwd, argv, options) {
  const controller = new AbortController()
  const signal = AbortSignal.any([runtime.signal, options.signal, controller.signal].filter(Boolean))
  const timer = options.timeout ? setTimeout(() => controller.abort(new Error('环境命令超时。')), options.timeout) : null
  let child, output = '', drain
  const stop = () => { void child?.terminate().catch(() => {}) }
  try {
    signal.throwIfAborted()
    const command = [await runtime.ctx.subprocess.resolveExecutable(argv[0], undefined, signal), ...argv.slice(1)]
    const wrapped = runtime.policy.mode === 'danger-full-access' ? command : (await runtime.ctx.sandbox.confine(command, runtime.policy, signal)).argv
    child = await runtime.ctx.subprocess.spawnTerminal({ argv: wrapped, cwd, env: envForGit(options.env),
      cols: 100, rows: 28, terminalType: 'xterm-256color', shellActivity: false, graceMs: 3000, signal })
    signal.addEventListener('abort', stop, { once: true })
    if (signal.aborted) stop()
    options.onTerminal?.(child)
    drain = (async () => {
      const decoder = new TextDecoder()
      for await (const chunk of child.output) {
        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        output = (output + text).slice(-16000)
        options.onOutput?.(text)
      }
      const tail = decoder.decode()
      if (tail) { output = (output + tail).slice(-16000); options.onOutput?.(tail) }
    })()
    // Observe both promises immediately; stream failures must also stop the process.
    const [outcome] = await Promise.all([child.done, drain])
    signal.throwIfAborted()
    if (outcome.exitCode !== 0) throw new Error('命令退出：' + (outcome.signal ?? outcome.exitCode) + '\n' + output.slice(-4000))
    return output
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
    if (child) await child.terminate()
    await drain?.catch(() => {})
  }
}

const keyPath = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value)
const samePath = (a, b) => keyPath(a) === keyPath(b)
const splitNul = value => value.split('\0').filter(Boolean)

export async function withRepoLock(key, operation) {
  const lockKey = keyPath(key)
  const previous = LOCKS.get(lockKey) ?? Promise.resolve()
  let release
  const current = new Promise(resolveLock => { release = resolveLock })
  LOCKS.set(lockKey, current)
  await previous
  try { return await operation() } finally {
    release()
    if (LOCKS.get(lockKey) === current) LOCKS.delete(lockKey)
  }
}

export async function repository(cwd) {
  const root = resolve((await git(cwd, ['rev-parse', '--show-toplevel'])).trim())
  const commonDir = resolve(root, (await git(root, ['rev-parse', '--git-common-dir'])).trim())
  const canonicalRoot = await realpath(root)
  const canonicalCommon = await realpath(commonDir)
  return { root: canonicalRoot, commonDir: canonicalCommon, stateDir: resolve(canonicalCommon, 'dsh-worktree-control') }
}

export async function listWorktrees(cwd) {
  const info = await repository(cwd)
  const raw = await git(info.root, ['worktree', 'list', '--porcelain', '-z'])
  const rows = []
  let row = {}
  for (const field of raw.split('\0')) {
    if (!field) {
      if (row.path) rows.push(row)
      row = {}
      continue
    }
    const split = field.indexOf(' ')
    const name = split < 0 ? field : field.slice(0, split)
    const value = split < 0 ? '' : field.slice(split + 1)
    if (name === 'worktree') row.path = resolve(value)
    else if (name === 'HEAD') row.head = value
    else if (name === 'branch') row.branch = value.replace(/^refs\/heads\//, '')
    else if (name === 'detached') row.detached = true
    else if (name === 'bare') row.bare = true
    else if (name === 'locked') row.locked = value || true
    else if (name === 'prunable') row.prunable = value || true
  }
  if (row.path) rows.push(row)
  return { ...info, worktrees: rows }
}

function emptyState() { return { version: 1, retentionLimit: 15, worktreeRoot: '', worktrees: {}, archives: [], environments: [], defaultEnvironmentId: '', sessionEnvironments: {}, sessionSetupWarnings: {}, drafts: {} } }

async function loadState(info) {
  const file = resolve(info.stateDir, 'state.json')
  let value
  try { value = JSON.parse(await readFile(file, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return emptyState()
    throw new Error('工作树元数据无法读取；为避免覆盖数据，已停止操作。')
  }
  if (value?.version !== 1 || !value.worktrees || !Array.isArray(value.archives)) throw new Error('工作树元数据格式不受支持；已停止操作。')
  return { ...emptyState(), ...value }
}

async function saveState(info, state) {
  await mkdir(info.stateDir, { recursive: true })
  const file = resolve(info.stateDir, 'state.json')
  const temp = resolve(info.stateDir, 'state-' + randomUUID() + '.tmp')
  await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
  await rename(temp, file)
}

async function refs(cwd) {
  const raw = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'])
  return [...new Set(raw.trim().split(/\r?\n/).filter(Boolean).filter(value => !value.endsWith('/HEAD')))]
}

function safeBranch(value) {
  if (!value) return ''
  if (value.length > 180 || value.startsWith('-') || value.includes('\\') || value.includes(':') || value.split('/').some(part => !part || part === '.' || part === '..') || !/^[\w./-]+$/.test(value)) throw new Error('分支名只允许字母、数字、点、下划线、连字符和斜杠，且不能包含路径跳转。')
  return value
}

function safeRelative(value) {
  if (!value || value.includes('\0') || isAbsolute(value) || value.includes('\\') || value.includes(':') || value.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) throw new Error('文件路径必须是仓库内的相对路径。')
  return value
}

function inside(parent, child) {
  const part = relative(parent, child)
  return part === '' || (part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part))
}

function freshName() {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return 'worktree-' + now + '-' + randomUUID().slice(0, 6)
}

function addSession(record, sessionId) {
  const ids = new Set(record.sessionIds ?? [])
  if (sessionId && /^[\w-]{1,128}$/.test(sessionId)) ids.add(sessionId)
  return [...ids]
}

function isSnapshotSafe(rawStatus) {
  if (/(?:^|\0)160000 [0-9a-f]+ \d+\t/.test(rawStatus)) throw new Error('此工作树包含子模块；为避免产生不完整快照，暂不能归档。')
}

async function includedPaths(root) {
  const file = resolve(root, '.worktreeinclude')
  const source = await readFile(file, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
  const matcher = ignore().add(source).add('AGENTS.override.md')
  const ignored = splitNul(await git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']))
  return ignored.filter(path => !path.startsWith('.agents/worktrees/') && matcher.ignores(path))
}

async function collectFiles(root, requested, maxBytes = MAX_SNAPSHOT_BYTES) {
  const files = []
  let total = 0
  async function visit(path) {
    const target = resolve(root, path)
    if (!inside(root, target)) throw new Error('工作树路径越界。')
    await assertSafeParents(root, path)
    const info = await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info) return
    if (info.isSymbolicLink()) throw new Error('所选本地配置包含符号链接；为避免越界读取，已停止复制。')
    if (info.isDirectory()) {
      for (const entry of await readdir(target)) await visit(path + '/' + entry)
    } else if (info.isFile()) {
      total += info.size
      if (total > maxBytes) throw new Error('本地文件总量超过安全上限。')
      files.push({ path, target, size: info.size })
    } else throw new Error('所选路径包含非普通文件。')
  }
  for (const path of requested) await visit(safeRelative(path))
  return files
}

async function copyIncluded(sourceRoot, destination) {
  const requested = await includedPaths(sourceRoot)
  const files = await collectFiles(sourceRoot, requested)
  for (const file of files) {
    const target = resolve(destination, file.path)
    if (!inside(destination, target)) throw new Error('本地配置目标路径越界。')
    await assertSafeParents(destination, file.path)
    if (await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) continue
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file.target, target)
  }
  return files.map(file => file.path)
}

async function assertSafeParents(root, path) {
  const parts = safeRelative(path).split('/')
  let current = root
  for (const part of parts.slice(0, -1)) {
    current = resolve(current, part)
    const stat = await lstat(current).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('文件父路径包含链接或不是目录：' + path)
  }
}

async function ensureWorktreePool(root, pool, destination) {
  const runtime = COMMAND_CONTEXT.getStore()
  if (runtime && runtime.policy.mode !== 'danger-full-access' && !inside(runtime.policy.workspaceRoot, destination)) throw new Error('目标目录超出当前对话可写范围，请先调整权限或使用项目内的工作树目录。')
  if (inside(root, destination)) await assertSafeParents(root, relative(root, destination).split(sep).join('/'))
  const exists = await lstat(pool).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  if (!exists) {
    await mkdir(dirname(pool), { recursive: true })
    await mkdir(pool)
    await writeFile(resolve(pool, '.gitignore'), '*\n', { flag: 'wx' })
    return
  }
  if (!exists.isDirectory() || exists.isSymbolicLink()) throw new Error('工作树容器路径不是普通目录。')
  if (!inside(root, destination)) return
  const relativeTarget = relative(root, destination).split(sep).join('/')
  try { await git(root, ['check-ignore', '--quiet', '--no-index', '--', relativeTarget]) }
  catch { throw new Error('已有 .agents/worktrees 目录尚未被 Git 忽略。请先在其中配置 .gitignore，再创建工作树。') }
}

async function captureDirtyState(root) {
  const staged = await git(root, ['diff', '--cached', '--binary', '--full-index', 'HEAD', '--'])
  const unstaged = await git(root, ['diff', '--binary', '--full-index', '--'])
  const names = splitNul(await git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
  const files = await collectFiles(root, names)
  return { staged, unstaged, files }
}

async function applyPatch(root, patch, label) {
  if (!patch) return
  const file = resolve(tmpdir(), 'dsh-worktree-' + randomUUID() + '.patch')
  await writeFile(file, patch, { flag: 'wx' })
  try { await git(root, ['apply', '--binary', file], { timeout: 60000 }) }
  catch (error) { throw new Error('无法带入' + label + '改动，源工作树保持原样；新工作树创建失败：' + error.message) }
  finally { await rm(file, { force: true }) }
}

function activeMap(trees, state) {
  const paths = new Map(trees.map(tree => [keyPath(tree.path), tree]))
  return Object.entries(state.worktrees).filter(([path, record]) => paths.has(keyPath(path))).map(([path, record]) => ({ ...record, ...paths.get(keyPath(path)), managed: true }))
}

export async function overview(cwd, sessionId, options = {}) {
  const info = await listWorktrees(cwd)
  const state = await loadState(info)
  if (options.retentionLimit !== undefined) {
    state.retentionLimit = normalizeRetention(options.retentionLimit)
    await saveState(info, state)
  }
  const currentPath = resolve(cwd)
  const currentRoot = (await git(currentPath, ['rev-parse', '--show-toplevel']).catch(() => currentPath)).trim()
  const rows = activeMap(info.worktrees, state).map(tree => ({ ...tree, managed: true, current: samePath(tree.path, currentRoot), pinned: Boolean(tree.pinned) }))
  const primary = info.worktrees.find(tree => !tree.bare)
  for (const tree of info.worktrees.filter(tree => !tree.bare)) if (!rows.some(row => samePath(row.path, tree.path))) rows.unshift({
    ...tree, managed: false, primary: tree === primary, pinned: false, sessionIds: [], current: samePath(tree.path, currentRoot),
  })
  return {
    repositoryRoot: info.root,
    primaryRoot: info.worktrees.find(tree => !tree.bare)?.path ?? info.root,
    currentPath,
    currentRoot,
    branches: await refs(info.root),
    retentionLimit: state.retentionLimit,
    worktreeRoot: state.worktreeRoot || resolve(primary?.path ?? info.root, '.agents', 'worktrees'),
    worktrees: rows,
    archives: state.archives.filter(item => !item.restoredAt && !item.deletedAt).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
    sessionId,
  }
}

function normalizeRetention(value) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0 || result > 200) throw new Error('保留数量必须是 0 到 200 的整数；0 表示不自动清理。')
  return result
}

export async function setPinned(cwd, path, pinned) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const record = state.worktrees[resolve(path)]
    if (!record) throw new Error('只能固定由工作树控制插件创建的工作树。')
    record.pinned = Boolean(pinned)
    await saveState(info, state)
    return { path: record.path, pinned: record.pinned }
  })
}

export async function configure(cwd, values = {}) {
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    if (values.retentionLimit !== undefined) state.retentionLimit = normalizeRetention(values.retentionLimit)
    if (values.worktreeRoot !== undefined) {
      if (typeof values.worktreeRoot !== 'string' || !isAbsolute(values.worktreeRoot)) throw new Error('工作树根目录必须是绝对路径。')
      const target = resolve(values.worktreeRoot)
      if (inside(info.commonDir, target)) throw new Error('工作树根目录不能放在 Git 元数据目录内。')
      state.worktreeRoot = target
    }
    await saveState(info, state)
    return overview(cwd)
  })
}

export async function createWorktree(cwd, options = {}) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const baseRef = options.baseRef || 'HEAD'
    const knownRefs = await refs(info.root)
    if (baseRef !== 'HEAD' && !knownRefs.includes(baseRef)) throw new Error('请选择仓库中存在的分支或远端分支。')
    const baseCommit = (await git(info.root, ['rev-parse', '--verify', '--end-of-options', baseRef + '^{commit}'])).trim()
    const branch = safeBranch(options.branch ?? '')
    if (branch) await git(info.root, ['check-ref-format', '--branch', branch])
    if (branch && (await git(info.root, ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch]).then(() => true).catch(() => false))) throw new Error('本地分支已存在：' + branch)
    const name = safeBranch(options.name || (branch ? branch.replaceAll('/', '--') : freshName()))
    const primaryRoot = info.worktrees.find(tree => !tree.bare)?.path ?? info.root
    const pool = state.worktreeRoot || resolve(primaryRoot, '.agents', 'worktrees')
    const destination = resolve(pool, ...name.split('/'))
    if (!inside(pool, destination) || samePath(destination, primaryRoot)) throw new Error('工作树目标目录无效。')
    if (await lstat(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) throw new Error('工作树目录已存在：' + destination)

    const source = resolve(cwd)
    const changes = options.includeChanges ? await captureDirtyState(source) : { staged: '', unstaged: '', files: [] }
    await ensureWorktreePool(primaryRoot, pool, destination)
    await mkdir(dirname(destination), { recursive: true })
    const addArgs = branch ? ['worktree', 'add', '-b', branch, '--', destination, baseCommit] : ['worktree', 'add', '--detach', '--', destination, baseCommit]
    await git(info.root, addArgs, { timeout: 120000 })
    const tree = { path: destination, branch, head: baseCommit, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(), pinned: false, sessionIds: options.sessionId ? [options.sessionId] : [], includedFiles: [] }
    state.worktrees[destination] = tree
    try {
      await saveState(info, state)
      if (changes.staged) {
        const patchFile = resolve(tmpdir(), 'dsh-worktree-staged-' + randomUUID() + '.patch')
        await writeFile(patchFile, changes.staged, { flag: 'wx' })
        try { await git(destination, ['apply', '--3way', '--binary', '--index', patchFile], { timeout: 60000 }) }
        finally { await rm(patchFile, { force: true }) }
      }
      await applyPatch(destination, changes.unstaged, '未暂存')
      for (const file of changes.files) {
        const target = resolve(destination, file.path)
        if (!inside(destination, target)) throw new Error('未跟踪文件路径越界。')
        await assertSafeParents(destination, file.path)
        if (await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) throw new Error('目标分支存在同名文件：' + file.path)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(file.target, target)
      }
      const included = await copyIncluded(source, destination)
      tree.includedFiles = included
      if (options.retentionLimit !== undefined) state.retentionLimit = normalizeRetention(options.retentionLimit)
      await saveState(info, state)
      const setupScript = options.setupScript ?? (options.runSetup ? await readSetupScript(destination) : '')
      let setupOutput = '', setupWarning = ''
      if (setupScript) {
        try { setupOutput = await runSetup(destination, setupScript) }
        catch (error) { setupWarning = '工作树已创建，但环境初始化失败：' + error.message }
      }
      const warnings = await prune(info, state, { ...options, currentPath: destination })
      if (setupWarning) warnings.push(setupWarning)
      return { tree, setupOutput, warnings }
    } catch (error) {
      throw new Error('工作树已创建，但初始化未完成；原工作树内容未改动。新目录：' + destination + '。' + error.message, { cause: error })
    }
  })
}

export async function switchWorktree(cwd, target, sessionId) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const normalized = resolve(target)
    const tree = info.worktrees.find(item => samePath(item.path, normalized))
    if (!tree || tree.prunable) throw new Error('目标不是当前仓库中可用的工作树。')
    const state = await loadState(info)
    const record = state.worktrees[tree.path]
    if (record) {
      record.lastUsedAt = new Date().toISOString()
      record.sessionIds = addSession(record, sessionId)
      await saveState(info, state)
    }
    return tree.path
  })
}

/** Resolve/register a conversation in an existing managed tree; never create or switch trees. */
export async function worktreeSession(cwd, sessionId) {
  // Ordinary non-Git conversations need no membership. Errors reading a real
  // repository's state must still propagate, so conversion can be retried.
  if (!cwd || !await git(cwd, ['rev-parse', '--is-inside-work-tree']).then(value => value.trim() === 'true').catch(() => false)) return
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const current = await listWorktrees(cwd)
    const tree = current.worktrees.find(item => samePath(item.path, current.root) && !item.prunable)
    const primary = current.worktrees.find(item => !item.bare)
    if (!tree || !primary || samePath(tree.path, primary.path)) return
    const state = await loadState(current)
    const record = state.worktrees[tree.path]
    if (!record) return
    if (sessionId !== undefined && !record.sessionIds?.includes(sessionId)) {
      if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error('会话 ID 无效。')
      record.sessionIds = addSession(record, sessionId)
      await saveState(current, state)
    }
    return { projectPath: primary.path, worktreePath: tree.path }
  })
}

export async function createBranch(cwd, branch) {
  const info = await repository(cwd)
  branch = safeBranch(branch)
  if (!branch) throw new Error('请输入新分支名称。')
  await git(info.root, ['check-ref-format', '--branch', branch])
  await git(info.root, ['switch', '-c', branch])
  return { branch }
}

// Copy the complete change relative to the common ancestor without changing
// either branch reference or deleting anything from the source checkout.
export async function handoffWorktree(cwd, target, sessionId) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const destination = info.worktrees.find(tree => samePath(tree.path, target) && !tree.bare && !tree.prunable)
    if (!destination) throw new Error('请选择当前仓库中可用的目标工作树。')
    if (samePath(info.root, destination.path)) return { path: info.root }
    if (await git(info.root, ['ls-files', '-u', '-z'])) throw new Error('源工作树存在未解决冲突，无法交接。')
    isSnapshotSafe(await git(info.root, ['ls-files', '--stage', '-z']))
    await collectFiles(info.root, splitNul(await git(info.root, ['ls-files', '--others', '--exclude-standard', '-z'])))
    const state = await loadState(info)
    await mkdir(info.stateDir, { recursive: true })
    const indexPath = resolve(info.stateDir, 'handoff-index-' + randomUUID())
    const patchFile = resolve(info.stateDir, 'handoff-' + randomUUID() + '.patch')
    const head = (await git(info.root, ['rev-parse', 'HEAD'])).trim()
    const targetHead = (await git(destination.path, ['rev-parse', 'HEAD'])).trim()
    try {
      const env = { GIT_INDEX_FILE: indexPath }
      await git(info.root, ['read-tree', head], { env })
      await git(info.root, ['add', '-A', '--', '.'], { env })
      const tree = (await git(info.root, ['write-tree'], { env })).trim()
      // Repeated handoffs to a checkout already containing the result need no writes.
      await git(destination.path, ['read-tree', targetHead], { env })
      await git(destination.path, ['add', '-A', '--', '.'], { env })
      const targetTree = (await git(destination.path, ['write-tree'], { env })).trim()
      if (targetTree !== tree) {
        if (await git(destination.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) throw new Error('目标工作树有未提交改动。请先提交或保存后再交接；源工作树保持不变。')
        const base = (await git(info.root, ['merge-base', head, targetHead])).trim()
        const patch = await git(info.root, ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', base, tree, '--'])
        if (patch) {
          await writeFile(patchFile, patch, { flag: 'wx' })
          await git(destination.path, ['read-tree', targetHead], { env })
          try { await git(destination.path, ['apply', '--cached', '--3way', '--binary', patchFile], { env }) }
          catch { throw new Error('交接改动与目标分支冲突；两边的文件均未更改。请先解决分支差异。') }
          // Git validates applicability again against the real index before writing.
          await git(destination.path, ['apply', '--3way', '--index', '--binary', patchFile])
        }
      }
      const record = state.worktrees[destination.path]
      if (record) { record.lastUsedAt = new Date().toISOString(); record.sessionIds = addSession(record, sessionId) }
      await saveState(info, state)
      return { path: destination.path, warnings: ['源工作树保留原样。目标分支不变，带入的成果作为暂存改动等待提交。'] }
    } finally { await rm(indexPath, { force: true }); await rm(patchFile, { force: true }) }
  })
}

async function snapshotWorktree(info, state, tree, options = {}) {
  const root = resolve(tree.path)
  const indexed = await git(root, ['ls-files', '--stage', '-z'])
  isSnapshotSafe(indexed)
  if (await git(root, ['ls-files', '-u', '-z'])) throw new Error('此工作树存在未解决的合并冲突，暂不能归档。')
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim()
  const id = randomUUID()
  const indexPath = resolve(info.stateDir, 'index-' + id)
  await mkdir(info.stateDir, { recursive: true })
  try {
    const env = { GIT_INDEX_FILE: indexPath }
    await git(root, ['read-tree', head], { env })
    await git(root, ['add', '-A', '--', '.'], { env, timeout: 120000 })
    const forced = await collectFiles(root, await includedPaths(root))
    if (forced.length) await git(root, ['add', '-f', '--', ...forced.map(file => ':(literal)' + file.path)], { env, timeout: 120000 })
    const snapshotTree = (await git(root, ['write-tree'], { env })).trim()
    const commit = (await git(root, ['commit-tree', snapshotTree, '-p', head, '-m', 'DSH 工作树归档 ' + id])).trim()
    const ref = 'refs/dsh-worktree-control/archive/' + id
    await git(root, ['update-ref', ref, commit])
    const includedFiles = forced.map(file => file.path)
    const record = {
      id, path: root, branch: tree.branch || '', head, snapshotCommit: commit, snapshotRef: ref,
      archivedAt: new Date().toISOString(), sessionIds: addSession(tree, options.sessionId), includedFiles,
    }
    state.archives.push(record)
    await saveState(info, state)
    try { await git(info.root, ['worktree', 'remove', '--force', '--', root], { timeout: 120000 }) }
    catch (error) {
      record.removeError = error.message
      await saveState(info, state)
      throw new Error('快照已保存，但移除工作树失败；可以稍后重试清理。快照编号：' + id)
    }
    delete state.worktrees[root]
    await saveState(info, state)
    return record
  } finally { await rm(indexPath, { force: true }) }
}

async function treeBusy(record, isAgentActive) {
  if (!isAgentActive) return false
  if (await isAgentActive(undefined, record.path)) return true
  for (const sessionId of record.sessionIds ?? []) if (await isAgentActive(sessionId, record.path)) return true
  return false
}

async function prune(info, state, options = {}) {
  const limit = state.retentionLimit
  if (!limit) return []
  const trees = activeMap((await listWorktrees(info.root)).worktrees, state)
  const warnings = []
  while (trees.length > limit) {
    const candidates = trees.filter(tree => !tree.pinned && !samePath(tree.path, options.currentPath || '')).sort((a, b) => (a.lastUsedAt || a.createdAt || '').localeCompare(b.lastUsedAt || b.createdAt || ''))
    let selected
    for (const candidate of candidates) if (options.isAgentActive && !(await treeBusy(candidate, options.isAgentActive))) { selected = candidate; break }
    if (!selected) { warnings.push('已达到保留上限，但其余工作树均已固定、正在使用或无法判断是否空闲；未自动删除。'); break }
    try { await snapshotWorktree(info, state, selected, {}) }
    catch (error) { warnings.push('自动归档 ' + selected.path + ' 失败：' + error.message); break }
    trees.splice(trees.findIndex(tree => samePath(tree.path, selected.path)), 1)
  }
  return warnings
}

export async function archiveWorktree(cwd, path, options = {}) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const normalized = resolve(path)
    const tree = info.worktrees.find(item => samePath(item.path, normalized))
    if (!tree || !state.worktrees[tree.path]) throw new Error('只能归档由工作树控制插件创建的工作树。')
    if (samePath(tree.path, options.currentPath || '')) throw new Error('请先把当前对话切换到其他目录，再归档这棵工作树。')
    if (state.worktrees[tree.path].pinned) throw new Error('此工作树已固定；取消固定后才能归档。')
    if (await treeBusy(state.worktrees[tree.path], options.isAgentActive)) throw new Error('此工作树正被另一个活动对话使用，暂不能归档。')
    return snapshotWorktree(info, state, { ...state.worktrees[tree.path], ...tree }, options)
  })
}

export async function restoreArchive(cwd, id, options = {}) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const archive = state.archives.find(item => item.id === id && !item.restoredAt && !item.deletedAt)
    if (!archive) throw new Error('找不到可恢复的快照。')
    const destination = resolve(archive.path)
    const runtime = COMMAND_CONTEXT.getStore()
    if (runtime && runtime.policy.mode !== 'danger-full-access' && !inside(runtime.policy.workspaceRoot, destination)) throw new Error('恢复目录超出当前对话可写范围，请先调整权限。')
    if (await lstat(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) throw new Error('原工作树路径已被占用，请先移走该目录：' + destination)
    const commit = (await git(info.root, ['rev-parse', '--verify', '--end-of-options', archive.snapshotRef + '^{commit}'])).trim()
    await mkdir(dirname(destination), { recursive: true })
    await git(info.root, ['worktree', 'add', '--detach', '--', destination, commit], { timeout: 120000 })
    try {
      await git(destination, ['reset', '--soft', archive.head])
      // Ignored configuration belongs on disk, never in the next user commit.
      if (archive.includedFiles?.length) await git(destination, ['rm', '--cached', '--quiet', '--', ...archive.includedFiles.map(path => ':(literal)' + path)])
      archive.restoredAt = new Date().toISOString()
      state.worktrees[destination] = {
        path: destination, branch: '', head: archive.head, createdAt: archive.archivedAt,
        lastUsedAt: archive.restoredAt, pinned: false, sessionIds: addSession(archive, options.sessionId), restoredFrom: id,
        includedFiles: archive.includedFiles ?? [],
      }
      await saveState(info, state)
      return state.worktrees[destination]
    } catch (error) {
      throw new Error('工作树已恢复，但恢复文件状态时失败；目录保留在 ' + destination + '。' + error.message, { cause: error })
    }
  })
}

export async function deleteArchive(cwd, id) {
  const info = await listWorktrees(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const archive = state.archives.find(item => item.id === id && !item.restoredAt && !item.deletedAt)
    if (!archive) throw new Error('找不到可删除的快照。')
    await git(info.root, ['update-ref', '-d', archive.snapshotRef])
    archive.deletedAt = new Date().toISOString()
    await saveState(info, state)
    return { id }
  })
}

export async function inspect(cwd) {
  const info = await listWorktrees(cwd)
  const root = info.root
  const raw = await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', 'HEAD', '--'])
  const stagedNames = splitNul(await git(root, ['diff', '--cached', '--no-renames', '--name-only', '-z', 'HEAD', '--']))
  const unstagedNames = splitNul(await git(root, ['diff', '--no-renames', '--name-only', '-z', '--']))
  const trackedNames = [...new Set([...stagedNames, ...unstagedNames])]
  const untracked = splitNul(await git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
  const files = []
  for (const path of [...new Set([...trackedNames, ...untracked])]) {
    let patch = ''
    if (untracked.includes(path)) {
      const target = resolve(root, path)
      if (!inside(root, target)) continue
      const file = await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
      if (!file || !file.isFile() || file.isSymbolicLink() || file.size > LIMIT) continue
      const content = await readFile(target)
      if (content.includes(0)) continue
      const lines = content.toString('utf8').split('\n')
      if (lines.at(-1) === '') lines.pop()
      patch = ['diff --git a/' + path + ' b/' + path, 'new file mode 100644', '--- /dev/null', '+++ b/' + path, '@@ -0,0 +1,' + lines.length + ' @@', ...lines.map(line => '+' + line)].join('\n') + '\n'
    } else patch = await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', 'HEAD', '--', ':(literal)' + path])
    files.push({ path, patch, untracked: untracked.includes(path), staged: stagedNames.includes(path), unstaged: unstagedNames.includes(path) })
  }
  return { root, branch: info.worktrees.find(tree => samePath(tree.path, root))?.branch ?? '', files, numstat: raw }
}

async function validatePaths(cwd, paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 200) throw new Error('请至少选择一个文件。')
  const status = await git(cwd, ['status', '--porcelain=v1', '--no-renames', '-z', '--untracked-files=all'])
  const allowed = new Set()
  const fields = splitNul(status)
  for (const field of fields) {
    const path = field.length > 3 ? field.slice(3) : ''
    if (path) allowed.add(path)
  }
  for (const path of paths) if (typeof path !== 'string' || !allowed.has(safeRelative(path))) throw new Error('文件状态已变化，请刷新后重试。')
  return paths
}

export async function stage(cwd, paths, staged = true) {
  const info = await listWorktrees(cwd)
  const selected = await validatePaths(info.root, paths)
  const literal = selected.map(path => ':(literal)' + path)
  await git(info.root, staged ? ['add', '--', ...literal] : ['restore', '--staged', '--', ...literal])
  return inspect(info.root)
}

export async function discard(cwd, paths) {
  const info = await listWorktrees(cwd)
  const selected = await validatePaths(info.root, paths)
  const status = await git(info.root, ['status', '--porcelain=v1', '--no-renames', '-z', '--untracked-files=all'])
  const untracked = new Set(splitNul(status).filter(field => field.startsWith('?? ')).map(field => field.slice(3)))
  for (const path of selected) {
    const target = resolve(info.root, path)
    if (!inside(info.root, target)) throw new Error('文件路径越界。')
    const infoStat = await lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (infoStat?.isSymbolicLink()) throw new Error('为避免删除符号链接目标，未删除该文件。')
    if (untracked.has(path)) {
      if (infoStat?.isFile()) await rm(target)
      continue
    }
    const pathspec = ':(literal)' + path
    const inHead = Boolean(await git(info.root, ['ls-tree', '-z', 'HEAD', '--', pathspec]))
    if (inHead) await git(info.root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', pathspec])
    else {
      await git(info.root, ['rm', '--cached', '--force', '--', pathspec]).catch(() => {})
      if (infoStat?.isFile()) await rm(target)
    }
  }
  return inspect(info.root)
}

export async function commit(cwd, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 500) throw new Error('请输入 1 到 500 个字符的提交说明。')
  const info = await listWorktrees(cwd)
  const staged = await git(info.root, ['diff', '--cached', '--quiet', 'HEAD', '--']).then(() => false).catch(() => true)
  if (!staged) throw new Error('暂存区没有改动。')
  await git(info.root, ['commit', '-m', message.trim()], { timeout: 120000 })
  return { head: (await git(info.root, ['rev-parse', '--short', 'HEAD'])).trim() }
}

export async function push(cwd) {
  const info = await listWorktrees(cwd)
  const branch = info.worktrees.find(tree => samePath(tree.path, info.root))?.branch
  if (!branch) throw new Error('当前为 detached HEAD；先创建并切换到分支后再推送。')
  const upstream = (await git(info.root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim()
  if (upstream) await git(info.root, ['push'], { timeout: 120000 })
  else await git(info.root, ['push', '--set-upstream', 'origin', branch], { timeout: 120000 })
  return { branch }
}

export async function readSetupScript(root) {
  return (await readEnvironment(root)).setup
}

export async function readEnvironment(root) {
  const file = resolve(root, '.codex', 'environments', 'environment.toml')
  const content = await readFile(file, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
  if (!content) return { setup: '', actions: [] }
  const config = parseToml(content)
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const setup = config.setup?.[platform]?.script ?? config.setup?.script ?? ''
  if (typeof setup !== 'string' || setup.length > 16000) throw new Error('environment.toml 中的 setup.script 无效。')
  const actions = (Array.isArray(config.actions) ? config.actions : []).map((item, id) => ({ id, name: item.name, command: item.command }))
    .filter(item => typeof item.name === 'string' && typeof item.command === 'string' && item.command.trim() && item.command.length <= 16000)
  return { setup, actions }
}

function validateEnvironment(profile) {
  const name = String(profile?.name ?? '').trim()
  const setup = String(profile?.setup ?? '')
  if (!name || name.length > 80 || setup.length > 16000) throw new Error('环境名称或初始化脚本无效。')
  if (!Array.isArray(profile.actions)) throw new Error('环境操作格式无效。')
  const actions = []
  profile.actions.forEach((item, actionIndex) => {
    const name = String(item?.name ?? '').trim(), command = String(item?.command ?? '').trim()
    if (!name && !command) return
    const field = !name || name.length > 80 ? 'name' : !command || command.length > 16000 ? 'command' : null
    if (field) {
      const reason = field === 'name' ? !name ? '请填写操作名称。' : '操作名称不能超过 80 个字符。'
        : !command ? '请填写操作命令。' : '操作命令不能超过 16000 个字符。'
      throw Object.assign(new Error('第 ' + (actionIndex + 1) + ' 项操作：' + reason), { validation: { actionIndex, field } })
    }
    actions.push({ name, command })
  })
  if (actions.length > 30) throw new Error('环境操作不能超过 30 项。')
  return { name, setup, actions }
}

export async function environmentCatalog(cwd, sessionId) {
  const info = await repository(cwd)
  const state = await loadState(info)
  const native = await readEnvironment(info.root)
  const profiles = [...(state.environments ?? [])]
  if (native.setup || native.actions.length) profiles.unshift({ id: 'project', name: '项目配置 (.codex)', ...native, imported: true })
  return { profiles, defaultId: state.defaultEnvironmentId || '', selectedId: state.drafts?.[sessionId]?.environmentId ?? state.sessionEnvironments?.[sessionId] ?? state.defaultEnvironmentId ?? '', draft: state.drafts?.[sessionId] ?? null, setupWarning: state.sessionSetupWarnings?.[sessionId] || state.drafts?.[sessionId]?.setupWarning || '' }
}

export async function clearSetupWarning(cwd, sessionId) {
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    if (!state.sessionSetupWarnings?.[sessionId]) return
    delete state.sessionSetupWarnings[sessionId]
    await saveState(info, state)
  })
}

export async function saveEnvironment(cwd, input) {
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const value = validateEnvironment(input)
    const id = input.id && input.id !== 'project' ? String(input.id) : randomUUID()
    const index = (state.environments ?? []).findIndex(item => item.id === id)
    if (input.id && input.id !== 'project' && index < 0) throw new Error('环境配置不存在。')
    if (index < 0) state.environments.push({ id, ...value })
    else state.environments[index] = { id, ...value }
    await saveState(info, state)
    return { id }
  })
}

export async function deleteEnvironment(cwd, id) {
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    if (id === 'project' || !(state.environments ?? []).some(item => item.id === id)) throw new Error('环境配置不存在或不可删除。')
    state.environments = state.environments.filter(item => item.id !== id)
    if (state.defaultEnvironmentId === id) state.defaultEnvironmentId = ''
    for (const [sessionId, selected] of Object.entries(state.sessionEnvironments ?? {})) if (selected === id) state.sessionEnvironments[sessionId] = ''
    for (const draft of Object.values(state.drafts ?? {})) if (draft.environmentId === id) draft.environmentId = ''
    await saveState(info, state)
    return { id }
  })
}

export async function selectEnvironment(cwd, sessionId, id, kind = 'session', draft = {}) {
  const info = await repository(cwd)
  return withRepoLock(info.commonDir, async () => {
    const state = await loadState(info)
    const native = await readEnvironment(info.root)
    if (id && !(state.environments ?? []).some(item => item.id === id) && !(id === 'project' && (native.setup || native.actions.length))) throw new Error('所选环境不存在。')
    if (kind === 'default') state.defaultEnvironmentId = id
    else if (kind === 'draft') {
      if (typeof draft.create !== 'boolean' || typeof draft.baseRef !== 'string' || draft.baseRef.length > 200) throw new Error('新对话设置无效。')
      state.drafts[sessionId] = { create: draft.create, baseRef: draft.baseRef, environmentId: id }
    } else if (kind === 'session') state.sessionEnvironments[sessionId] = id
    else throw new Error('环境选择类型无效。')
    await saveState(info, state)
    return { id }
  })
}

export async function consumeDraft(cwd, sessionId, agent, ctx, signal) {
  const info = await repository(cwd)
  const state = await loadState(info)
  const draft = state.drafts?.[sessionId]
  if (!draft && Object.hasOwn(state.sessionEnvironments ?? {}, sessionId)) return
  if (!draft && !state.defaultEnvironmentId) return
  const id = draft?.environmentId ?? state.defaultEnvironmentId ?? ''
  const native = await readEnvironment(info.root)
  const selected = id === 'project' ? native : state.environments?.find(item => item.id === id)
  if (id && !selected) throw new Error('新对话选择的环境已被删除，请重新选择。')
  if (draft?.create) {
    if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode === 'read-only') throw new Error('当前对话处于只读模式，无法创建工作树。')
    let path = draft.createdPath
    if (!path) {
      const result = await createWorktree(cwd, { baseRef: draft.baseRef || 'HEAD', sessionId, setupScript: selected?.setup || '', currentPath: cwd })
      path = result.tree.path
      await withRepoLock(info.commonDir, async () => {
        const latest = await loadState(info)
        if (latest.drafts?.[sessionId]) {
          latest.drafts[sessionId].createdPath = path
          await saveState(info, latest)
        }
      })
      const setupFailure = result.warnings?.find(warning => warning.startsWith('工作树已创建，但环境初始化失败'))
      for (const warning of result.warnings ?? []) ctx.logger.warn('worktree-control: ' + warning)
      if (setupFailure) {
        await withRepoLock(info.commonDir, async () => {
          const latest = await loadState(info)
          if (latest.drafts?.[sessionId]) {
            latest.drafts[sessionId].setupWarning = setupFailure
            await saveState(info, latest)
          }
        })
      }
    }
    await ctx.workingDirectory.set(agent, path, signal)
  }
  await withRepoLock(info.commonDir, async () => {
    const latest = await loadState(info)
    if (latest.drafts?.[sessionId]?.setupWarning) latest.sessionSetupWarnings[sessionId] = latest.drafts[sessionId].setupWarning
    if (latest.drafts?.[sessionId]) delete latest.drafts[sessionId]
    latest.sessionEnvironments[sessionId] = id
    await saveState(info, latest)
  })
}

// PowerShell 5.1 does not turn native nonzero exits into terminating errors.
// Resolve each command at its normal invocation site, then check native exits
// only for statements that actually invoked a native program. Never clear the
// user's LASTEXITCODE, and leave restricted data blocks untouched.
const POWERSHELL_SCRIPT_RUNNER = String.raw`
$ErrorActionPreference = 'Continue'
$PSDefaultParameterValues['*:ErrorAction'] = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Resolve-DshEnvironmentCommand {
  param($Command, [hashtable]$State)
  if ($Command -is [scriptblock]) { return $Command }
  $resolved = if ($Command -is [System.Management.Automation.CommandInfo]) { $Command } else {
    $ExecutionContext.InvokeCommand.GetCommand([string]$Command, [System.Management.Automation.CommandTypes]::All)
  }
  if ($null -eq $resolved) { throw ('Command not found: ' + $Command) }
  $actual = $resolved
  while ($actual -is [System.Management.Automation.AliasInfo]) { $actual = $actual.ResolvedCommand }
  if ($actual -is [System.Management.Automation.ApplicationInfo]) { $State.Native = $true }
  return $resolved
}
function Test-DshGuardedStatement($node) {
  return ($node -is [System.Management.Automation.Language.PipelineAst] -or
    $node -is [System.Management.Automation.Language.AssignmentStatementAst]) -and
    ($node.Parent -is [System.Management.Automation.Language.StatementBlockAst] -or
    $node.Parent -is [System.Management.Automation.Language.NamedBlockAst])
}
try {
  $scriptText = $env:DSH_WORKTREE_SCRIPT
  Remove-Item Env:DSH_WORKTREE_SCRIPT
  $tokens = $null; $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($scriptText, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
  $edits = [System.Collections.Generic.List[object]]::new()
  $statementIndex = 0
  foreach ($node in $ast.FindAll({ param($n) Test-DshGuardedStatement $n }, $true)) {
    $restricted = $false
    for ($parent = $node.Parent; $null -ne $parent; $parent = $parent.Parent) {
      if ($parent -is [System.Management.Automation.Language.DataStatementAst]) { $restricted = $true; break }
    }
    if ($restricted) { continue }
    $stateName = '$__dshCommandState' + $statementIndex++
    $commands = @($node.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true) | Where-Object {
      $owner = $_.Parent
      while ($null -ne $owner -and -not (Test-DshGuardedStatement $owner)) { $owner = $owner.Parent }
      [object]::ReferenceEquals($owner, $node)
    })
    if (-not $commands.Count) {
      $edits.Add(@{ Offset = $node.Extent.EndOffset; Order = 3; Text = ('; if (-not $?) { throw "Expression failed at line ' + $node.Extent.StartLineNumber + '." }') })
      continue
    }
    $edits.Add(@{ Offset = $node.Extent.StartOffset; Order = 0; Text = ($stateName + ' = @{ Native = $false }; ') })
    foreach ($command in $commands) {
      $head = $command.CommandElements[0]
      $invoke = if ($command.InvocationOperator -eq 'Unknown') { '& ' } else { '' }
      $edits.Add(@{ Offset = $head.Extent.StartOffset; Order = 1; Text = ($invoke + '(Resolve-DshEnvironmentCommand -Command ') })
      $edits.Add(@{ Offset = $head.Extent.EndOffset; Order = 2; Text = (' -State ' + $stateName + ')') })
    }
    $check = '; if ((' + $stateName + '.Native -and $LASTEXITCODE -ne 0) -or (-not ' + $stateName + '.Native -and -not $?)) { throw ("Command failed at line ' + $node.Extent.StartLineNumber + ' (exit code " + $LASTEXITCODE + ").") }'
    $edits.Add(@{ Offset = $node.Extent.EndOffset; Order = 3; Text = $check })
  }
  foreach ($edit in ($edits | Sort-Object -Property @{ Expression = { $_.Offset }; Descending = $true }, @{ Expression = { $_.Order }; Descending = $true })) {
    $scriptText = $scriptText.Insert($edit.Offset, $edit.Text)
  }
  . ([scriptblock]::Create($scriptText))
  exit 0
} catch {
  [Console]::Error.WriteLine($_.ToString())
  exit 1
}
`

export async function runSetup(cwd, script, options = {}) {
  if (typeof script !== 'string' || !script.trim() || script.length > 16000) throw new Error('初始化命令为空或过长。')
  const runtime = COMMAND_CONTEXT.getStore()
  const runner = SETUP_RUNNER.getStore()
  if (runner) return runner(cwd, script, next => COMMAND_CONTEXT.run(runtime, () => SETUP_RUNNER.run(null, () => runSetup(cwd, script, next))), runtime?.signal)
  const command = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'
  const args = process.platform === 'win32'
    ? ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', Buffer.from(POWERSHELL_SCRIPT_RUNNER, 'utf16le').toString('base64')]
    : ['-e', '-lc', script]
  // Keep script text out of shell quoting and the Windows argv size limit.
  const extraEnv = process.platform === 'win32' ? { DSH_WORKTREE_SCRIPT: script } : {}
  try {
    if (runtime && options.terminal) return await runManagedTerminal(runtime, cwd, [command, ...args], { ...options, env: extraEnv })
    if (runtime) {
      return (await runManagedCommand(runtime, cwd, [command, ...args], { env: extraEnv, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 })).slice(-16000)
    }
    const env = envForGit(extraEnv)
    const { stdout, stderr } = await execute(command, args, { cwd, env, windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' })
    return (stdout + stderr).slice(-16000)
  } catch (error) {
    throw new Error('环境命令执行失败，已停止后续执行：' + stripVTControlCharacters(String(error.stderr || error.message)).slice(-4000))
  }
}

export async function openPullRequest(cwd) {
  const info = await listWorktrees(cwd)
  const branch = info.worktrees.find(tree => samePath(tree.path, info.root))?.branch
  if (!branch) throw new Error('当前为 detached HEAD，无法创建 PR。')
  const runtime = COMMAND_CONTEXT.getStore()
  if (runtime) return { output: (await runManagedCommand(runtime, info.root, ['gh', 'pr', 'create', '--web'], { timeout: 120000, maxBuffer: 1024 * 1024 })).slice(-8000) }
  const { stdout, stderr } = await execute('gh', ['pr', 'create', '--web'], { cwd: info.root, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024, env: envForGit() })
  return { output: (stdout + stderr).slice(-8000) }
}

export { normalizeRetention, samePath }
