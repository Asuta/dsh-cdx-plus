import { randomUUID } from 'node:crypto'
import { readState, updateState, asId, boundedText } from './store.js'

export async function artifactOperation(ctx, action, args, exec) {
  const sessionId = asId(args.sessionId ?? exec?.agent?.session?.id, 'sessionId')
  const row = (await ctx.sessionQuery.listSessions()).find(r => r.header.id === sessionId)
  if (!row || row.header.origin === 'subagent') throw new Error('Main conversation not found')
  if (action === 'list_artifacts') return { sessionId, items: (await readState()).artifacts[sessionId] ?? [] }
  if (action === 'attach_artifact') {
    const value = boundedText(args.value, 'value', 2048)
    if (args.kind === 'pr') {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url.pathname)) throw new Error('Expected a GitHub pull-request URL')
    } else if (args.kind === 'worktree') {
      if (!/^(?:[A-Za-z]:\\|\/)/.test(value)) throw new Error('Expected an absolute worktree path')
    } else throw new Error('Unknown artifact kind')
    return updateState(state => {
      const list = state.artifacts[sessionId] ?? (state.artifacts[sessionId] = [])
      const existing = list.find(x => x.kind === args.kind && x.value === value)
      if (existing) return { artifact: existing, existing: true }
      const artifact = { id: randomUUID(), kind: args.kind, value, label: args.label ? boundedText(args.label, 'label', 200) : value, attachedAt: new Date().toISOString() }
      list.push(artifact)
      return { artifact, existing: false }
    })
  }
  if (action === 'remove_artifact') return updateState(state => {
    const list = state.artifacts[sessionId] ?? []
    const index = list.findIndex(x => x.id === asId(args.artifactId, 'artifactId'))
    if (index === -1) throw new Error('Artifact link not found')
    const [artifact] = list.splice(index, 1)
    if (!list.length) delete state.artifacts[sessionId]
    return { removedId: artifact.id, originalArtifactRetained: true }
  })
  throw new Error('Unknown artifact operation')
}
