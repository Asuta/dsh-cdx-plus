import { mkdir, rmdir, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { boundedText } from './store.js'

export function project(ctx, workspaceId) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('workspaceId is required')
  const value = ctx.workspaceRegistry.get(workspaceId)
  if (!value) throw new Error('Workspace not found')
  return value
}

export function projectView(workspace, { includeSessionIds = true } = {}) {
  return { id: workspace.id, path: workspace.path, title: workspace.title, sessionCount: workspace.sessionIds.length,
    ...(includeSessionIds ? { sessionIds: [...workspace.sessionIds] } : {}) }
}

export async function createProject(ctx, { path, title } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || !path.trim()) throw new Error('An absolute workspace path is required; ask the user when none was supplied')
  const nextTitle = title === undefined ? undefined : boundedText(title, 'title')
  // Create only the final directory; never invent a parent path.
  let createdDirectory = false
  try {
    const info = await stat(path).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (info && !info.isDirectory()) throw new Error('Workspace path must be a directory')
    if (!info) {
      await mkdir(path)
      createdDirectory = true
    }
    const existing = await ctx.workspaceRegistry.resolveByPath(path)
    if (existing) return { workspace: projectView(existing), created: false, createdDirectory }
    if (nextTitle !== undefined && ctx.workspaceRegistry.list().some(workspace => workspace.title === nextTitle)) throw new Error('Workspace name already in use')
    const workspace = await ctx.workspaceRegistry.create(path)
    if (nextTitle !== undefined) await workspace.setTitle(nextTitle)
    return { workspace: projectView(workspace), created: true, createdDirectory }
  } catch (error) {
    if (createdDirectory) {
      let registered = false
      try { registered = !!(await ctx.workspaceRegistry.resolveByPath(path)) } catch { registered = true }
      if (!registered) await rmdir(path).catch(() => {})
    }
    throw error
  }
}

export async function renameProject(ctx, { workspaceId, title }) {
  const workspace = project(ctx, workspaceId)
  const nextTitle = boundedText(title, 'title')
  if (ctx.workspaceRegistry.list().some(other => other.id !== workspace.id && other.title === nextTitle)) throw new Error('Workspace name already in use')
  await workspace.setTitle(nextTitle)
  return { workspace: projectView(workspace) }
}

export async function removeProject(ctx, { workspaceId }) {
  const workspace = project(ctx, workspaceId)
  if (!await ctx.workspaceRegistry.delete(workspace.id)) throw new Error('Workspace not found')
  return { workspaceId, removed: true, directoryDeleted: false, conversationsDeleted: false }
}

export async function reorderProject(ctx, { workspaceId, beforeWorkspaceId }) {
  project(ctx, workspaceId)
  if (beforeWorkspaceId !== undefined) project(ctx, beforeWorkspaceId)
  return { workspaceIds: [...await ctx.workspaceRegistry.insertBefore(workspaceId, beforeWorkspaceId)] }
}

export async function reorderProjectThread(ctx, { workspaceId, sessionId, beforeSessionId }) {
  const workspace = project(ctx, workspaceId)
  await workspace.insertSessionBefore(sessionId, beforeSessionId)
  return { workspace: projectView(workspace) }
}

export async function archiveProjectThreads(ctx, { workspaceId }) {
  const workspace = project(ctx, workspaceId)
  const archived = new Set(ctx.workspaceRegistry.archivedSessionIds)
  const result = { workspaceId, archived: [], failed: [] }
  for (const sessionId of workspace.sessionIds) {
    if (archived.has(sessionId)) continue
    try {
      await ctx.workspaceRegistry.archiveSession(sessionId)
      result.archived.push(sessionId)
    } catch (error) {
      result.failed.push({ sessionId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { ...result, ok: result.failed.length === 0 }
}
