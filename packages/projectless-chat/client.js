window.__ModuleLoader__.load({
  id: 'dsh-asuta-projectless-chat',
  factory(require) {
    const React = require('react'), h = React.createElement
    const { createPortal } = require('react-dom')
    const NS = 'projectlessChat'
    const zh = { create: '新建独立对话', creating: '正在创建独立对话…', ungrouped: '未分组', title: '独立对话默认目录', help: '不属于任何工作区的新对话，会在此目录下按日期创建独立文件夹。仅影响以后新建的对话；聊天记录仍由 DSH 管理。', save: '保存', reset: '恢复默认', browse: '选择文件夹', reload: '重新读取', saved: '已保存；新建对话将使用此目录。', cancel: '取消', choose: '使用此文件夹', loading: '正在加载…', close: '关闭', error: '操作失败：', empty: '此目录下没有子文件夹。', truncated: '目录较多，仅显示部分结果；可直接输入完整路径。', retry: '重试打开' }
    const en = { create: 'New independent conversation', creating: 'Creating conversation…', ungrouped: 'Ungrouped', title: 'Default independent conversation folder', help: 'New conversations outside workspaces receive separate dated folders here. Changes apply only to new conversations. DSH continues to manage chat history.', save: 'Save', reset: 'Restore default', browse: 'Choose folder', reload: 'Reload', saved: 'Saved. New conversations will use this folder.', cancel: 'Cancel', choose: 'Use this folder', loading: 'Loading…', close: 'Close', error: 'Operation failed: ', empty: 'No subfolders.', truncated: 'Some folders are omitted. Enter the full path directly if needed.', retry: 'Open again' }
    async function request(body, signal) {
      const response = await fetch('/projectless-chat/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-projectless-chat': '1' }, body: JSON.stringify(body), signal })
      const result = await response.json()
      if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'Request failed'), { code: result.code })
      return result
    }
    const CSS = [
      '.pc-new{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity 120ms ease;-webkit-app-region:no-drag}',
      '[data-pc-header]:hover .pc-new,[data-pc-header]:focus-within .pc-new,.pc-new:focus-visible,.pc-new:disabled{opacity:1}',
      '.pc-new:hover,.pc-button:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pc-new:focus-visible,.pc-button:focus-visible,.pc-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.pc-new:disabled,.pc-button:disabled{opacity:.5;cursor:default}',
      '.pc-setting{padding:18px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.pc-title{font-size:14px;line-height:20px}.pc-help{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin:5px 0 12px}',
      '.pc-input{box-sizing:border-box;width:100%;min-width:0;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.pc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pc-button{padding:7px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}',
      '.pc-error{color:var(--dsw-alias-state-error-primary);font-size:13px;overflow-wrap:anywhere}.pc-success{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pc-overlay{position:fixed;inset:0;z-index:10020;background:#0007;display:flex;align-items:center;justify-content:center;-webkit-app-region:no-drag}',
      '.pc-dialog{box-sizing:border-box;width:min(620px,calc(100vw - 40px));max-height:80vh;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-specific-sidebar-fill,#202020);color:var(--dsw-alias-label-primary);padding:22px;box-shadow:0 16px 60px #0006}',
      '.pc-dialog h3{font-size:16px;margin:0 0 16px}.pc-folders{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-top:12px}.pc-folders button{text-align:left}.pc-crumbs{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}',
      '.pc-failure{position:fixed;bottom:28px;left:28px;z-index:10030;max-width:480px;padding:14px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-specific-sidebar-fill,#202020);box-shadow:0 8px 30px #0005}',
      '@media(hover:none){.pc-new{opacity:1}}@media(prefers-reduced-motion:reduce){.pc-new{transition:none}}'
    ].join(String.fromCharCode(10))

    function FolderPicker({ t, onChoose, onClose }) {
      const [listing, setListing] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
      const sequence = React.useRef(0), dialog = React.useRef(null)
      async function load(path) {
        const current = ++sequence.current
        setBusy(true); setError('')
        try { const result = await request({ action: 'browse', path }); if (sequence.current === current) setListing(result) }
        catch (err) { if (sequence.current === current) setError(err.message) }
        finally { if (sequence.current === current) setBusy(false) }
      }
      React.useEffect(() => { void load(undefined); const focus = document.activeElement; dialog.current?.focus(); return () => { sequence.current++; focus?.focus?.() } }, [])
      function keys(event) {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
        if (event.key !== 'Tab') return
        const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')]
        if (!buttons.length) return
        const first = buttons[0], last = buttons.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
      return createPortal(h('div', { className: 'pc-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose() } },
        h('div', { role: 'dialog', 'aria-modal': true, 'aria-label': t('browse'), className: 'pc-dialog', ref: dialog, tabIndex: -1, onKeyDown: keys },
          h('h3', null, t('browse')), error ? h('p', { role: 'alert', className: 'pc-error' }, error) : null,
          listing ? h(React.Fragment, null, h('code', null, listing.path), h('div', { className: 'pc-crumbs' }, ...listing.crumbs.map(item => h('button', { key: item.path, type: 'button', className: 'pc-button', disabled: busy, onClick: () => load(item.path) }, item.name))),
            h('div', { className: 'pc-folders', 'aria-busy': busy }, ...listing.entries.map(item => h('button', { type: 'button', className: 'pc-button', key: item.path, disabled: busy, onClick: () => load(item.path) }, '📁 ' + item.name)), listing.entries.length ? null : h('p', { className: 'pc-help' }, t('empty'))),
            listing.truncated ? h('p', { className: 'pc-help' }, t('truncated')) : null) : error ? null : h('p', null, t('loading')),
          h('div', { className: 'pc-actions' }, h('button', { type: 'button', className: 'pc-button', disabled: busy || !listing, onClick: () => onChoose(listing.path) }, t('choose')), h('button', { type: 'button', className: 'pc-button', onClick: onClose }, t('cancel'))))), document.body)
    }
    function DirectorySetting({ ctx, t }) {
      const [state, setState] = React.useState(null), [value, setValue] = React.useState(''), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [picker, setPicker] = React.useState(false)
      const alive = React.useRef(true)
      async function load(signal) {
        setBusy(true); setError(''); setNotice('')
        try { const result = await request({ action: 'read' }, signal); if (alive.current) { setState(result); setValue(result.root) } }
        catch (err) { if (alive.current && err.name !== 'AbortError') setError(err.message) }
        finally { if (alive.current) setBusy(false) }
      }
      React.useEffect(() => { alive.current = true; const abort = new AbortController(); void load(abort.signal); return () => { alive.current = false; abort.abort() } }, [])
      async function save(root) {
        setBusy(true); setError(''); setNotice('')
        try { const result = await request({ action: 'save', root, revision: state.revision }); if (alive.current) { setState(result); setValue(result.root); setNotice(t('saved')) } }
        catch (err) { if (alive.current) setError(err.message) }
        finally { if (alive.current) setBusy(false) }
      }
      return h('section', { className: 'pc-setting', 'data-plugin': 'dsh-asuta-projectless-chat' },
        h('div', { className: 'pc-title' }, t('title')), h('p', { className: 'pc-help' }, t('help')),
        h('input', { className: 'pc-input', 'aria-label': t('title'), value, disabled: busy || !state, spellCheck: false, onChange: event => setValue(event.target.value) }),
        h('div', { className: 'pc-actions' },
          h('button', { type: 'button', className: 'pc-button', disabled: busy || !state, onClick: () => setPicker(true) }, t('browse')),
          h('button', { type: 'button', className: 'pc-button', disabled: busy || !state || value === state.root, onClick: () => save(value) }, t('save')),
          h('button', { type: 'button', className: 'pc-button', disabled: busy || !state || (state.isDefault && value === state.root), onClick: () => save(null) }, t('reset')),
          h('button', { type: 'button', className: 'pc-button', disabled: busy, onClick: () => load() }, t('reload'))),
        error ? h('p', { role: 'alert', className: 'pc-error' }, t('error') + error) : null, notice ? h('p', { role: 'status', className: 'pc-success' }, notice) : null,
        picker ? h(FolderPicker, { t, onClose: () => setPicker(false), onChoose: path => { setValue(path); setPicker(false) } }) : null)
    }

    // The native hero needs a workspace label before it enables its composer.
    // Give only an independent blank session a display-only workspace, so the
    // native hero and its agent-preset seat stay mounted and editable.
    function installIndependentComposer(ctx) {
      const host = ctx.slots.hostFace(), original = Symbol.for('cordis.original')
      {
        let patch = null, changing = false, stopped = false
        function restore() {
          if (patch && patch.entry.component === patch.wrapper) Object.defineProperty(patch.entry, 'component', patch.descriptor)
          patch = null
        }
        function reconcile() {
          if (stopped || changing) return
          changing = true
          try {
            const candidate = host.factoryOf('conversation.content')
            const entry = candidate?.[original] ?? candidate
            if (patch?.entry === entry && entry.component === patch.wrapper) return
            restore()
            if (!entry || typeof entry.component !== 'function') return
            const descriptor = Object.getOwnPropertyDescriptor(entry, 'component')
            if (!descriptor || (!descriptor.writable && !descriptor.configurable)) return
            const NativeContent = entry.component
            function IndependentContent(props) {
              const summary = props.useSessions(state => props.sessionId === undefined ? undefined : state.byId[props.sessionId])
              const workspaces = props.useWorkspaces(state => state)
              const independent = summary?.cwd && workspaces.phase === 'ready' && !workspaces.items.some(workspace => workspace.sessionIds.includes(props.sessionId))
              const displayWorkspaces = React.useMemo(() => independent && props.hero ? {
                ...workspaces,
                items: [...workspaces.items, { workspaceId: 'projectless:' + props.sessionId, title: ctx.locale.bind(NS)('ungrouped'), sessionIds: [props.sessionId] }],
              } : null, [independent, props.hero, props.sessionId, workspaces])
              const useWorkspaces = selector => props.useWorkspaces(() => selector(displayWorkspaces ?? workspaces))
              return h(NativeContent, { ...props, useWorkspaces })
            }
            Object.defineProperty(entry, 'component', { ...descriptor, value: IndependentContent })
            patch = { entry, descriptor, wrapper: IndependentContent }
          } finally { changing = false }
        }
        const unsubscribe = host.subscribeFactory('conversation.content', reconcile)
        reconcile()
        return () => { stopped = true; unsubscribe(); restore() }
      }
    }

    function Launcher({ ctx, t, wide }) {
      const [anchor, setAnchor] = React.useState(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
      const pending = React.useRef(false), alive = React.useRef(true), created = React.useRef(null)
      React.useEffect(() => {
        alive.current = true
        let previous = null, scheduled = false, stopped = false
        const sync = () => {
          scheduled = false
          if (stopped) return
          const section = document.querySelector('[data-slot="sidebar.recent.section"]')
          const header = section?.firstElementChild
          if (previous !== header) { previous?.removeAttribute('data-pc-header'); header?.setAttribute('data-pc-header', ''); previous = header; setAnchor(header || null) }
        }
        const observer = new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(sync) } })
        observer.observe(document.body, { childList: true, subtree: true })
        sync()
        return () => { stopped = true; alive.current = false; observer.disconnect(); previous?.removeAttribute('data-pc-header') }
      }, [])
      async function create() {
        if (pending.current) return
        pending.current = true; setBusy(true); setError('')
        try {
          if (!created.current) {
            const { cwd } = await request({ action: 'allocate' })
            created.current = await ctx.sessions.create({ cwd })
          }
          ctx.uiWorkspace.openSession(created.current)
          created.current = null
        } catch (err) { if (alive.current) setError(err.message) }
        finally { pending.current = false; if (alive.current) setBusy(false) }
      }
      const button = h('button', { type: 'button', className: 'pc-new', 'data-projectless-new': '', 'aria-label': busy ? t('creating') : t('create'), title: t('create'), disabled: busy, onClick: create },
        h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M16 3l5 5M10 14l1-4 8-8 4 4-8 8-5 1Z' })))
      return h(React.Fragment, null, anchor ? createPortal(button, anchor) : wide ? h('button', { type: 'button', className: 'pc-button', disabled: busy, onClick: create }, busy ? t('creating') : t('create')) : null,
        error ? createPortal(h('div', { className: 'pc-failure', role: 'alert' }, h('p', { className: 'pc-error' }, t('error') + error), h('button', { type: 'button', className: 'pc-button', onClick: create }, t('retry')), h('button', { type: 'button', className: 'pc-button', onClick: () => setError('') }, t('close'))), document.body) : null)
    }
    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => installIndependentComposer(ctx), 'projectless-chat: native independent composer')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'projectless-chat: translations')
        ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.plugin = 'dsh-asuta-projectless-chat'; tag.dataset.pluginCss = NS; tag.textContent = CSS; document.head.appendChild(tag); return () => tag.remove() }, 'projectless-chat: styles')
        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'projectless-chat.create', order: 31, locale: NS }, props => h(Launcher, { ...props, ctx }))), 'projectless-chat: recent launcher')
        ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name: 'settings.general.item', id: 'projectless-chat.directory', order: 80, locale: NS }, props => h(DirectorySetting, { ...props, ctx }))), 'projectless-chat: directory preference')
      },
    }
  },
})
