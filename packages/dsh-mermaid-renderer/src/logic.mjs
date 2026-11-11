export function hasMermaidLanguage(classList) {
  return classList?.contains?.('language-mermaid') === true
}

const MERMAID_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|C4(?:Context|Container|Component|Dynamic|Deployment)|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|sankey-beta|quadrantChart|requirementDiagram|zenuml|treemap-beta)\b/i

export function looksLikeMermaidSource(source) {
  const lines = String(source ?? '').split(/\r?\n/).map(line => line.trim())
  let start = 0
  if (lines[0] === '---') {
    const closing = lines.indexOf('---', 1)
    if (closing === -1) return false
    start = closing + 1
  }
  const firstLine = lines.slice(start).find(line => line && !line.startsWith('%%'))
  return firstLine ? MERMAID_START.test(firstLine) : false
}

export function sourceHash(source) {
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
