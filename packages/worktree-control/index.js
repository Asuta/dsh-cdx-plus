import { archiveWorktree, clearSetupWarning, commit, configure, consumeDraft, createBranch, createWorktree, deleteArchive, deleteEnvironment, discard, environmentCatalog, handoffWorktree, inspect, openPullRequest, overview, push, readEnvironment, restoreArchive, runSetup, samePath, saveEnvironment, selectEnvironment, setPinned, stage, switchWorktree, withCommandContext, withRepoLock, git } from './git.js'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { withSetupRunner } from './git.js'
import { EnvironmentTerminals } from './terminal-jobs.js'
import { worktreeSession } from './git.js'

export const name = 'dsh-asuta-worktree-control'
export const inject = ['webServer', 'connection', 'agents', 'sessionQuery', 'workingDirectory', 'subprocess', 'sandbox', 'sandboxPolicy', 'workspaceRegistry']

const ACTIONS = new Set(['capability', 'catalog', 'create', 'fork-capability', 'switch', 'handoff', 'branch', 'archive', 'restore', 'delete-archive', 'pin', 'retention', 'inspect', 'stage', 'unstage', 'discard', 'commit', 'push', 'pull-request', 'setup', 'environment-action', 'environment-save', 'environment-delete', 'environment-select', 'location-kind'])
for (const action of ['environment-menu', 'terminal-jobs', 'terminal-claim', 'terminal-bind', 'terminal-stop']) ACTIONS.add(action)

async function validateFork(ctx, source, target, atSeq, signal) {
  if (!source) throw new Error('源对话未连接，请重新打开源对话后再试。')
  if (source.status !== 'idle') throw new Error('源对话仍在运行，请等待回复或工具任务完成后再试。')
  const header = target.session.header
  if (source.id === target.id || header.origin === 'subagent' || !header.isSeeded
    || (header.parentSession !== undefined && header.parentSession !== source.id)) {
    throw new Error('目标对话不是当前源对话的普通分支。')
  }
  if (!Number.isSafeInteger(atSeq) || atSeq < 0) throw new Error('分支位置无效，请刷新页面后重新创建分支。')
  // Ordinary forks omit parentSession in DSH 0.2.2. Verify the exact inherited
  // prefix instead; synthetic fork closers and child settings are outside it.
  const count = atSeq + 1
  const sourceView = await ctx.sessionQuery.observeSession(source.id, { signal, projectionMode: 'none' })
  let targetView
  try {
    targetView = await ctx.sessionQuery.observeSession(target.id, { signal, projectionMode: 'none' })
    if (targetView.inheritedEventCount !== count || sourceView.cursor < atSeq || targetView.cursor < atSeq) {
      throw new Error('目标对话继承的历史与所选分支位置不一致，请重新创建分支。')
    }
    const sourceEvents = sourceView.events, targetEvents = targetView.events
    for (let seq = 0; seq < count; seq++) {
      if (!isDeepStrictEqual(sourceEvents[seq], targetEvents[seq])) {
        throw new Error('目标对话的历史与源对话不匹配，无法创建工作树。')
      }
    }
  } finally {
    targetView?.[Symbol.dispose]()
    sourceView[Symbol.dispose]()
  }
}

export function apply(ctx) {
  const lifecycle = new AbortController()
  const terminals = new EnvironmentTerminals(ctx, lifecycle.signal)
  const visibleSetup = (agent, operation) => withSetupRunner((cwd, script, execute, signal) =>
    terminals.enqueue(agent.id, '初始化环境', cwd, script, execute, { signal }).done, operation)
  const repositories = new Set()
  ctx.effect(() => ctx.provide('worktreeSessions', {
    describe: cwd => worktreeSession(cwd),
    async register(cwd, sessionId) {
      const membership = await worktreeSession(cwd, sessionId)
      if (membership) repositories.add(membership.projectPath)
      return membership
    },
  }), 'worktree-control: shared session membership')
  const prepared = new WeakSet()
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const { agent, signal } = context
    if (agent && !prepared.has(agent)) {
      const cwd = ctx.workingDirectory.get(agent.session)
      const root = await git(cwd, ['rev-parse', '--show-toplevel']).then(value => value.trim()).catch(() => null)
      if (root) await withCommandContext(ctx, agent.session, () => visibleSetup(agent, () => consumeDraft(cwd, agent.id, agent, ctx, signal)), signal)
      prepared.add(agent)
    }
    return next()
  }, { prepend: true })
  ctx.effect(() => {
    const workspace = ctx.workspaceRegistry
    const original = workspace.archiveSession
    const archive = async function (sessionId, options) {
      const owner = ctx.agents.get(sessionId)
      const known = new Set(repositories)
      if (owner) known.add(ctx.workingDirectory.get(owner.session))
      await original.call(this, sessionId, options)
      const visitedPaths = []
      for (const cwd of known) {
        if (visitedPaths.some(path => samePath(path, cwd))) continue
        if (!owner || owner.status !== 'idle') continue
        try {
          await owner.runMaintenance(signal => withCommandContext(ctx, owner.session, async () => {
            if (ctx.sandboxPolicy.resolve({ session: owner.session }).mode === 'read-only') return
            const catalog = await overview(cwd)
            visitedPaths.push(...catalog.worktrees.map(tree => tree.path))
            const candidates = catalog.worktrees.filter(tree => tree.managed && !tree.pinned && tree.sessionIds?.includes(sessionId)
              && tree.sessionIds.every(id => workspace.archivedSessionIds.includes(id)))
            for (const tree of candidates) {
              if (terminals.using(tree.path)) continue
              if (samePath(ctx.workingDirectory.get(owner.session), tree.path)) {
                await ctx.workingDirectory.set(owner, catalog.primaryRoot, lifecycle.signal)
              }
              await archiveWorktree(cwd, tree.path, { sessionId, currentPath: catalog.primaryRoot, isAgentActive: async (id, path) => {
                if (id && workspace.pinnedSessionIds.includes(id)) return true
                for (const other of ctx.agents.list()) {
                  if (other.id === sessionId || workspace.archivedSessionIds.includes(other.id)) continue
                  const directory = ctx.workingDirectory.get(other.session)
                  const root = (await git(directory, ['rev-parse', '--show-toplevel']).catch(() => directory)).trim()
                  if (samePath(root, path)) return true
                }
                return false
              } })
            }
          }, AbortSignal.any([signal, lifecycle.signal])))
        } catch (error) { ctx.logger.warn('worktree-control: 对话已归档，工作树保留待后续清理：' + error.message) }
      }
    }
    workspace.archiveSession = archive
    return () => { if (workspace.archiveSession === archive) workspace.archiveSession = original }
  }, 'worktree-control: chat archive')
  ctx.effect(() => () => lifecycle.abort(), 'worktree-control: lifecycle')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/worktree-control/terminal',
    handler: async (req, res) => {
      try { await terminals.handle(req, res) }
      catch (error) { if (!res.headersSent) res.statusCode = 400; if (!res.writableEnded) res.end() }
    },
  }), 'worktree-control: visible command bridge')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/worktree-control/api',
    handler: async (req, res) => {
      const send = (status, value) => {
        if (res.writableEnded) return
        res.statusCode = status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(value))
      }
      if (ctx.connection.requestRejection(req) !== undefined) return send(403, { ok: false, error: 'forbidden' })
      if (req.method !== 'POST') return send(405, { ok: false, error: 'POST required' })
      const action = new URL(req.url, 'http://dsh.local').pathname.slice('/worktree-control/api/'.length)
      if (!ACTIONS.has(action)) return send(404, { ok: false, error: 'unknown action' })
      try {
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 16 * 1024) throw new Error('请求过大。')
          chunks.push(chunk)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (action === 'location-kind') {
          const path = body?.path
          if (typeof path !== 'string' || path.length > 2048) throw new Error('无效的目录。')
          const [root, directory, common] = (await git(path, ['rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir']).catch(() => '')).trim().split(String.fromCharCode(10)).map(item => item.trim())
          const key = value => process.platform === 'win32' ? value.toLowerCase() : value
          return send(200, { ok: true, value: { worktree: Boolean(root && directory && common && key(resolve(root, directory)) !== key(resolve(root, common))) } })
        }
        if (typeof body?.sessionId !== 'string' || !/^[\w-]{1,128}$/.test(body.sessionId)) throw new Error('无效的会话 ID。')
        if (action === 'terminal-jobs') return send(200, { ok: true, value: terminals.list(body.sessionId) })
        if (action === 'terminal-claim') return send(200, { ok: true, value: terminals.claim(body.sessionId, body.id, body.owner) })
        if (action === 'terminal-bind') {
          terminals.bind(body.sessionId, body.id, body.owner, body.terminalId, body.tabId)
          return send(200, { ok: true, value: {} })
        }
        if (action === 'terminal-stop') {
          terminals.cancel(terminals.get(body.sessionId, body.id), '命令已停止。' + (typeof body.reason === 'string' ? body.reason.slice(0, 300) : ''))
          return send(200, { ok: true, value: {} })
        }
        const agent = ctx.agents.get(body.sessionId)
        if (!agent) throw new Error('请先打开目标对话，等待会话连接。')
        if (action === 'environment-menu') return send(200, { ok: true, value: await environmentCatalog(ctx.workingDirectory.get(agent.session), agent.id) })
        if (action === 'environment-action' || action === 'setup') {
          // Maintenance remains idle to observers. Share its session lock until
          // the terminal is registered; never hold it for the command lifetime.
          return await withRepoLock('session:' + body.sessionId, async () => {
            const cwd = ctx.workingDirectory.get(agent.session)
            const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
            const environments = await environmentCatalog(root, agent.id)
            const selected = environments.profiles.find(item => item.id === environments.selectedId)
            if (body.environmentId !== undefined && body.environmentId !== environments.selectedId) throw new Error('环境已切换，请刷新菜单后重试。')
            const item = action === 'setup' ? { name: '初始化环境', command: selected?.setup }
              : Number.isSafeInteger(body.id) ? selected?.actions?.[body.id] : undefined
            if (!item?.command) throw new Error('当前环境没有配置此命令。')
            const active = terminals.active(agent.id, item.name, root, item.command)
            if (active) return send(200, { ok: true, value: { terminalJob: terminals.summary(active) } })
            if (agent.status !== 'idle') throw new Error('请等待当前回复完成后再运行环境命令。')
            if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode === 'read-only') throw new Error('当前对话处于只读模式，无法运行环境命令。')
            const job = terminals.enqueue(agent.id, item.name, root, item.command, options =>
              withCommandContext(ctx, agent.session, () => {
                if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode === 'read-only') throw new Error('当前对话已切换为只读模式，命令未执行。')
                return runSetup(root, item.command, options)
              }, lifecycle.signal), { timeout: action === 'setup' ? 10 * 60 * 1000 : 0 })
            if (action === 'setup') void job.done.then(() => clearSetupWarning(root, agent.id)).catch(() => {})
            return send(200, { ok: true, value: { terminalJob: terminals.summary(job) } })
          })
        }
        if (action === 'capability') {
          const cwd = ctx.workingDirectory.get(agent.session)
          const isGitRepository = (await git(cwd, ['rev-parse', '--is-inside-work-tree']).catch(() => '')).trim() === 'true'
          const hasHead = isGitRepository && Boolean((await git(cwd, ['rev-parse', '--verify', 'HEAD']).catch(() => '')).trim())
          const writable = ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'read-only'
          return send(200, { ok: true, value: { isGitRepository, available: Boolean(hasHead && writable) } })
        }
        if (action === 'fork-capability') {
          if (agent.status !== 'idle') return send(200, { ok: true, value: { available: false, reason: '请等待当前回复完成。' } })
          if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode === 'read-only') return send(200, { ok: true, value: { available: false, reason: '当前对话为只读模式。' } })
          const cwd = ctx.workingDirectory.get(agent.session)
          const available = Boolean(await git(cwd, ['rev-parse', '--show-toplevel', '--verify', 'HEAD']).catch(() => ''))
          return send(200, { ok: true, value: { available, ...available ? {} : { reason: '当前目录不是有提交的 Git 工作树。' } } })
        }
        const mutate = !['catalog', 'inspect'].includes(action)
        if (mutate && agent.status !== 'idle') throw new Error('请等待当前回复或工具任务完成后再操作工作树。')
        const operation = signal => {
        const run = async () => {
        if (mutate && ctx.sandboxPolicy.resolve({ session: agent.session }).mode === 'read-only') throw new Error('当前对话处于只读模式，请先调整权限后再管理工作树。')
        const sourceAgent = action === 'create' && body.sourceSessionId ? ctx.agents.get(body.sourceSessionId) : null
        if (body.sourceSessionId && action === 'create') {
          await validateFork(ctx, sourceAgent, agent, body.forkAtSeq, signal)
          if (ctx.sandboxPolicy.resolve({ session: sourceAgent.session }).mode === 'read-only') throw new Error('源对话处于只读模式，无法创建工作树。')
        }
        const cwd = await ctx.workingDirectory.ensure(sourceAgent ?? agent, lifecycle.signal)
        const currentPath = ctx.workingDirectory.get((sourceAgent ?? agent).session)
        const currentRoot = (await git(currentPath, ['rev-parse', '--show-toplevel']).catch(() => currentPath)).trim()
        if (mutate && !action.startsWith('environment-') &&
          [currentRoot, body.path, body.target].filter(value => typeof value === 'string').some(path => terminals.using(path))) {
          throw new Error('此工作树有环境命令正在执行，请先在终端中停止命令，再修改 Git 状态或切换工作树。')
        }
        repositories.add(currentRoot)
        const isAgentActive = async (sessionId, targetPath) => {
          if (terminals.using(targetPath)) return true
          if (sessionId && ctx.get('workspaceRegistry')?.pinnedSessionIds.includes(sessionId)) return true
          for (const other of ctx.agents.list()) {
            const path = ctx.workingDirectory.get(other.session)
            const root = (await git(path, ['rev-parse', '--show-toplevel']).catch(() => path)).trim()
            if (samePath(root, targetPath)) return true
          }
          return false
        }
        const result = await (async () => {
          if (action === 'catalog') return { ...await overview(cwd, body.sessionId), environments: await environmentCatalog(cwd, body.sessionId) }
          if (action === 'environment-save') return saveEnvironment(cwd, body.profile)
          if (action === 'environment-delete') return deleteEnvironment(cwd, body.id)
          if (action === 'environment-select') return selectEnvironment(cwd, body.sessionId, body.id || '', body.kind, body.draft)
          if (action === 'create') {
            const environments = await environmentCatalog(cwd, body.sessionId)
            const selected = environments.profiles.find(item => item.id === environments.selectedId)
            return createWorktree(cwd, {
            baseRef: body.baseRef, branch: body.branch, name: body.name,
            includeChanges: Boolean(body.includeChanges), setupScript: body.runSetup ? (selected?.setup || (await readEnvironment(currentRoot)).setup) : '',
            retentionLimit: body.retentionLimit, sessionId: body.sessionId, currentPath: currentRoot,
            isAgentActive,
          })
          }
          if (action === 'switch') return { path: await switchWorktree(cwd, body.target, body.sessionId) }
          if (action === 'handoff') return handoffWorktree(cwd, body.target, body.sessionId)
          if (action === 'branch') return createBranch(cwd, body.branch)
          if (action === 'archive') return archiveWorktree(cwd, body.path, { currentPath: currentRoot, sessionId: body.sessionId, isAgentActive })
          if (action === 'restore') return { tree: await restoreArchive(cwd, body.id, { sessionId: body.sessionId }) }
          if (action === 'delete-archive') return deleteArchive(cwd, body.id)
          if (action === 'pin') return setPinned(cwd, body.path, body.pinned)
          if (action === 'retention') return configure(cwd, { retentionLimit: body.value, worktreeRoot: body.worktreeRoot })
          if (action === 'inspect') return inspect(cwd)
          if (action === 'stage') return stage(cwd, body.paths, true)
          if (action === 'unstage') return stage(cwd, body.paths, false)
          if (action === 'discard') return discard(cwd, body.paths)
          if (action === 'commit') return commit(cwd, body.message)
          if (action === 'push') return push(cwd)
          if (action === 'pull-request') return openPullRequest(cwd)
          throw new Error('未知操作。')
        })()
        const target = result?.tree?.path ?? result?.path
        if (['create', 'switch', 'restore', 'handoff'].includes(action) && target) {
          try { result.path = await ctx.workingDirectory.set(agent, target, lifecycle.signal) }
          catch (error) { throw new Error('Git 操作已完成，但会话目录切换失败。目录保留在 ' + target + '；可从列表重新切换。' + error.message) }
        }
        return result
        }
        const needsSandboxCommand = mutate && !['environment-save', 'environment-delete', 'environment-select'].includes(action)
        const commandAgent = action === 'create' && body.sourceSessionId ? ctx.agents.get(body.sourceSessionId) : agent
        return needsSandboxCommand ? withCommandContext(ctx, commandAgent?.session ?? agent.session, () => visibleSetup(agent, run), signal) : run()
        }
        const value = await withRepoLock('session:' + body.sessionId, () => mutate
          ? agent.runMaintenance(signal => operation(AbortSignal.any([signal, lifecycle.signal])))
          : operation(lifecycle.signal))
        send(200, { ok: true, value })
      } catch (error) {
        const validation = error.validation
        send(400, { ok: false, error: String(error.message ?? error),
          ...(Number.isSafeInteger(validation?.actionIndex) && validation.actionIndex >= 0 && ['name', 'command'].includes(validation.field) ? { validation } : {}) })
      }
    },
  }), 'worktree-control: api')
}

export { commit, createWorktree, deleteArchive, discard, inspect, overview, restoreArchive, setPinned, stage, switchWorktree }
