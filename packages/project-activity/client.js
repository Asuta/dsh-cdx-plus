/**
 * DSH 0.2.1-rc.3 has no project-header slot. Subscribe to the workspace
 * browser's own status source, then decorate data-row-key/aria-expanded.
 * Folded children do not exist in the DOM, so never scan them for activity.
 */
window.__ModuleLoader__.load({
  id: 'dsh-asuta-project-activity',
  factory(require) {
    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { StateDot } = require('@deepseek-ai/dsh-client-ui-primitives')
    const PLUGIN = 'dsh-asuta-project-activity'
    const ROW = '[role="treeitem"][data-row-key^="workspace:"]'
    const MARK = 'data-project-activity'
    const CSS = `
      [${MARK}] { display:inline-flex;align-items:center;justify-content:center;
        flex:0 0 16px;width:16px;height:20px;margin-inline-start:6px;
        color:var(--dsw-alias-label-tertiary); }
      [data-row-key^="workspace:"][aria-expanded="true"] > [${MARK}] { display:none; }
    `

    function runningCounts(workspaces, list, statuses) {
      const archived = new Set(workspaces.archivedSessionIds)
      const byId = list.byId
      const active = (id) => {
        const row = byId[id]
        if (!row || row.blank || row.origin === 'subagent' || archived.has(id)) return false
        const status = statuses.get(id)
        const waiting = ['approval', 'plan-review', 'question'].includes(status?.pendingInteraction?.kind)
        if (!waiting && (status?.running ?? row.running) === true) return true
        return (list.projectionsBySession?.[id]?.values.subagentCatalog ?? []).some(
          (child) => (statuses.get(child.id)?.running ?? byId[child.id]?.running) === true,
        )
      }
      const counts = new Map()
      const assigned = new Set()
      for (const workspace of workspaces.items) {
        let count = 0
        for (const id of new Set(workspace.sessionIds)) {
          assigned.add(id)
          if (active(id)) count++
        }
        counts.set(workspace.workspaceId, count)
      }
      counts.set('', Object.keys(byId).filter((id) => !assigned.has(id) && active(id)).length)
      return counts
    }

    function label(count) {
      return document.documentElement.lang.toLowerCase().startsWith('zh')
        ? `有 ${count} 个对话正在运行`
        : `${count} conversation${count === 1 ? '' : 's'} running`
    }

    function install(ctx) {
      const sources = [ctx.workspaces.list, ctx.sessions.list, ctx.uiSession.sessionStatus]
      const mounts = new Map()
      let disposed = false
      let frame = null
      const style = document.createElement('style')
      style.dataset.plugin = PLUGIN
      style.dataset.pluginCss = `${PLUGIN}/activity.css`
      style.textContent = CSS
      document.head.appendChild(style)
      const remove = (row) => {
        const entry = mounts.get(row)
        if (!entry) return
        entry.root.unmount()
        entry.anchor.remove()
        mounts.delete(row)
      }
      const flush = () => {
        frame = null
        if (disposed) return
        const counts = runningCounts(...sources.map((source) => source.getSnapshot()))
        const rows = new Set(document.querySelectorAll(ROW))
        for (const row of mounts.keys()) if (!rows.has(row)) remove(row)
        for (const row of rows) {
          const count = counts.get(row.getAttribute('data-row-key').slice('workspace:'.length)) ?? 0
          if (row.getAttribute('aria-expanded') !== 'false' || count === 0) { remove(row); continue }
          let entry = mounts.get(row)
          if (entry && entry.anchor.parentElement !== row) { remove(row); entry = undefined }
          if (!entry) {
            const anchor = document.createElement('span')
            anchor.setAttribute(MARK, '')
            anchor.setAttribute('role', 'img')
            row.appendChild(anchor)
            entry = { anchor, root: createRoot(anchor), text: '' }
            mounts.set(row, entry)
            entry.root.render(React.createElement(StateDot, { state: 'ongoing' }))
          }
          const text = label(count)
          if (entry.text !== text) {
            entry.anchor.setAttribute('aria-label', text)
            entry.anchor.title = text
            entry.text = text
          }
        }
      }
      const schedule = () => {
        if (!disposed && frame === null) frame = window.requestAnimationFrame(flush)
      }
      const containsRow = (node) => node.nodeType === 1 && (node.matches(ROW) || node.querySelector(ROW) !== null)
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            if (record.target === document.documentElement || record.target.matches(ROW)) { schedule(); return }
          } else if ((record.target.nodeType === 1 && record.target.matches(ROW)) ||
            [...record.addedNodes, ...record.removedNodes].some(containsRow)) { schedule(); return }
        }
      })
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded', 'data-row-key'] })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
      const stops = sources.map((source) => source.subscribe(schedule))
      flush()
      return () => {
        disposed = true
        observer.disconnect()
        for (const stop of stops) stop()
        if (frame !== null) window.cancelAnimationFrame(frame)
        for (const row of mounts.keys()) remove(row)
        style.remove()
      }
    }

    return {
      inject: ['workspaces', 'sessions', 'uiSession'],
      apply(ctx) { ctx.effect(() => install(ctx), 'project-activity: collapsed project indicators') },
    }
  },
})
