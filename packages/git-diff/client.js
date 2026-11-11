window.__ModuleLoader__.load({
  id: 'dsh-asuta-git-diff',
  factory(require) {
    const React = require('react'), h = React.createElement
    const TAB_ID = 'dsh-asuta-git-diff/panel', KIND = 'git-diff'
    const SCOPES = [['uncommitted', '未提交'], ['unstaged', '未暂存'], ['staged', '已暂存'], ['branch', '分支']]
    const CSS = [
      '.gd-panel{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font:13px/1.5 var(--dsw-font-family),system-ui,sans-serif}',
      '.gd-header{padding:14px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gd-header strong{flex:1}.gd-scroll{overflow:auto;min-height:0;flex:1;padding:12px 14px}',
      '.gd-panel button,.gd-panel select{color:inherit;font:inherit;cursor:pointer}.gd-panel button:focus-visible,.gd-panel select:focus-visible,.gd-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.gd-tabs{display:flex;gap:5px;flex-wrap:wrap}.gd-tabs button,.gd-refresh,.gd-file,.gd-trigger{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;padding:5px 8px}.gd-tabs button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-state-business-primary)}',
      '.gd-select{max-width:100%;min-width:0;padding:6px;border-radius:7px;background:var(--dsw-specific-sidebar-fill,transparent);border:1px solid var(--dsw-alias-border-l2)}.gd-muted{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.gd-error{color:#e88e82;overflow-wrap:anywhere}',
      '.gd-file{width:100%;display:flex;gap:8px;align-items:center;text-align:left;margin-top:6px}.gd-file span:first-child{flex:1;min-width:0;overflow-wrap:anywhere}.gd-add{color:#75c788}.gd-del{color:#df8a80}',
      '.gd-patch{white-space:pre;overflow:auto;font:12px/1.5 ui-monospace,Consolas,monospace;margin:0 0 10px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-top:0;border-radius:0 0 7px 7px}.gd-line{display:block;min-height:18px}.gd-line[data-kind=add]{background:#2f7a3230}.gd-line[data-kind=remove]{background:#aa353530}',
      '.gd-toolbar{display:inline-flex;align-items:center;gap:6px;flex:none;align-self:flex-start;margin:-6px 16px 0 auto;-webkit-app-region:no-drag}.gd-toolbar-fallback{align-self:auto;margin:0}header:has([data-conversation-tabs]) .gd-toolbar-fallback{display:none}.gd-toolbar-actions{display:inline-flex;align-items:center}.gd-toolbar-actions:empty{display:none}.gd-trigger{display:inline-flex;align-items:center;gap:5px;flex:none;margin:0;color:var(--dsw-alias-label-secondary);-webkit-app-region:no-drag}.gd-trigger:hover,.gd-file:hover,.gd-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    ].join('\n')
    async function call(action, body, signal) {
      const response = await fetch('/git-diff/api/' + action, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '读取 Git 差异失败。')
      return result.value
    }
    function useSnapshot(store) { return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot) }
    function Patch({ patch }) {
      return h('pre', { className: 'gd-patch' }, patch.split('\n').map((line, index) => h('span', {
        className: 'gd-line', key: index,
        'data-kind': line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'remove' : undefined,
      }, line)))
    }
    function Panel({ ctx }) {
      const sessionId = useSnapshot(ctx.sidebarRight.mounted)
      const [scope, setScope] = React.useState('uncommitted'), [ref, setRef] = React.useState('')
      const [catalog, setCatalog] = React.useState(null), [result, setResult] = React.useState(null)
      const [error, setError] = React.useState(''), [loading, setLoading] = React.useState(false)
      const [revision, refresh] = React.useReducer(value => value + 1, 0)
      const [expanded, setExpanded] = React.useState('')
      const previousSession = React.useRef(null)
      React.useEffect(() => {
        if (previousSession.current !== sessionId) {
          previousSession.current = sessionId
          setRef(''); setScope('uncommitted')
        }
        setCatalog(null); setResult(null); setError(''); setExpanded('')
        if (!sessionId) return
        const controller = new AbortController()
        call('catalog', { sessionId }, controller.signal).then(value => {
          setCatalog(value)
          setRef(previous => previous && value.branches.includes(previous) ? previous : value.upstream && value.branches.includes(value.upstream) ? value.upstream : value.branches[0] || '')
        }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
        return () => controller.abort()
      }, [sessionId, revision])
      React.useEffect(() => {
        setResult(null); setExpanded('')
        if (!sessionId || !catalog || (scope === 'branch' && !ref)) return
        const controller = new AbortController()
        setLoading(true); setError('')
        call('inspect', { sessionId, scope, ref }, controller.signal).then(value => {
          setResult(value)
          if (scope === 'uncommitted') window.dispatchEvent(new CustomEvent('git-diff:updated', { detail: { sessionId, value } }))
        }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
      }, [sessionId, catalog, scope, ref, revision])
      if (!sessionId) return h('div', { className: 'gd-panel gd-scroll' }, '请先打开有工作目录的对话。')
      return h('div', { className: 'gd-panel', 'data-plugin': 'dsh-asuta-git-diff' },
        h('div', { className: 'gd-header' }, h('strong', null, '变更'), h('button', { type: 'button', className: 'gd-refresh', onClick: () => refresh(), 'aria-label': '刷新差异' }, '刷新')),
        h('div', { className: 'gd-scroll' },
          h('div', { className: 'gd-muted' }, catalog?.root || '正在读取仓库…', catalog ? ' · ' + (catalog.branch || 'detached HEAD') : ''),
          h('div', { className: 'gd-tabs', role: 'group', 'aria-label': '比较范围' }, SCOPES.map(([id, title]) => h('button', { key: id, type: 'button', 'aria-pressed': scope === id, onClick: () => setScope(id) }, title))),
          scope === 'branch' && catalog ? h('label', null, h('div', { className: 'gd-muted' }, '与所选分支的共同祖先比较当前提交'), h('select', { className: 'gd-select', 'aria-label': '对比分支', value: ref, onChange: event => setRef(event.target.value) }, catalog.branches.map(branch => h('option', { key: branch, value: branch }, branch)))) : null,
          error ? h('p', { role: 'alert', className: 'gd-error' }, error) : null,
          loading ? h('p', { className: 'gd-muted' }, '正在读取差异…') : null,
          result ? h(React.Fragment, null,
            h('p', { className: 'gd-muted' }, result.files.length + ' 个文件 · ', h('span', { className: 'gd-add' }, '+' + result.additions), ' ', h('span', { className: 'gd-del' }, '-' + result.deletions)),
            result.files.length === 0 ? h('p', null, '此范围没有改动。') : result.files.map(file => h('div', { key: file.path },
              h('button', { type: 'button', className: 'gd-file', 'aria-expanded': expanded === file.path, onClick: () => setExpanded(expanded === file.path ? '' : file.path) },
                h('span', null, file.path, file.untracked ? ' · 未跟踪' : ''), h('span', { className: 'gd-add' }, '+' + file.additions), h('span', { className: 'gd-del' }, '-' + file.deletions)),
              expanded === file.path ? file.skipped ? h('p', { className: 'gd-muted' }, file.skipped) : h(Patch, { patch: file.patch || '无文本差异' }) : null,
            )),
          ) : null,
        ),
      )
    }
    function Trigger({ ctx }) {
      const sessionId = useSnapshot(ctx.sidebarRight.mounted)
      const [value, setValue] = React.useState(null)
      React.useEffect(() => {
        setValue(null)
        if (!sessionId) return
        const controller = new AbortController()
        const update = event => { if (event.detail?.sessionId === sessionId) setValue(event.detail.value) }
        window.addEventListener('git-diff:updated', update)
        call('summary', { sessionId }, controller.signal).then(setValue).catch(() => {})
        return () => { controller.abort(); window.removeEventListener('git-diff:updated', update) }
      }, [sessionId])
      if (!sessionId) return null
      return h('div', { className: 'gd-toolbar gd-toolbar-fallback' },
        h('button', { type: 'button', className: 'gd-trigger', title: '查看 Git 变更', 'aria-label': '查看 Git 变更', onClick: () => ctx.sidebarRight.openTabIn(sessionId, KIND) },
        '变更', value ? h(React.Fragment, null,
          h('span', { className: 'gd-add' }, '+' + value.additions),
          h('span', { className: 'gd-del' }, '-' + value.deletions),
        ) : null),
        h('div', { className: 'gd-toolbar-actions', 'data-git-diff-actions': sessionId }))
    }
    function installTabTrigger(ctx) {
      const mounts = new Map()
      let scheduled = false, disposed = false
      const selector = '[data-conversation-tabs]'
      let sessionId = ctx.sidebarRight.mounted.getSnapshot(), summary = null
      const renderSummary = button => {
        button.replaceChildren('变更')
        if (!summary) return
        for (const [className, value] of [['gd-add', summary.additions], ['gd-del', summary.deletions]]) {
          const count = document.createElement('span')
          count.className = className
          count.textContent = (className === 'gd-add' ? '+' : '-') + value
          button.appendChild(count)
        }
      }
      const updateSummary = value => {
        summary = value
        for (const button of mounts.values()) renderSummary(button)
      }
      const refreshSummary = () => {
        sessionId = ctx.sidebarRight.mounted.getSnapshot()
        for (const button of mounts.values()) button.nextElementSibling.dataset.gitDiffActions = sessionId || ''
        updateSummary(null)
        const target = sessionId
        if (target) call('summary', { sessionId: target }).then(value => {
          if (!disposed && sessionId === target) updateSummary(value)
        }).catch(() => {})
      }
      const onUpdated = event => {
        if (event.detail?.sessionId === sessionId) updateSummary(event.detail.value)
      }
      const scan = () => {
        scheduled = false
        if (disposed) return
        const rows = new Set([...document.querySelectorAll(selector)]
          .filter(tabs => !tabs.closest('[data-sidebar-right-session]'))
          .map(tabs => tabs.parentElement).filter(Boolean))
        for (const [row, button] of mounts) {
          if (rows.has(row) && button.parentElement?.parentElement === row) continue
          button.parentElement?.remove()
          mounts.delete(row)
        }
        for (const row of rows) {
          if (mounts.has(row)) continue
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'gd-trigger'
          button.dataset.gitDiffTrigger = ''
          renderSummary(button)
          button.title = '查看 Git 变更'
          button.setAttribute('aria-label', '查看 Git 变更')
          button.addEventListener('click', () => {
            const sessionId = ctx.sidebarRight.mounted.getSnapshot()
            if (sessionId) ctx.sidebarRight.openTabIn(sessionId, KIND)
          })
          const toolbar = document.createElement('div')
          toolbar.className = 'gd-toolbar'
          const actions = document.createElement('div')
          actions.className = 'gd-toolbar-actions'
          actions.dataset.gitDiffActions = sessionId || ''
          toolbar.append(button, actions)
          row.appendChild(toolbar)
          mounts.set(row, button)
        }
      }
      const schedule = () => {
        if (disposed || scheduled) return
        scheduled = true
        queueMicrotask(scan)
      }
      const containsTabs = node => node.nodeType === 1 &&
        (node.matches(selector) || node.querySelector(selector) !== null)
      const observer = new MutationObserver(records => {
        for (const record of records) {
          if (record.target.nodeType === 1 && record.target.querySelector(':scope > ' + selector)) { schedule(); return }
          if ([...record.addedNodes, ...record.removedNodes].some(containsTabs)) { schedule(); return }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      const unsubscribe = ctx.sidebarRight.mounted.subscribe(refreshSummary)
      window.addEventListener('git-diff:updated', onUpdated)
      refreshSummary()
      scan()
      return () => {
        disposed = true
        observer.disconnect()
        unsubscribe()
        window.removeEventListener('git-diff:updated', onUpdated)
        for (const button of mounts.values()) button.parentElement?.remove()
        mounts.clear()
      }
    }
    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'dsh-asuta-git-diff'; style.textContent = CSS; document.head.appendChild(style); return () => style.remove() }, 'git-diff: styles')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID, kind: KIND, patterns: ['sidebar://git-diff', 'sidebar://git-diff/**'], title: () => '变更',
          guide: [{ id: 'new', order: 42, title: () => '变更', description: () => '查看当前工作目录的 Git 差异' }],
        }), 'git-diff: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, props => h(Panel, { ...props, ctx }))), 'git-diff: panel')
        ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'git-diff.trigger', order: 24 }, props => h(Trigger, { ...props, ctx }))), 'git-diff: single-view trigger')
        ctx.effect(() => installTabTrigger(ctx), 'git-diff: tab-row trigger')
      },
    }
  },
})
