/**
 * Session mover (browser half).
 *
 * The sidebar rows are already native HTML5 drag sources:
 * `[role=treeitem][draggable=true][data-row-key=session:<id>]`, both in the
 * Workspace tree and in the 最近 list, and Workspace rows carry
 * `data-row-key=workspace:<id>` (`workspace:` alone is 未分组). The shipped tree
 * only reorders Sessions inside one Workspace, so this layer accepts the drag
 * only when the pointer is over a *different* group, keeps the app's own drop
 * handling intact for every other case, and sends the move to the Host half.
 *
 * The dragged conversation's own group comes from the Workspace membership
 * stream, so a row outside the tree works the same way. The drop group is the
 * hovered Workspace row, or the nearest preceding one for a hovered Session row.
 * Nothing is guessed from styling.
 */
window.__ModuleLoader__.load({
  id: 'dsh-asuta-session-mover',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'sessionMover'
    const en = {
      label: 'Move to workspace',
      moved: 'Moved to “{name}”',
      undone: 'Move undone',
      undo: 'Undo',
      failed: 'Move failed: {reason}',
      running: 'Stop the reply or tool execution before moving this conversation',
      pending: 'The conversation has an operation in progress. Try again shortly.',
      unsupported: 'This DSH version does not support moving loaded conversations.',
      notReady: 'Moving is not ready yet. Restart DSH and try again.',
      restoreFailed: 'Automatic recovery failed. The conversation backup has been kept.',
      notAllowed: 'this DSH build refuses the move',
      busy: 'Moving…',
      orderUnavailable: 'Native sidebar ordering is unavailable. No conversation was moved.',
      stalePosition: 'The target position changed. Please drop again.',
      orderFailed: 'The conversation moved, but its display order needs retrying. Use Undo to restore it.',
      forkOrderFailed: 'The branch was created, but its sidebar position could not be saved. You can drag it into place.',
      ungrouped: 'Ungrouped',
    }
    const zh = {
      label: '移动到工作区',
      moved: '已移到“{name}”',
      undone: '已撤销移动',
      undo: '撤销',
      failed: '移动失败：{reason}',
      running: '请先停止这条对话的回复或工具执行，再拖动',
      pending: '这条对话正在打开或处理操作，请稍后再拖动',
      unsupported: '当前 DSH 版本不支持安全搬移已加载的对话',
      notReady: '移动功能尚未就绪，请重启 DSH 后再试',
      restoreFailed: '自动恢复未完成，已保留对话备份，请检查后再操作',
      notAllowed: '这个 DSH 版本拒绝了这次移动',
      busy: '正在移动…',
      orderUnavailable: '侧栏排序接口暂不可用，未移动对话',
      stalePosition: '目标位置已变化，请重新拖放',
      orderFailed: '对话已移动，但显示排序未完成，可撤销恢复',
      forkOrderFailed: '分支已创建，但侧栏位置未能保存，可手动拖动调整',
      ungrouped: '未分组',
    }

    const PREFIX = '/__session-mover'
    const DROP_CLASS = 'dsm-workspace-drop'
    const LOOSE_TARGET = 'data-session-mover-ungrouped'
    /** Host id of 未分组; the sidebar's own account key for it is ''. */
    const UNGROUPED = 'ungrouped'
    const wireId = key => key === '' ? UNGROUPED : key
    const groupKey = id => id === UNGROUPED ? '' : id
    let clientContext
    const refreshing = new Map()
    const forkOrderFailures = new Set()

    // Preserve the existing Client Session and input binding. Only invalidate metadata.
    function refreshMoved(sessionId) {
      const existing = refreshing.get(sessionId)
      if (existing) { existing.again = true; return existing.promise }
      const state = { again: false }
      const promise = (async () => {
        do {
          state.again = false
          await post('settled', { sessionId })
          const api = clientContext?.get('sessions')
          const concrete = api?.[Symbol.for('cordis.original')] ?? api
          const manager = concrete?.manager
          if (!manager || typeof concrete.refresh !== 'function') throw new Error('Session refresh adapter unavailable')
          manager.projectionInflight.get(sessionId)?.controller.abort()
          manager.projectionInflight.delete(sessionId)
          manager.projectionLoads.delete(sessionId)
          manager.projectionStores.get(sessionId)?.clear()
          await Promise.all([api.refreshProjections(sessionId), concrete.refresh()])
        } while (state.again)
      })().finally(() => refreshing.delete(sessionId))
      state.promise = promise
      refreshing.set(sessionId, state)
      return promise
    }

    /** JSON POST to one Host route. */
    async function post(route, body) {
      const response = await fetch(`${PREFIX}/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-mover': '1' },
        body: JSON.stringify(body),
      })
      return response.json()
    }

    /**
     * Resolve the slot's `t` with a browser-language fallback.
     * @param t - registration translator, when the locale service shared one.
     */
    function translator(t) {
      const fallback = String(navigator.language || '').toLowerCase().startsWith('zh') ? zh : en
      return (key) => {
        if (typeof t === 'function') {
          const text = t(key)
          if (typeof text === 'string' && text !== '' && text !== key) return text
        }
        return fallback[key] ?? key
      }
    }

    /** Ordered `data-row-key` rows of the tree that owns this element. */
    function treeRows(element) {
      const tree = element.closest('[role="tree"]')
      if (!tree) return null
      return Array.from(tree.querySelectorAll('[data-row-key]')).map((row) => ({
        row,
        key: row.getAttribute('data-row-key') ?? '',
      }))
    }

    /** The Workspace that owns the row at `index`, by nearest preceding Workspace row. */
    function workspaceAt(rows, index) {
      for (let cursor = index; cursor >= 0; cursor -= 1) {
        const key = rows[cursor]?.key ?? ''
        if (key.startsWith('workspace:')) return { id: key.slice('workspace:'.length), row: rows[cursor].row }
      }
      return null
    }

    /** Group key that currently owns a Session: its Workspace id, or '' for 未分组. */
    function ownerKey(workspaces, sessionId) {
      return workspaces.items.find(w => w.sessionIds.includes(sessionId))?.workspaceId ?? ''
    }

    /** Native DSH omits an empty 未分组 bucket. Own one temporary row per drag. */
    function mountUngroupedTarget(title) {
      const tree = document.querySelector('[data-slot="sidebar.workspaces"] [role="tree"]')
      if (!tree || tree.querySelector('[data-row-key="workspace:"]')) return null
      const row = document.createElement('div')
      row.className = 'dsm-ungrouped-target'
      row.setAttribute(LOOSE_TARGET, '')
      row.setAttribute('role', 'treeitem')
      row.setAttribute('aria-label', title)
      row.textContent = title
      // Keep this out of the native row-key/animation and workspace-fold lists.
      tree.appendChild(row)
      return row
    }

    // The native sidebar owns a single persistent store. Do not recreate it or edit localStorage.
    function nativeOrderContext() {
      const scopedUi = clientContext?.get('uiWorkspace')
      const ui = scopedUi?.[Symbol.for('cordis.original')] ?? scopedUi
      const workspaces = clientContext?.get('workspaces')?.list.getSnapshot()
      const list = clientContext?.get('sessions')?.list.getSnapshot()
      const entries = clientContext?.slots.entries('sidebar.workspaces') ?? []
      const candidate = entries.find(entry => entry.store?.spec?.persist === 'dsh.workspace.view.v5' && typeof entry.store.create === 'function')
      const store = candidate?.store.create()
      if (!store?.getSnapshot || !store?.actions?.setSessionOrder || !store?.actions?.setOrderBy || store.actions !== ui?.view || !workspaces || workspaces.phase !== 'ready' || !list || list.phase !== 'ready') throw new Error('ORDER_UNAVAILABLE')
      const view = store.getSnapshot()
      if (!['manual', 'updated'].includes(view.orderBy)) throw new Error('ORDER_UNAVAILABLE')
      const orders = accountOrders(workspaces, list, view)
      return { store, workspaces, list, view, orders, pins: new Set(workspaces.pinnedSessionIds), archived: new Set(workspaces.archivedSessionIds) }
    }

    function recentOrder(ids, summaries) {
      return ids.filter(id => summaries[id]).sort((a, b) => {
        const x = summaries[a].updatedAt, y = summaries[b].updatedAt
        return x === y ? (a < b ? -1 : a === b ? 0 : 1) : x > y ? -1 : 1
      })
    }

    // Mirror DSH 0.2.2 reconciliation. Historical parentId is not a sorting rule.
    function manualOrder(ids, saved, summaries, rowState) {
      const members = new Set(ids), included = new Set(), ordered = []
      for (const id of saved ?? []) if (members.has(id) && !included.has(id)) { ordered.push(id); included.add(id) }
      const archived = new Set(rowState.archivedSessionIds), pins = []
      for (const id of rowState.pinnedSessionIds) if (members.has(id) && !included.has(id) && !archived.has(id) && summaries[id]) { pins.push(id); included.add(id) }
      const ordinary = [], archives = []
      for (const id of recentOrder(ids.filter(id => !included.has(id)), summaries)) (archived.has(id) ? archives : ordinary).push(id)
      return [...pins, ...ordered, ...ordinary, ...archives]
    }

    function accountOrders(workspaces, list, view) {
      const accounted = new Set(workspaces.items.flatMap(w => w.sessionIds))
      const members = Object.fromEntries(workspaces.items.map(w => [w.workspaceId, w.sessionIds]))
      members[''] = list.ids.filter(id => list.byId[id] && !accounted.has(id))
      members['__flat_session_order__'] = list.ids.filter(id => list.byId[id] && list.byId[id].origin !== 'subagent')
      const current = Object.values(list.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)
      const blank = current?.blank ? current.id : undefined
      return Object.fromEntries(Object.entries(members).map(([key, ids]) => {
        const base = view.orderBy === 'updated' ? recentOrder(ids, list.byId) : manualOrder(ids, view.sessionOrderByAccount[key], list.byId, workspaces)
        return [key, blank && ids.includes(blank) ? [blank, ...base.filter(id => id !== blank)] : base]
      }))
    }

    function ownPartition(context, workspaceId, sessionId) {
      return (context.orders[workspaceId] ?? []).filter(id => id !== sessionId && context.pins.has(id) === context.pins.has(sessionId) && !context.archived.has(id) && !context.list.byId[id]?.blank && context.list.byId[id]?.origin !== 'subagent')
    }

    /** Resolve exact effective position, even when hovering the opposite pin partition. */
    function dropTarget(element, clientY, sessionId, context) {
      const loose = element?.closest?.('[' + LOOSE_TARGET + ']')
      if (loose?.hasAttribute?.(LOOSE_TARGET)) {
        const before = ownPartition(context, '', sessionId)[0]
        return { id: '', row: loose, before, lineRow: null, position: before ? { anchorSessionId: before, edge: 'before' } : { edge: 'end' } }
      }
      const row = element?.closest?.('[data-row-key]')
      if (!row) return null
      const rows = treeRows(row)
      if (!rows) return null
      const index = rows.findIndex(entry => entry.row === row)
      if (index < 0) return null
      const key = rows[index].key
      if (key.startsWith('overflow:')) return null // Expand the native list before choosing hidden positions.
      const workspace = key.startsWith('workspace:') ? { id: key.slice(10), row } : workspaceAt(rows, index)
      if (!workspace || !context.orders[workspace.id] || (!key.startsWith('workspace:') && !key.startsWith('session:') && !key.startsWith('overflow:'))) return null
      const partition = ownPartition(context, workspace.id, sessionId)
      const hovered = key.startsWith('session:') ? key.slice(8) : undefined
      let before = partition[0]
      // A folded group shows no members, so no line can be drawn: highlight the
      // folder alone and place the conversation first in its own partition.
      if (key.startsWith('workspace:') && row.getAttribute('aria-expanded') === 'false') {
        return { ...workspace, before, lineRow: null, lineEdge: 'after', position: before ? { anchorSessionId: before, edge: 'before' } : { edge: 'end' } }
      }
      if (hovered && partition.includes(hovered)) {
        const rect = row.getBoundingClientRect()
        before = clientY < rect.top + rect.height / 2 ? hovered : partition[partition.indexOf(hovered) + 1]
      }
      const workspaceIndex = rows.findIndex(entry => entry.row === workspace.row)
      if (workspaceIndex < 0) return null
      const memberRows = rows.slice(workspaceIndex + 1)
      const untilNextGroup = []
      for (const entry of memberRows) { if (entry.key.startsWith('workspace:')) break; if (entry.key.startsWith('session:')) untilNextGroup.push(entry) }
      // A hidden successor directly after the hovered visible row is an exact visible boundary.
      // A wholly hidden partition has no truthful line until the user expands it.
      if (before && !untilNextGroup.some(entry => entry.key === 'session:' + before) && !(hovered && partition.includes(hovered))) return null
      let lineRow = before ? untilNextGroup.find(entry => entry.key === 'session:' + before)?.row : undefined
      let lineEdge = 'before'
      if (!lineRow) {
        const visibleOwn = untilNextGroup.filter(entry => partition.includes(entry.key.slice(8)))
        if (visibleOwn.length) { lineRow = visibleOwn[visibleOwn.length - 1].row; lineEdge = 'after' }
        else {
          const placeholders = untilNextGroup.filter(entry => context.list.byId[entry.key.slice(8)]?.blank)
          const pins = untilNextGroup.filter(entry => context.pins.has(entry.key.slice(8)))
          lineRow = !context.pins.has(sessionId) && pins.length ? pins[pins.length - 1].row : placeholders[placeholders.length - 1]?.row ?? workspace.row
          lineEdge = 'after'
        }
      }
      return { ...workspace, before, lineRow, lineEdge, position: before ? { anchorSessionId: before, edge: 'before' } : { edge: 'end' } }
    }

    function spliceBefore(order, sessionId, before) {
      const result = order.filter(id => id !== sessionId)
      const index = before === undefined ? result.length : result.indexOf(before)
      if (index < 0) throw new Error('STALE_POSITION')
      result.splice(index, 0, sessionId)
      return result
    }

    function restoreLocalBefore(order, sessionId, saved) {
      const ids = order.filter(id => id !== sessionId), index = saved.indexOf(sessionId)
      const next = saved.slice(index + 1).find(id => ids.includes(id))
      if (next) return next
      const previous = saved.slice(0, index).reverse().find(id => ids.includes(id))
      return previous ? ids[ids.indexOf(previous) + 1] : ids[Math.min(Math.max(index, 0), ids.length)]
    }

    function orderSignature(orders, exclude) {
      return JSON.stringify(Object.keys(orders).sort().map(key => [key, orders[key].filter(id => id !== exclude)]))
    }

    // Wait for the actual workspace stream, not a guessed timer or DOM row count.
    function waitForMembership(sessionId, targetKey) {
      const source = clientContext.get('workspaces')?.list
      if (!source?.subscribe) return Promise.reject(new Error('ORDER_UNAVAILABLE'))
      return new Promise((resolve, reject) => {
        let stop, timer, done = false
        const finish = error => {
          if (done) return
          done = true; if (timer) window.clearTimeout(timer); stop?.()
          error ? reject(error) : resolve()
        }
        const check = () => {
          const snapshot = source.getSnapshot()
          if (snapshot.phase === 'ready' && ownerKey(snapshot, sessionId) === targetKey) finish()
        }
        stop = source.subscribe(check)
        timer = window.setTimeout(() => finish(new Error('Workspace membership did not settle')), 8000)
        check()
      })
    }

    function applyLocalPlacement(context, sessionId, sourceId, targetId, before) {
      const orders = { ...context.orders }
      orders[sourceId] = (orders[sourceId] ?? []).filter(id => id !== sessionId)
      const next = spliceBefore(orders[targetId] ?? [], sessionId, before)
      context.store.actions.setSessionOrder(targetId, next, orders)
      return context.store.getSnapshot()
    }

    // Wait for both catalogues; the fork reply can precede workspace membership.
    function waitForForkContext(ctx, sourceId, childId, signal) {
      return new Promise((resolve, reject) => {
        let done = false
        const stops = []
        const finish = (error, context) => {
          if (done) return
          done = true
          window.clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          for (const stop of stops) stop()
          error ? reject(error) : resolve(context)
        }
        const abort = () => finish(new Error('FORK_ORDER_CANCELLED'))
        const check = () => {
          if (done) return
          try {
            const context = nativeOrderContext()
            const source = context.list.byId[sourceId], child = context.list.byId[childId]
            if (!source || !child) return
            if (ownerKey(context.workspaces, sourceId) !== ownerKey(context.workspaces, childId)) return
            finish(null, context)
          } catch (error) {
            if (error?.message !== 'ORDER_UNAVAILABLE') finish(error)
          }
        }
        const schedule = () => queueMicrotask(check)
        const timer = window.setTimeout(() => finish(new Error('Fork sidebar state did not settle')), 8000)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) { abort(); return }
        try {
          for (const source of [ctx.get('sessions').list, ctx.get('workspaces').list]) stops.push(source.subscribe(schedule))
          stops.push(ctx.slots.subscribe('sidebar.workspaces', schedule))
          check()
        } catch (error) { finish(error) }
      })
    }

    function placeFork(context, sourceId, childId) {
      const account = ownerKey(context.workspaces, sourceId)
      const orders = { ...context.orders }
      for (const key of [account, '__flat_session_order__']) {
        // A hidden/archived source has no visible neighboring row. Start the
        // child's own partition instead; never unarchive or move the source.
        const source = context.list.byId[sourceId]
        const before = context.archived.has(sourceId) || source.origin === 'subagent'
          || context.pins.has(sourceId) !== context.pins.has(childId)
          ? ownPartition(context, key, childId)[0] : sourceId
        orders[key] = spliceBefore(orders[key], childId, before)
      }
      context.store.actions.setSessionOrder(account, orders[account], orders)
    }

    // All native UI fork entry points share Sessions.fork. Use its confirmed
    // onCreated pair, not parentSession (absent on ordinary forks since 0.2.2).
    function installForkPlacement(ctx) {
      const api = ctx.get('sessions')
      const concrete = api?.[Symbol.for('cordis.original')] ?? api
      if (typeof concrete?.fork !== 'function') throw new Error('Session fork adapter unavailable')
      const original = concrete.fork
      const descriptor = Object.getOwnPropertyDescriptor(concrete, 'fork')
      const pending = new Set()
      let stopped = false
      async function position(sourceId, childId) {
        if (stopped || sourceId === childId) return
        const controller = new AbortController()
        pending.add(controller)
        try {
          await waitForForkContext(ctx, sourceId, childId, controller.signal)
          if (stopped) return
          // Rebase after the await: another fork or user reorder may have
          // changed the saved positions while the catalogues were settling.
          const context = nativeOrderContext()
          if (context.list.byId[childId].origin === 'subagent') return
          if (ownerKey(context.workspaces, sourceId) !== ownerKey(context.workspaces, childId)) throw new Error('Fork workspace changed')
          placeFork(context, sourceId, childId)
        } catch (error) {
          if (!stopped) {
            console.warn('session-mover fork order', error)
            for (const notify of forkOrderFailures) notify()
          }
        } finally { pending.delete(controller) }
      }
      const wrapped = async function (options) {
        if (stopped) return original.call(this, options)
        let placement
        try {
          return await original.call(this, { ...options, onCreated: childId => {
            placement = position(options.sessionId, childId)
            options.onCreated?.(childId)
          } })
        } finally {
          // A rename can fail after creation. Still position the created child,
          // while preserving the native error and caller's onCreated callback.
          await placement
        }
      }
      concrete.fork = wrapped
      return () => {
        stopped = true
        for (const controller of pending) controller.abort()
        if (concrete.fork !== wrapped) return
        if (descriptor) Object.defineProperty(concrete, 'fork', descriptor)
        else delete concrete.fork
      }
    }

    /** Sidebar title of a Workspace row, for the notice text. */
    function rowTitle(row) {
      return (row?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    }

    const CSS = `
      .dsm-ungrouped-target { box-sizing: border-box; min-height: 32px; display: flex; align-items: center; margin: 6px 4px; padding: 6px 12px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 14px; }
      .dsm-workspace-drop { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover) !important; }
      .dsm-insertion-line { pointer-events: none; position: fixed; z-index: 75; height: 2px; border-radius: 2px; background: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px var(--dsw-alias-bg-overlay); }
      .dsm-insertion-line::before { content: ''; position: absolute; width: 6px; height: 6px; border: 2px solid var(--dsw-alias-brand-primary); border-radius: 50%; background: var(--dsw-alias-bg-overlay); left: -2px; top: -4px; }
      .dsm-notice { pointer-events: auto; position: fixed; left: 50%; bottom: 28px; z-index: 70; display: flex; align-items: center; gap: 12px; max-width: min(520px, 82vw); padding: 10px 12px 10px 16px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: var(--dsw-shadow-lv2); font-family: var(--dsw-font-family), system-ui, sans-serif; font-size: 13px; line-height: 20px; transform: translateX(-50%); }
      .dsm-notice[data-kind='error'] { border-color: var(--dsw-alias-state-danger-primary); }
      .dsm-notice-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .dsm-notice-action { flex: none; height: 26px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: var(--dsw-alias-brand-primary); font-family: inherit; font-size: 12px; cursor: pointer; }
      .dsm-notice-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .dsm-notice-action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      @media (prefers-reduced-motion: no-preference) {
        .dsm-notice { animation: dsm-in 140ms ease-out; }
        @keyframes dsm-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
      }
    `

    /**
     * Drag layer: watches the sidebar tree, accepts a cross-Workspace drop, and
     * shows one notice with an undo.
     * @param props - slot props plus the locale `t`.
     */
    function Mover({ t }) {
      const label = React.useMemo(() => translator(t), [t])
      const [notice, setNotice] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [insertion, setInsertion] = React.useState(null)
      const drag = React.useRef(null)
      const highlighted = React.useRef(null)
      const busyRef = React.useRef(false)

      React.useEffect(() => {
        const notify = () => setNotice({ kind: 'error', text: label('forkOrderFailed') })
        forkOrderFailures.add(notify)
        return () => forkOrderFailures.delete(notify)
      }, [label])

      /** Drop the highlight on whatever Workspace row carried it. */
      const clearHighlight = React.useCallback(() => {
        highlighted.current?.classList.remove(DROP_CLASS)
        highlighted.current = null
        setInsertion(null)
      }, [])

      /** Drag and undo await the same Host transaction and its actual outcome. Ids are sidebar group keys. */
      const relocate = React.useCallback(async (sessionId, workspaceId, title, sourceId, options = {}) => {
        if (busyRef.current) return
        busyRef.current = true
        setBusy(true)
        try {
          const context = nativeOrderContext()
          const saved = { orders: structuredClone(context.orders), mode: context.view.orderBy, sourceId, targetId: workspaceId, localApplied: false }
          const result = await post('relocate', { sessionId, workspaceId: wireId(workspaceId), ...(options.undoToken ? { undoToken: options.undoToken } : options.position ? { position: options.position } : {}) })
          if (result.ok && result.unchanged) return
          if (result.ok) {
            const sourceKey = groupKey(result.source.id), targetKey = groupKey(result.target.id)
            let orderError = false
            try {
              await waitForMembership(sessionId, targetKey)
              const fresh = nativeOrderContext()
              if (options.undoToken) {
                const original = options.localUndo
                if (original.localApplied) {
                  const before = restoreLocalBefore(fresh.orders[targetKey] ?? [], sessionId, original.orders[targetKey] ?? [])
                  const unchanged = fresh.view.orderBy === 'manual' && orderSignature(fresh.view.sessionOrderByAccount, sessionId) === original.afterSignature
                  applyLocalPlacement(fresh, sessionId, sourceKey, targetKey, before)
                  if (original.mode === 'updated' && unchanged) fresh.store.actions.setOrderBy('updated', {})
                }
              } else {
                let before = options.position?.edge === 'end' ? undefined : options.position?.anchorSessionId ?? ownPartition(fresh, targetKey, sessionId)[0]
                // A concurrent native pin/reorder must not change another item's order.
                if (before && !ownPartition(fresh, targetKey, sessionId).includes(before)) before = ownPartition(fresh, targetKey, sessionId)[0]
                const view = applyLocalPlacement(fresh, sessionId, sourceKey, targetKey, before)
                saved.localApplied = true
                saved.afterSignature = orderSignature(view.sessionOrderByAccount, sessionId)
              }
            } catch (error) { orderError = true; console.warn('session-mover display order', error) }
            try { await refreshMoved(sessionId) } catch (error) { console.warn('session-mover metadata refresh', error) }
            setNotice({
              kind: orderError ? 'error' : 'ok',
              text: orderError ? label('orderFailed') : options.undoToken ? label('undone') : label('moved').replace('{name}', title),
              undo: result.undoToken ? { sessionId, workspaceId: sourceKey, sourceId: targetKey, undoToken: result.undoToken, localUndo: saved } : null,
            })
          } else {
            let reason = result.error ?? ''
            if (result.code === 'AGENT_RUNNING') reason = label('running')
            else if (['SESSION_BUSY', 'MOVE_IN_PROGRESS'].includes(result.code)) reason = label('pending')
            else if (result.code === 'UNSUPPORTED') reason = label('unsupported')
            else if (result.code === 'NOT_READY') reason = label('notReady')
            if (result.restoreError) reason += ' — ' + label('restoreFailed')
            setNotice({ kind: 'error', text: label('failed').replace('{reason}', reason), undo: null })
          }
        } catch (error) {
          const reason = error?.message === 'ORDER_UNAVAILABLE' ? label('orderUnavailable') : error?.message === 'STALE_POSITION' ? label('stalePosition') : String(error?.message ?? error)
          setNotice({ kind: 'error', text: label('failed').replace('{reason}', reason), undo: null })
        } finally {
          busyRef.current = false
          setBusy(false)
        }
      }, [label])

      React.useEffect(() => {
        let looseTarget = null
        const removeLooseTarget = () => { looseTarget?.remove(); looseTarget = null }
        const onDragStart = (event) => {
          removeLooseTarget()
          drag.current = null
          const row = event.target?.closest?.('[data-row-key]')
          const key = row?.getAttribute('data-row-key') ?? ''
          if (!key.startsWith('session:')) return
          if (busyRef.current) return
          try {
            const context = nativeOrderContext()
            const sessionId = key.slice(8)
            const summary = context.list.byId[sessionId]
            // Rows in 最近 sit outside the tree; membership decides the source for both.
            if (!summary || summary.blank || summary.origin === 'subagent' || context.archived.has(sessionId)) return
            drag.current = { sessionId, source: ownerKey(context.workspaces, sessionId) }
            if (drag.current.source !== '') looseTarget = mountUngroupedTarget(label('ungrouped'))
          } catch { drag.current = null }
        }

        const onDragOver = (event) => {
          const current = drag.current
          if (!current) return
          let target
          try { target = dropTarget(event.target, event.clientY, current.sessionId, nativeOrderContext()) } catch { clearHighlight(); return }
          if (!target || target.id === current.source) {
            clearHighlight()
            return
          }
          if (highlighted.current !== target.row) {
            clearHighlight()
            highlighted.current = target.row
            target.row.classList.add(DROP_CLASS)
          }
          let nextInsertion = null
          if (target.lineRow) {
            const rect = target.lineRow.getBoundingClientRect()
            const tree = target.row.closest('[role=tree]')
            let viewportTop = 0, viewportBottom = window.innerHeight
            for (let parent = tree; parent; parent = parent.parentElement) {
              if (/auto|scroll|hidden|clip/.test(window.getComputedStyle(parent).overflowY)) { const bounds = parent.getBoundingClientRect(); viewportTop = Math.max(viewportTop, bounds.top); viewportBottom = Math.min(viewportBottom, bounds.bottom) }
            }
            const y = target.lineEdge === 'before' ? rect.top : rect.bottom
            if (y >= viewportTop && y <= viewportBottom) nextInsertion = { left: rect.left + 12, top: y - 1, width: Math.max(0, rect.width - 24) }
          }
          setInsertion(previous => JSON.stringify(previous) === JSON.stringify(nextInsertion) ? previous : nextInsertion)
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          event.preventDefault()
          event.stopPropagation()
        }

        const onDrop = (event) => {
          const current = drag.current
          drag.current = null
          clearHighlight()
          if (!current) { removeLooseTarget(); return }
          let target
          try { target = dropTarget(event.target, event.clientY, current.sessionId, nativeOrderContext()) } catch { removeLooseTarget(); return }
          removeLooseTarget()
          if (!target || target.id === current.source) return
          event.preventDefault()
          event.stopPropagation()
          void relocate(current.sessionId, target.id, target.id === '' ? label('ungrouped') : rowTitle(target.row), current.source, { position: target.position })
        }

        const onDragEnd = () => {
          drag.current = null
          clearHighlight()
          removeLooseTarget()
        }

        document.addEventListener('dragstart', onDragStart, true)
        document.addEventListener('dragover', onDragOver, true)
        document.addEventListener('drop', onDrop, true)
        document.addEventListener('dragend', onDragEnd, true)
        document.addEventListener('scroll', clearHighlight, true)
        return () => {
          document.removeEventListener('dragstart', onDragStart, true)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('drop', onDrop, true)
          document.removeEventListener('dragend', onDragEnd, true)
          document.removeEventListener('scroll', clearHighlight, true)
          clearHighlight()
          removeLooseTarget()
        }
      }, [clearHighlight, relocate, label])

      React.useEffect(() => {
        if (!notice || busy) return undefined
        const timer = window.setTimeout(() => { setNotice(null) }, notice.undo ? 10000 : 6000)
        return () => { window.clearTimeout(timer) }
      }, [notice, busy])

      if (!notice && !busy) return insertion ? h('div', { className: 'dsm-insertion-line', style: insertion, 'aria-hidden': true }) : null

      return h(React.Fragment, null,
        insertion ? h('div', { className: 'dsm-insertion-line', style: insertion, 'aria-hidden': true }) : null,
        h(
        'div',
        {
          className: 'dsm-notice',
          'data-plugin': 'dsh-asuta-session-mover',
          'data-kind': notice?.kind ?? 'ok',
          role: 'status',
          'aria-live': 'polite',
        },
        h('span', { className: 'dsm-notice-text' }, busy ? label('busy') : notice.text),
        notice?.undo && !busy
          ? h('button', {
            type: 'button',
            className: 'dsm-notice-action',
            onClick: () => {
              const action = notice.undo
              void relocate(action.sessionId, action.workspaceId, '', action.sourceId, { undoToken: action.undoToken, localUndo: action.localUndo })
            },
          }, label('undo'))
          : null,
      ))
    }

    /** Diagnostic seat: reports the sidebar grouping whenever it changes. */
    function Observer() {
      const last = React.useRef('')
      React.useEffect(() => {
        const tick = () => {
          const tree = document.querySelector('[data-slot="sidebar.workspaces"] [role="tree"]')
          if (!tree) return
          const rows = []
          let group = null
          for (const el of Array.from(tree.querySelectorAll('[data-row-key]'))) {
            const key = el.getAttribute('data-row-key') ?? ''
            const text = (el.textContent ?? '').trim().slice(0, 40)
            if (key.startsWith('workspace:')) {
              group = key.slice('workspace:'.length)
              rows.push({ kind: 'workspace', id: group, title: text.slice(0, 30) })
            } else if (key.startsWith('session:')) {
              rows.push({ kind: 'session', id: key.slice('session:'.length), group, title: text.slice(0, 24) })
            } else if (key.startsWith('overflow:')) {
              rows.push({ kind: 'overflow', id: key.slice('overflow:'.length), group, title: text })
            }
          }
          const signature = JSON.stringify(rows.map((row) => [row.kind, row.id, row.group, row.title]))
          if (signature === last.current && last.ready) return
          last.current = signature
          let ordering
          try { const native = nativeOrderContext(); ordering = { ready: true, orderBy: native.view.orderBy, completeCounts: Object.fromEntries(Object.entries(native.orders).map(([key, ids]) => [key, ids.length])) } } catch { ordering = { ready: false } }
          last.ready = ordering.ready
          post('probe', { at: new Date().toISOString(), version: '0.4.4', ordering, rows }).catch(() => { last.current = '' })
        }
        tick()
        const timer = window.setInterval(tick, 2000)
        return () => { window.clearInterval(timer) }
      }, [])
      return null
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        clientContext = ctx
        ctx.effect(() => {
          const fiber = ctx.inject(['sessions', 'workspaces', 'uiWorkspace'], child => {
            child.effect(() => installForkPlacement(child), 'session-mover: position new conversation forks')
          })
          return () => fiber.dispose()
        }, 'session-mover: fork placement')
        ctx.effect(() => {
          const fiber = ctx.inject(['sessions'], child => {
          const api = child.get('sessions')
          const concrete = api?.[Symbol.for('cordis.original')] ?? api
          const manager = concrete?.manager
          if (!manager || typeof concrete.handleSessionAdded !== 'function') return
          const original = concrete.handleSessionAdded
          const descriptor = Object.getOwnPropertyDescriptor(concrete, 'handleSessionAdded')
          const wrapped = function (summary) {
            const previous = manager.summaries.find(row => row.sessionId === summary.sessionId)
            const changed = previous?.cwd && summary.cwd && previous.cwd !== summary.cwd
            const result = original.call(this, summary)
            if (changed) void refreshMoved(summary.sessionId).catch(error => console.warn('session-mover refresh', error))
            return result
          }
          concrete.handleSessionAdded = wrapped
          child.effect(() => () => {
            if (concrete.handleSessionAdded !== wrapped) return
            if (descriptor) Object.defineProperty(concrete, 'handleSessionAdded', descriptor)
            else delete concrete.handleSessionAdded
          }, 'session-mover: restore session metadata listener')
          })
          return () => fiber.dispose()
        }, 'session-mover: preserve client session and refresh moved metadata')
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-mover: locale')

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-asuta-session-mover'
          tag.dataset.pluginCss = 'dsh-asuta-session-mover/session-mover.css'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => { tag.remove() }
        }, 'session-mover: styles')

        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-mover.mover',
          locale: NS,
          order: 63,
        }, Mover)), 'session-mover: drag layer')

        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-mover.observer',
          locale: NS,
          order: 64,
        }, Observer)), 'session-mover: observer')
      },
    }
  },
})
