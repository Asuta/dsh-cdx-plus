window.__ModuleLoader__.load({
  id: 'dsh-asuta-projectless-chat',
  factory(require) {
    const React = require('react'), h = React.createElement
    const { createPortal } = require('react-dom')
    const { Button, Modal, Toast, IconArchiveOutlineRegular, IconNewChatOutlineRegular, IconShieldOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const NS = 'projectlessChat'
    const UNGROUPED = 'projectless:picker'
    const PickerContext = React.createContext(null)
    const zh = { create: '新建独立对话', creating: '正在创建独立对话…', ungrouped: '未分组', title: '独立对话默认目录', help: '不属于任何工作区的新对话，会在此目录下按日期创建独立文件夹。仅影响以后新建的对话；聊天记录仍由 DSH 管理。', save: '保存', reset: '恢复默认', browse: '选择文件夹', reload: '重新读取', saved: '已保存；新建对话将使用此目录。', cancel: '取消', choose: '使用此文件夹', loading: '正在加载…', close: '关闭', error: '操作失败：', empty: '此目录下没有子文件夹。', truncated: '目录较多，仅显示部分结果；可直接输入完整路径。', retry: '重试打开' }
    const en = { create: 'New independent conversation', creating: 'Creating conversation…', ungrouped: 'Ungrouped', title: 'Default independent conversation folder', help: 'New conversations outside workspaces receive separate dated folders here. Changes apply only to new conversations. DSH continues to manage chat history.', save: 'Save', reset: 'Restore default', browse: 'Choose folder', reload: 'Reload', saved: 'Saved. New conversations will use this folder.', cancel: 'Cancel', choose: 'Use this folder', loading: 'Loading…', close: 'Close', error: 'Operation failed: ', empty: 'No subfolders.', truncated: 'Some folders are omitted. Enter the full path directly if needed.', retry: 'Open again' }
    Object.assign(zh, {
      archiveAll: '归档所有对话', archiveConfirm: '确认归档', archiveTitle: '归档未分组对话',
      protectOn: '开启归档保护', protectOff: '取消归档保护', protected: '归档保护',
      archiveCount: '将归档 {count} 条未分组对话（包括折叠的条目）。',
      archiveSkipped: '保留：归档保护 {protected} 条、置顶 {pinned} 条、正在运行 {running} 条。',
      archiveRestricted: '另有 {count} 条无归档权限。',
      archiveEmpty: '没有可以批量归档的对话。', archiveHint: '归档后的对话可以恢复。',
      archiveRunning: '正在归档：{done} / {total}', archiveDone: '已归档 {archived} 条，跳过 {skipped} 条，失败 {failed} 条。',
      archiveUnknownOutcome: '服务器未返回可识别的归档结果。',
      archiveChanged: '操作期间跳过：归档保护 {protected} 条、正在运行 {running} 条、状态已变化 {changed} 条。',
      archiveNotReady: '对话列表尚未加载完成，请稍后再试。', protectError: '无法保存归档保护，请重试。',
    })
    Object.assign(en, {
      archiveAll: 'Archive all conversations', archiveConfirm: 'Confirm archive', archiveTitle: 'Archive ungrouped conversations',
      protectOn: 'Enable archive protection', protectOff: 'Remove archive protection', protected: 'Archive protection',
      archiveCount: 'Archive {count} ungrouped conversations, including collapsed entries.',
      archiveSkipped: 'Keep: {protected} protected, {pinned} pinned, {running} running.',
      archiveRestricted: 'Archive access is unavailable for {count} more.',
      archiveEmpty: 'No conversations are eligible for bulk archive.', archiveHint: 'Archived conversations can be restored.',
      archiveRunning: 'Archiving: {done} / {total}', archiveDone: 'Archived {archived}, skipped {skipped}, failed {failed}.',
      archiveUnknownOutcome: 'The server returned an unknown archive result.',
      archiveChanged: 'Skipped during the operation: {protected} protected, {running} running, {changed} changed.',
      archiveNotReady: 'The conversation list is still loading. Try again shortly.', protectError: 'Could not save archive protection. Please try again.',
    })
    async function request(body, signal) {
      const response = await fetch('/projectless-chat/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-projectless-chat': '1' }, body: JSON.stringify(body), signal })
      const result = await response.json()
      if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'Request failed'), { code: result.code })
      return result
    }
    const CSS = [
      '.pc-new{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity 120ms ease;-webkit-app-region:no-drag}',
      '[data-pc-header]:hover .pc-new,[data-pc-ungrouped]:hover .pc-new,.pc-new:focus-visible{opacity:1}',
      '.pc-ungrouped-actions{display:flex;align-items:center;flex:none;gap:2px;margin:-4px -4px -4px auto}',
      '.pc-new-ungrouped{width:24px;height:24px;border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-tertiary)}',
      '[data-row-key^="session:"]:has([data-pc-protection="on"]){box-shadow:inset 2px 0 var(--dsw-alias-state-business-primary,#568dea)}',
      '[data-row-key^="session:"]:has([data-pc-protection]) button[data-dnm-mute]{display:none}',
      '.pc-protect-action{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;margin:-4px;padding:0;border:0;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.pc-protect-action:hover{color:var(--dsw-alias-label-primary)}.pc-protect-action:focus-visible{outline-offset:-2px}',
      '.pc-protect-action[aria-pressed="true"]{color:var(--dsw-alias-state-business-primary,#568dea)}',
      '.pc-protect-action:disabled{opacity:.5;cursor:default}',
      '.pc-archive-detail{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin:0 0 8px}',
      '.pc-archive-errors{max-height:180px;overflow:auto;padding-inline-start:20px}',
      '.pc-archive-reason{margin:2px 0 8px;overflow-wrap:anywhere}',
      '.pc-new:hover,.pc-button:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pc-new-ungrouped:hover{background:transparent;color:var(--dsw-alias-label-primary)}',
      '.pc-new-ungrouped:focus-visible{outline-offset:-2px}',
      '.pc-new:focus-visible,.pc-button:focus-visible,.pc-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.pc-new:disabled{cursor:default}.pc-button:disabled,[data-pc-header]:hover .pc-new:disabled,[data-pc-ungrouped]:hover .pc-new:disabled{opacity:.5;cursor:default}',
      '.pc-setting{padding:18px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.pc-title{font-size:14px;line-height:20px}.pc-help{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin:5px 0 12px}',
      '.pc-input{box-sizing:border-box;width:100%;min-width:0;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.pc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pc-button{padding:7px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}',
      '.pc-error{color:var(--dsw-alias-state-error-primary);font-size:13px;overflow-wrap:anywhere}.pc-success{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pc-overlay{position:fixed;inset:0;z-index:10020;background:#0007;display:flex;align-items:center;justify-content:center;-webkit-app-region:no-drag}',
      '.pc-dialog{box-sizing:border-box;width:min(620px,calc(100vw - 40px));max-height:80vh;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-specific-sidebar-fill,#202020);color:var(--dsw-alias-label-primary);padding:22px;box-shadow:0 16px 60px #0006}',
      '.pc-dialog h3{font-size:16px;margin:0 0 16px}.pc-folders{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-top:12px}.pc-folders button{text-align:left}.pc-crumbs{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}',
      '.pc-failure{position:fixed;bottom:28px;left:28px;z-index:10030;max-width:480px;padding:14px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-specific-sidebar-fill,#202020);box-shadow:0 8px 30px #0005}',
      '@media(prefers-reduced-motion:reduce){.pc-new{transition:none}}'
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

    // Extend only the hero picker. The synthetic choice never enters the Host registry.
    function installIndependentPicker(ctx) {
      const original = Symbol.for('cordis.original')
      return ctx.slots.inject('conversation.hero.workspace', () => {
        let patch = null, changing = false
        const restore = () => {
          if (patch && patch.entry.component === patch.wrapper) Object.defineProperty(patch.entry, 'component', patch.descriptor)
          patch = null
        }
        const reconcile = () => {
          if (changing) return
          changing = true
          try {
            const candidate = ctx.slots.entriesOfSlot('conversation.hero.workspace')[0]
            const entry = candidate?.[original] ?? candidate
            if (patch?.entry === entry && entry.component === patch.wrapper) return
            restore()
            if (!entry || typeof entry.component !== 'function') return
            const descriptor = Object.getOwnPropertyDescriptor(entry, 'component')
            if (!descriptor || (!descriptor.writable && !descriptor.configurable)) return
            const NativePicker = entry.component
            function IndependentPicker(props) {
              const bridge = React.useContext(PickerContext)
              const snapshot = props.useWorkspaces(state => state)
              const items = React.useMemo(() => [...snapshot.items, { workspaceId: UNGROUPED, title: ctx.locale.bind(NS)('ungrouped'), path: '', sessionIds: [] }], [snapshot.items])
              const useWorkspaces = selector => props.useWorkspaces(state => selector({ ...state, items }))
              return h(NativePicker, !bridge ? props : { ...props, useWorkspaces,
                selectedId: bridge.independent ? UNGROUPED : props.selectedId,
                onPick: id => {
                  if (id !== UNGROUPED) { props.onPick(id); return }
                  props.onClose()
                  void bridge.choose()
                } })
            }
            Object.defineProperty(entry, 'component', { ...descriptor, value: IndependentPicker })
            patch = { entry, descriptor, wrapper: IndependentPicker }
          } finally { changing = false }
        }
        const unsubscribe = ctx.slots.subscribe('conversation.hero.workspace', reconcile)
        reconcile()
        return () => { unsubscribe(); restore() }
      })
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
              const [error, setError] = React.useState('')
              const pending = React.useRef(false), generation = React.useRef(0), created = React.useRef(null)
              React.useEffect(() => { generation.current++; return () => { generation.current++ } }, [props.sessionId])
              async function choose() {
                if (independent || pending.current) return
                pending.current = true; setError('')
                const version = generation.current
                let reference
                try {
                  if (!created.current) {
                    const { cwd } = await request({ action: 'allocate' })
                    if (generation.current !== version) return
                    created.current = await ctx.sessions.create({ cwd })
                  }
                  if (generation.current !== version) return
                  const nextId = created.current
                  reference = ctx.sessions.retain(nextId, { source: 'projectless-picker' })
                  const from = props.sessionId === undefined ? null : ctx.conversation.input.shell(props.sessionId)
                  if (from && !['plain', 'claimed'].includes(from.snapshot.phase)) throw new Error('请等待当前消息发送完成后再切换。')
                  const next = ctx.conversation.input.shell(nextId)
                  const draft = from?.draftSnapshot
                  const attachments = from?.snapshot.attachmentIds ?? []
                  if (attachments.length && !next.addAttachments(attachments)) throw new Error('无法转移附件，请重试。')
                  ctx.conversation.rebindDraftFiles(nextId, attachments, true)
                  if (draft) next.setDraft(draft)
                  ctx.uiWorkspace.openSession(nextId)
                  created.current = null
                  if (from) { from.setDraft(''); attachments.forEach(id => from.removeAttachment(id)); from.actions.persistDraft() }
                } catch (err) { if (generation.current === version) setError(err.message) }
                finally { reference?.release(); pending.current = false }
              }
              const displayWorkspaces = React.useMemo(() => independent && props.hero ? {
                ...workspaces,
                items: [...workspaces.items, { workspaceId: 'projectless:' + props.sessionId, title: ctx.locale.bind(NS)('ungrouped'), sessionIds: [props.sessionId] }],
              } : null, [independent, props.hero, props.sessionId, workspaces])
              const useWorkspaces = selector => props.useWorkspaces(() => selector(displayWorkspaces ?? workspaces))
              return h(PickerContext.Provider, { value: { independent: !!independent, choose } },
                h(NativeContent, { ...props, useWorkspaces }),
                error ? h('div', { className: 'pc-failure', role: 'alert' }, error, h('button', { className: 'pc-button', onClick: () => setError('') }, ctx.locale.bind(NS)('close'))) : null)
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

    function protectionSource() {
      let ids = null, tail = Promise.resolve(), channel
      const listeners = new Set()
      const update = body => {
        const operation = tail.then(async () => {
          const next = new Set((await request(body)).ids)
          if (ids === null || ids.size !== next.size || [...next].some(id => !ids.has(id))) {
            ids = next
            for (const listener of listeners) listener()
          }
          return ids
        })
        tail = operation.catch(() => {})
        return operation
      }
      const refresh = () => update({ action: 'archive-protection' })
      const sync = () => { void refresh().catch(() => {}) }
      return {
        getSnapshot: () => ids,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        refresh,
        async set(id, value) {
          await update({ action: 'set-archive-protection', id, protected: value })
          channel?.postMessage('changed')
        },
        connect() {
          channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('projectless-archive-protection') : null
          channel?.addEventListener('message', sync)
          window.addEventListener('focus', sync)
          sync()
          return () => { window.removeEventListener('focus', sync); channel?.close(); channel = null }
        },
      }
    }

    function access(ctx, id) {
      return ctx.remoteAccess.source('session', id, 'workspace/archiveSession')
    }

    function archiveInventory(ctx) {
      return buildArchiveInventory(ctx.sessions.list.getSnapshot(), ctx.workspaces.list.getSnapshot())
    }

    function buildArchiveInventory(sessions, workspaces) {
      if (sessions.phase !== 'ready' || workspaces.phase !== 'ready') return null
      const assigned = new Set(workspaces.items.flatMap(workspace => workspace.sessionIds))
      const archived = new Set(workspaces.archivedSessionIds), pinned = new Set(workspaces.pinnedSessionIds)
      const members = new Map()
      for (const id of sessions.ids) {
        const session = sessions.byId[id]
        if (session && !session.blank && session.origin !== 'subagent' && !assigned.has(id) && !archived.has(id)) members.set(id, session)
      }
      return { members, pinned }
    }

    function archiveStatus(ctx, inventory, protectedIds, id) {
      const row = inventory.members.get(id)
      if (!row) return 'changed'
      if (protectedIds.has(id)) return 'protected'
      if (inventory.pinned.has(id)) return 'pinned'
      if (row.running) return 'running'
      if (!access(ctx, id).getSnapshot()) return 'unavailable'
      return 'eligible'
    }

    function ArchiveDialog({ ctx, protection, t, onClose }) {
      const [preview, setPreview] = React.useState(null), [error, setError] = React.useState('')
      const [progress, setProgress] = React.useState(null), [result, setResult] = React.useState(null)
      const busy = React.useRef(false)
      React.useEffect(() => {
        let alive = true
        void protection.refresh().then(ids => {
          if (!alive) return
          const inventory = archiveInventory(ctx)
          if (!inventory) { setError(t('archiveNotReady')); return }
          const counts = { protected: 0, pinned: 0, running: 0, unavailable: 0 }
          const targets = []
          for (const [id, row] of inventory.members) {
            const status = archiveStatus(ctx, inventory, ids, id)
            if (status === 'eligible') targets.push({ id, title: row.displayTitle || id })
            else counts[status]++
          }
          setPreview({ counts, targets })
        }).catch(err => { if (alive) setError(t('error') + err.message) })
        return () => { alive = false }
      }, [ctx, protection, t])
      function close() { if (!busy.current) onClose() }
      async function confirm() {
        if (!preview?.targets.length || busy.current || result) return
        busy.current = true
        setError('')
        const total = preview.targets.length
        setProgress({ done: 0, total })
        const done = { archived: 0, protected: 0, running: 0, changed: 0, failures: [] }
        try {
          // Only submit confirmed IDs. The host rechecks protection and
          // eligibility for each one, even when this client's view is stale.
          for (const [i, { id, title }] of preview.targets.entries()) {
            try {
              if (!access(ctx, id).getSnapshot()) done.changed++
              else {
                const { outcome } = await request({ action: 'archive-ungrouped', id })
                if (outcome === 'archived' || outcome === 'protected' || outcome === 'running' || outcome === 'changed') done[outcome]++
                else done.failures.push({ id, title, reason: t('archiveUnknownOutcome') })
              }
            } catch (err) {
              done.failures.push({ id, title, code: err?.code, reason: err?.message || t('archiveUnknownOutcome') })
            }
            setProgress({ done: i + 1, total })
          }
          const skipped = Object.values(preview.counts).reduce((sum, n) => sum + n, 0) + done.protected + done.running + done.changed
          setResult({ ...done, skipped, failed: done.failures.length })
        } catch (err) { setError(t('error') + err.message) }
        finally { busy.current = false; setProgress(null) }
      }
      return h(Modal, { open: true, onClose: close, closeLabel: t('close'), title: t('archiveTitle'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', disabled: !!progress, onClick: close }, t(result || !preview?.targets.length ? 'close' : 'cancel')),
          !result && preview?.targets.length > 0 ? h(Button, { variant: 'primary', disabled: !!progress, onClick: confirm }, t('archiveConfirm')) : null) },
        error ? h('p', { role: 'alert', className: 'pc-error' }, error) : null,
        !preview && !error ? h('p', { role: 'status' }, t('loading')) : null,
        preview && !result ? h(React.Fragment, null,
          h('p', null, preview.targets.length ? t('archiveCount', { count: preview.targets.length }) : t('archiveEmpty')),
          h('p', { className: 'pc-archive-detail' }, t('archiveSkipped', preview.counts)),
          preview.counts.unavailable ? h('p', { className: 'pc-archive-detail' }, t('archiveRestricted', { count: preview.counts.unavailable })) : null,
          h('p', { className: 'pc-archive-detail' }, t('archiveHint'))) : null,
        progress ? h('p', { role: 'status' }, t('archiveRunning', progress)) : null,
        result ? h(React.Fragment, null, h('p', { role: 'status' }, t('archiveDone', result)),
          result.protected || result.running || result.changed ? h('p', { className: 'pc-archive-detail' }, t('archiveChanged', result)) : null,
          result.failures.length ? h('ul', { className: 'pc-archive-errors' }, ...result.failures.map(({ id, title, code, reason }) =>
            h('li', { key: id }, title, h('div', { className: 'pc-archive-detail pc-archive-reason' }, code ? `[${code}] ${reason}` : reason)))) : null) : null)
    }

    function archiveMembership(ctx) {
      let sessions, workspaces, inventory
      return {
        subscribe(listener) {
          const offSessions = ctx.sessions.list.subscribe(listener), offWorkspaces = ctx.workspaces.list.subscribe(listener)
          return () => { offSessions(); offWorkspaces() }
        },
        has(id) {
          const nextSessions = ctx.sessions.list.getSnapshot(), nextWorkspaces = ctx.workspaces.list.getSnapshot()
          if (sessions !== nextSessions || workspaces !== nextWorkspaces) {
            sessions = nextSessions; workspaces = nextWorkspaces
            inventory = buildArchiveInventory(sessions, workspaces)
          }
          return inventory?.members.has(id) ?? false
        },
      }
    }

    function ProtectionRowAction({ ctx, membership, protection, sessionId, t }) {
      const member = React.useSyncExternalStore(membership.subscribe, () => membership.has(sessionId))
      const enabled = React.useSyncExternalStore(protection.subscribe, () => protection.getSnapshot()?.has(sessionId) ?? null)
      const permission = React.useMemo(() => access(ctx, sessionId), [ctx, sessionId])
      const allowed = React.useSyncExternalStore(cb => permission.subscribe(cb), () => permission.getSnapshot())
      const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(false)
      if (!member) return null
      const mark = { 'data-pc-protection': enabled ? 'on' : 'off' }
      // Keep the row styling and suppress the Notify shortcut even when archiving is unavailable.
      if (enabled === null || !allowed) return h('span', { hidden: true, ...mark })
      async function toggle() {
        if (busy) return
        setBusy(true); setError(false)
        try { await protection.set(sessionId, !enabled) }
        catch { setError(true) }
        finally { setBusy(false) }
      }
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'pc-protect-action', ...mark, 'aria-label': t('protected'),
          'aria-pressed': enabled, title: t(enabled ? 'protectOff' : 'protectOn'), disabled: busy, onClick: toggle },
        h(IconShieldOutlineRegular, { size: 14 })),
        error ? h(Toast, { text: t('protectError'), onDone: () => setError(false) }) : null)
    }

    function Launcher({ ctx, t, wide, protection }) {
      const [anchor, setAnchor] = React.useState(null), [ungrouped, setUngrouped] = React.useState(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
      const [archiveOpen, setArchiveOpen] = React.useState(false)
      const pending = React.useRef(false), alive = React.useRef(true), created = React.useRef(null)
      React.useEffect(() => {
        alive.current = true
        let previous = null, previousUngrouped = null, scheduled = false, stopped = false
        const sync = () => {
          scheduled = false
          if (stopped) return
          const section = document.querySelector('[data-slot="sidebar.recent.section"]')
          const header = section?.firstElementChild
          if (previous !== header) { previous?.removeAttribute('data-pc-header'); header?.setAttribute('data-pc-header', ''); previous = header; setAnchor(header || null) }
          // Native UNGROUPED_KEY is empty; real workspaces have a nonempty ID.
          // Use the stable row key, independent of the current UI language.
          const row = document.querySelector('[data-row-key="workspace:"]')
          if (previousUngrouped !== row) { previousUngrouped?.removeAttribute('data-pc-ungrouped'); row?.setAttribute('data-pc-ungrouped', ''); previousUngrouped = row; setUngrouped(row) }
        }
        const observer = new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(sync) } })
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-row-key'] })
        sync()
        return () => { stopped = true; alive.current = false; observer.disconnect(); previous?.removeAttribute('data-pc-header'); previousUngrouped?.removeAttribute('data-pc-ungrouped') }
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
      const launch = React.useRef(create)
      launch.current = create
      React.useEffect(() => {
        function onBrandClick(event) {
          const button = event.target?.closest?.('button')
          if (!button || button.disabled || event.defaultPrevented || event.target.closest('[data-copy-version]')) return
          if (!button.querySelector('[data-slot="sidebar.brand.name"]')) return
          event.preventDefault()
          event.stopPropagation()
          void launch.current()
        }
        document.addEventListener('click', onBrandClick, true)
        return () => document.removeEventListener('click', onBrandClick, true)
      }, [])
      const button = (inUngrouped = false) => h('button', { type: 'button', className: 'pc-new' + (inUngrouped ? ' pc-new-ungrouped' : ''), 'data-projectless-new': '', 'aria-label': busy ? t('creating') : t('create'), title: t('create'), disabled: busy, onClick: event => { event.stopPropagation(); void create() }, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() } },
        h(IconNewChatOutlineRegular, { size: 14 }))
      return h(React.Fragment, null, anchor ? createPortal(button(), anchor) : wide ? h('button', { type: 'button', className: 'pc-button', disabled: busy, onClick: create }, busy ? t('creating') : t('create')) : null,
        ungrouped ? createPortal(h('span', { className: 'pc-ungrouped-actions' },
          h('button', { type: 'button', className: 'pc-new pc-new-ungrouped', 'aria-label': t('archiveAll'), title: t('archiveAll'),
            onClick: event => { event.stopPropagation(); setArchiveOpen(true) },
            onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() } }, h(IconArchiveOutlineRegular, { size: 14 })),
          button(true)), ungrouped) : null,
        archiveOpen ? h(ArchiveDialog, { ctx, t, protection, onClose: () => setArchiveOpen(false) }) : null,
        error ? createPortal(h('div', { className: 'pc-failure', role: 'alert' }, h('p', { className: 'pc-error' }, t('error') + error), h('button', { type: 'button', className: 'pc-button', onClick: create }, t('retry')), h('button', { type: 'button', className: 'pc-button', onClick: () => setError('') }, t('close'))), document.body) : null)
    }
    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'conversation', 'contextMenus', 'remoteAccess'],
      apply(ctx) {
        const protection = protectionSource()
        const membership = archiveMembership(ctx)
        ctx.effect(() => installIndependentComposer(ctx), 'projectless-chat: native independent composer')
        ctx.effect(() => installIndependentPicker(ctx), 'projectless-chat: hero workspace choice')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'projectless-chat: translations')
        ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.plugin = 'dsh-asuta-projectless-chat'; tag.dataset.pluginCss = NS; tag.textContent = CSS; document.head.appendChild(tag); return () => tag.remove() }, 'projectless-chat: styles')
        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'projectless-chat.create', order: 31, locale: NS }, props => h(Launcher, { ...props, ctx, protection }))), 'projectless-chat: recent launcher')
        ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({ name: 'settings.general.item', id: 'projectless-chat.directory', order: 80, locale: NS }, props => h(DirectorySetting, { ...props, ctx }))), 'projectless-chat: directory preference')
        ctx.effect(() => protection.connect(), 'projectless-chat: archive protection state')
        ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.row.action', id: 'projectless-chat.archive-protection', order: 20, locale: NS,
        }, props => h(ProtectionRowAction, { ...props, ctx, membership, protection }))), 'projectless-chat: archive protection row action')
        ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({ name: 'contextMenu.icon', key: 'projectless-chat.shield' }, IconShieldOutlineRegular)), 'projectless-chat: shield icon')
        ctx.effect(() => ctx.contextMenus.register({
          id: 'projectless-chat.archive-protection', target: 'session', order: 550,
          observe: ({ sessionId }) => [protection, ctx.workspaces.list, ctx.sessions.list, ctx.locale, access(ctx, sessionId)],
          resolve: ({ sessionId }) => {
            const ids = protection.getSnapshot()
            if (!ids || !membership.has(sessionId) || !access(ctx, sessionId).getSnapshot()) return []
            const enabled = ids.has(sessionId), t = ctx.locale.bind(NS)
            return [{ id: 'protect', label: t(enabled ? 'protectOff' : 'protectOn'), icon: { key: 'projectless-chat.shield' },
              failureLabel: t('protectError'), run: () => protection.set(sessionId, !enabled) }]
          },
        }), 'projectless-chat: archive protection menu')
      },
    }
  },
})
