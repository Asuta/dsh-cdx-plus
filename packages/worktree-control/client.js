window.__ModuleLoader__.load({
  id: 'dsh-asuta-worktree-control',
  factory(require) {
    const React = require('react'), h = React.createElement
    const { createPortal } = require('react-dom')
    const TAB_ID = 'dsh-asuta-worktree-control/panel', KIND = 'worktree-control'
    const CSS = [
      '.wt-panel{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font:13px/1.5 var(--dsw-font-family),system-ui,sans-serif}',
      '.wt-panel *{box-sizing:border-box}.wt-head{padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;gap:8px}.wt-head strong{flex:1}.wt-tabs{display:flex;gap:6px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.wt-panel button,.wt-panel input,.wt-panel select,.wt-panel textarea{font:inherit;color:inherit}.wt-panel button{cursor:pointer}.wt-panel button:focus-visible,.wt-panel input:focus-visible,.wt-panel select:focus-visible,.wt-panel textarea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.wt-fork-anchor{position:relative;-webkit-app-region:no-drag}.wt-fork-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:80;box-sizing:border-box;width:min(330px,calc(100vw - 32px));padding:14px;border:1px solid var(--dsw-alias-border-l2,#444);border-radius:14px;background:var(--dsw-specific-sidebar-fill,#292929);box-shadow:0 16px 42px #0006;color:var(--dsw-alias-label-primary,#eee);font:13px/1.5 var(--dsw-font-family,system-ui),sans-serif;-webkit-app-region:no-drag}.wt-fork-menu strong{display:block;margin:0 0 8px;font-size:15px}.wt-fork-option{display:block;width:100%;padding:9px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.wt-fork-option:hover:not(:disabled),.wt-fork-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#ffffff12)}.wt-fork-option:disabled{opacity:.55;cursor:default}.wt-fork-option small{display:block;color:var(--dsw-alias-label-secondary,#aaa)}.wt-fork-menu .wt-error{margin:8px 4px 0}',
      '.wt-tabs button,.wt-btn,.wt-select,.wt-input{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;padding:6px 9px}.wt-tabs button[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-state-business-primary)}.wt-btn:hover,.wt-tabs button:hover{background:var(--dsw-alias-interactive-bg-hover)}.wt-btn:disabled{opacity:.5;cursor:default}',
      '.wt-scroll{overflow:auto;min-height:0;flex:1;padding:12px 14px}.wt-muted{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}.wt-error{color:#e88e82;white-space:pre-wrap;overflow-wrap:anywhere}.wt-ok{color:#75c788;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.wt-card{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px;margin:0 0 10px}.wt-card-head{display:flex;align-items:flex-start;gap:8px}.wt-card-head strong{flex:1;min-width:0;overflow-wrap:anywhere}.wt-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.wt-create{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wt-create label{display:flex;flex-direction:column;gap:4px;min-width:0}.wt-create .wt-wide{grid-column:1/-1}.wt-check{display:flex;align-items:center;gap:7px}.wt-create label.wt-check{flex-direction:row}.wt-select,.wt-input{min-width:0;max-width:100%;background:var(--dsw-specific-sidebar-fill,transparent)}',
      '.wt-file{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin:7px 0;overflow:hidden}.wt-file-head{display:flex;align-items:center;gap:6px;padding:7px}.wt-file-name{flex:1;min-width:0;overflow-wrap:anywhere}.wt-patch{white-space:pre;overflow:auto;font:12px/1.5 ui-monospace,Consolas,monospace;margin:0;padding:8px;border-top:1px solid var(--dsw-alias-border-l2)}.wt-add{color:#75c788}.wt-del{color:#df8a80}.wt-trigger{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;padding:6px 10px;color:var(--dsw-alias-label-secondary);-webkit-app-region:no-drag}.wt-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.wt-hero{position:relative;-webkit-app-region:no-drag}.wt-hero .wt-gear{width:32px;height:32px;padding:0;justify-content:center;border-color:transparent;border-radius:10px;cursor:pointer}.wt-gear[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.wt-icon{width:16px;height:16px;flex:none;display:block}',
      '.wt-popover{box-sizing:border-box;position:absolute;right:0;bottom:calc(100% + 8px);z-index:50;width:min(286px,calc(100vw - 24px));max-height:calc(100vh - 80px);overflow:auto;padding:8px;border:1px solid var(--dsw-alias-border-l2,#383838);border-radius:12px;background:var(--dsw-specific-sidebar-fill,#242424);box-shadow:0 12px 32px #0004;color:var(--dsw-alias-label-primary,#eee);font:13px/1.5 var(--dsw-font-family,system-ui),sans-serif;text-align:left;-webkit-app-region:no-drag}.wt-popover *{box-sizing:border-box}.wt-popover button,.wt-popover select{font:inherit;color:inherit}.wt-popover button:focus-visible,.wt-popover select:focus-visible,.wt-gear:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#6b96ed);outline-offset:2px}',
      '.wt-settings-group{padding:0 6px}.wt-setting-row{min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:8px}.wt-setting-label{display:flex;align-items:center;gap:8px;flex-shrink:0;font-weight:500}.wt-setting-label .wt-icon{color:var(--dsw-alias-label-secondary,#aaa)}.wt-setting-row[data-disabled=true]{opacity:.5}',
      '.wt-switch{position:relative;display:inline-flex;width:34px;height:20px;flex:none}.wt-switch input{position:absolute;inset:0;margin:0;opacity:0;width:100%;height:100%;cursor:pointer;z-index:1}.wt-switch-track{width:100%;height:100%;border-radius:20px;background:color-mix(in srgb,currentColor 22%,transparent);transition:background .16s}.wt-switch-track:after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003;transition:transform .16s}.wt-switch input:checked+.wt-switch-track{background:var(--dsw-alias-state-business-primary,#6b96ed)}.wt-switch input:checked+.wt-switch-track:after{transform:translateX(14px)}.wt-switch input:focus-visible+.wt-switch-track{outline:2px solid var(--dsw-alias-state-business-primary,#6b96ed);outline-offset:3px}.wt-switch input:disabled{cursor:default}.wt-switch input:disabled+.wt-switch-track{opacity:.45}',
      '.wt-select-wrap{position:relative;min-width:0;width:144px;max-width:58%}.wt-select-wrap select{appearance:none;-webkit-appearance:none;width:100%;height:30px;min-width:0;padding:0 22px 0 6px;border:1px solid transparent;border-radius:7px;background:transparent;cursor:pointer;text-align:right;text-overflow:ellipsis}.wt-select-wrap select:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff0a);border-color:var(--dsw-alias-border-l2,#383838)}.wt-select-wrap select:disabled{cursor:default}.wt-select-wrap select option{background:var(--dsw-specific-sidebar-fill,#242424);color:var(--dsw-alias-label-primary,#eee)}.wt-select-wrap>.wt-icon{position:absolute;right:4px;top:7px;pointer-events:none;width:14px;color:var(--dsw-alias-label-secondary,#aaa)}',
      '.wt-popover .wt-error{display:block;font-size:12px;margin:6px;line-height:1.4}.wt-popover-footer{border-top:1px solid var(--dsw-alias-border-l2,#383838);margin-top:4px;padding-top:4px}.wt-popover .wt-details{display:flex;align-items:center;justify-content:space-between;width:100%;padding:7px 6px;border:0;border-radius:7px;background:transparent;text-align:left;cursor:pointer;color:var(--dsw-alias-label-secondary,#aaa);font-size:12px}.wt-popover .wt-details:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0a);color:var(--dsw-alias-label-primary,#eee)}@media(prefers-reduced-motion:reduce){.wt-switch-track,.wt-switch-track:after{transition:none}}',
      '[data-row-key^="session:"][data-wt-branch="true"]::after{content:"⑂";order:2;flex:none;width:16px;color:var(--dsw-alias-label-secondary);font-size:17px;line-height:20px;text-align:center}[data-row-key^="session:"][data-wt-branch="true"]>span:first-child{order:0}[data-row-key^="session:"][data-wt-branch="true"]>span:nth-child(2){order:1}[data-row-key^="session:"][data-wt-branch="true"]>span:nth-child(n+3){order:3}',
      '.wt-action-editor{margin-top:8px}.wt-action-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}.wt-action-head input{flex:1}.wt-panel .wt-command{display:block;width:100%;min-height:76px;resize:vertical;font:12px/1.6 ui-monospace,Consolas,monospace}',
      '@media(max-width:420px){.wt-create{grid-template-columns:1fr}.wt-create .wt-wide{grid-column:auto}}',
      '.wt-command-anchor{position:relative;-webkit-app-region:no-drag}.wt-command-trigger{display:flex;align-items:center;gap:3px;height:30px;padding:4px 7px!important;color:inherit;font:inherit;cursor:pointer}.wt-command-trigger .wt-icon{width:16px;height:16px}.wt-command-menu{position:fixed;z-index:150;width:264px;max-width:calc(100vw - 16px);overflow:auto;padding:8px;border:1px solid var(--dsw-alias-border-l2,#444);border-radius:12px;background:var(--dsw-specific-sidebar-fill,#242424);box-shadow:0 12px 36px #0005;color:var(--dsw-alias-label-primary,#eee);font:13px/1.5 var(--dsw-font-family,system-ui),sans-serif;-webkit-app-region:no-drag}.wt-command-caption{padding:4px 8px 8px;color:var(--dsw-alias-label-secondary,#aaa);overflow-wrap:anywhere}.wt-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;overflow-wrap:anywhere}.wt-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff12)}.wt-menu-item:disabled{opacity:.5;cursor:default}.wt-command-menu .wt-icon{width:15px;height:15px;flex:none}.wt-command-menu p{margin:6px 8px}.wt-command-menu .wt-error{padding:6px 8px;font-size:12px;max-height:120px;overflow:auto}.wt-command-footer{border-top:1px solid var(--dsw-alias-border-l2,#444);margin-top:6px;padding-top:5px}.wt-running-dot{width:6px;height:6px;border-radius:50%;background:#7ea7fa}.wt-active-command{display:flex;align-items:center;border-top:1px solid var(--dsw-alias-border-l2,#444);margin-top:5px}.wt-menu-stop{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);font:inherit;white-space:nowrap;cursor:pointer;padding:6px}.wt-command-anchor button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#7ea7fa);outline-offset:1px}',
    ].join('\n')

    async function call(action, body, signal) {
      const response = await fetch('/worktree-control/api/' + action, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal,
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || '工作树操作失败。'), { validation: result.validation })
      return result.value
    }

    function useSnapshot(store) { return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot) }
    const terminalManagers = new WeakMap()
    const environmentPages = new Set()
    const liveJob = job => ['preparing', 'waiting', 'running'].includes(job.status)
    function environmentsChanged(sessionId) { window.dispatchEvent(new CustomEvent('wt-environments-changed', { detail: sessionId })) }
    function openEnvironments(ctx, sessionId) {
      environmentPages.add(sessionId)
      ctx.sidebarRight.openTabIn(sessionId, KIND)
      window.dispatchEvent(new CustomEvent('wt-open-environments', { detail: sessionId }))
    }
    function terminalReady(view, signal) {
      return new Promise((resolve, reject) => {
        let unsubscribe = () => {}, timer
        const finish = error => { unsubscribe(); clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
        const abort = () => finish(new Error('终端启动已取消。'))
        const check = () => {
          const state = view.state.getSnapshot()
          if (state.phase === 'failed' || state.phase === 'closed' || state.info?.state === 'exited') finish(new Error(state.error || '终端无法连接。'))
          else if (state.phase === 'connected' && state.writable) finish()
        }
        unsubscribe = view.state.subscribe(check)
        timer = setTimeout(() => finish(new Error('终端连接超时。')), 20000)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort(); else check()
      })
    }
    function installEnvironmentTerminals(ctx) {
      const owner = crypto.randomUUID(), lifetime = new AbortController(), opening = new Map(), attempts = new Set()
      let timer, polling = false, launchQueue = Promise.resolve()
      const manager = { jobs: new Map(), errors: new Map(), listeners: new Set(),
        notify() { for (const listener of this.listeners) listener() },
        async show(job) {
          if (opening.has(job.id)) return opening.get(job.id)
          const pending = launchQueue.then(async () => {
            if (job.status === 'preparing') { void poll(); return }
            const terminals = ctx.get('webTerminals')
            if (!terminals) throw new Error('请先启用 DSH 内置终端插件。')
            let launch
            if (job.status === 'waiting' && !job.owner) {
              launch = await call('terminal-claim', { sessionId: job.sessionId, id: job.id, owner }, lifetime.signal)
              if (!launch) return
              job = launch
            }
            if (!launch && !job.terminalId) return
            let tab = ctx.sidebarRight.tabsIn(job.sessionId).find(item => item.id === job.tabId && item.kind === 'terminal')
            if (!tab && job.terminalId) tab = ctx.sidebarRight.tabsIn(job.sessionId).find(item => item.kind === 'terminal' &&
              ctx.sidebarRight.tabDomain.occurrence(job.sessionId, { id: item.id }).navigation.getSnapshot().params?.terminalId === job.terminalId)
            if (!tab) {
              let params
              if (job.terminalId) {
                const available = await terminals.recover(job.sessionId, true)
                if (available.some(item => item.id === job.terminalId && item.state === 'running')) params = { terminalId: job.terminalId }
              }
              if (!params) {
                if (!launch) throw new Error('执行终端已关闭，无法重新打开这次日志。')
                const choices = await terminals.launchShells(job.sessionId, lifetime.signal)
                const shell = choices.shells.find(item => launch.platform === 'win32'
                  ? /[\\/](?:powershell|pwsh)\.exe$/i.test(item.path) : /[\\/](?:bash|sh|zsh)$/.test(item.path))
                if (!shell) throw new Error('没有可用的 PowerShell 或 sh 终端。')
                params = { shellPath: shell.path }
              }
              if (ctx.sidebarRight.mounted.getSnapshot() !== job.sessionId) throw new Error('对话已切换，尚未启动的命令已取消。')
              const before = new Set(ctx.sidebarRight.tabsIn(job.sessionId).map(item => item.id))
              ctx.sidebarRight.openTabIn(job.sessionId, 'terminal', { params })
              tab = ctx.sidebarRight.tabsIn(job.sessionId).find(item => item.kind === 'terminal' && !before.has(item.id))
            } else {
              if (ctx.sidebarRight.mounted.getSnapshot() !== job.sessionId) return
              ctx.sidebarRight.focus(tab.id)
              if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
            }
            if (!tab) throw new Error('无法打开此对话的内置工作台。')
            const navigation = ctx.sidebarRight.tabDomain.occurrence(job.sessionId, { id: tab.id }).navigation.getSnapshot()
            const view = terminals.view(job.sessionId, tab.id, navigation.address, navigation.params?.terminalId, navigation.params?.shellPath)
            await terminalReady(view, lifetime.signal)
            if (launch) {
              await call('terminal-bind', { sessionId: job.sessionId, id: job.id, owner, terminalId: view.id, tabId: tab.id }, lifetime.signal)
              await view.rename(job.title)
              const quote = value => "'" + value.replaceAll("'", launch.platform === 'win32' ? "''" : "'" + String.fromCharCode(92) + "''") + "'"
              const command = launch.argv.map(quote).join(' ')
              const input = launch.platform === 'win32'
                ? 'Set-Location -LiteralPath ' + quote(job.cwd) + '; if ($?) { & ' + command + ' }' + String.fromCharCode(13)
                : 'cd -- ' + quote(job.cwd) + ' && ' + command + String.fromCharCode(13)
              view.write(input)
            }
          }).catch(async error => {
            manager.errors.set(job.sessionId, error.message); manager.notify()
            if ((job.status === 'waiting' || job.status === 'preparing') && (!job.owner || job.owner === owner)) await call('terminal-stop', { sessionId: job.sessionId, id: job.id, reason: error.message }).catch(() => {})
            throw error
          }).finally(() => opening.delete(job.id))
          launchQueue = pending.catch(() => {})
          opening.set(job.id, pending)
          return pending
        },
      }
      async function poll() {
        if (polling || lifetime.signal.aborted) return
        const sessionId = ctx.sidebarRight.mounted.getSnapshot()
        if (!sessionId) return
        polling = true
        try {
          const jobs = await call('terminal-jobs', { sessionId }, lifetime.signal)
          manager.jobs.set(sessionId, jobs); manager.notify()
          for (const job of jobs) if (job.status === 'waiting' && !job.owner && !attempts.has(job.id)) {
            attempts.add(job.id)
            void manager.show(job).catch(() => {})
          }
        } catch { /* A disconnected browser must never replay a launch. */ }
        finally { polling = false }
      }
      const tick = async () => { await poll(); if (!lifetime.signal.aborted) timer = setTimeout(tick, 750) }
      terminalManagers.set(ctx, manager)
      const unsubscribe = ctx.sidebarRight.mounted.subscribe(() => { void poll() })
      void tick()
      return () => { lifetime.abort(); clearTimeout(timer); unsubscribe(); terminalManagers.delete(ctx) }
    }

    function CommandMenuPlacement(props) {
      const origin = React.useRef(null), [target, setTarget] = React.useState(null)
      React.useLayoutEffect(() => {
        const header = origin.current?.closest('header')
        if (!header) return
        const locate = () => {
          const candidates = [...header.querySelectorAll('[data-git-diff-actions]')]
            .filter(node => node.dataset.gitDiffActions === props.sessionId)
          // The tab-row toolbar wins; its header fallback is hidden while tabs exist.
          const next = candidates.find(node => !node.closest('.gd-toolbar-fallback')) || candidates[0] || null
          setTarget(previous => previous === next ? previous : next)
        }
        const observer = new MutationObserver(locate)
        observer.observe(header, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-git-diff-actions'] })
        locate()
        return () => observer.disconnect()
      }, [props.sessionId])
      const menu = h(CommandMenu, props)
      return h(React.Fragment, null, h('span', { ref: origin, hidden: true }), target?.isConnected ? createPortal(menu, target) : menu)
    }
    function CommandMenu({ ctx, sessionId: suppliedSessionId, useSession }) {
      const mounted = useSnapshot(ctx.sidebarRight.mounted), sessionId = suppliedSessionId || mounted
      const directory = useSessionDirectory(ctx, sessionId)
      const openState = useSession(value => value.openState)
      const [open, setOpen] = React.useState(false), [switching, setSwitching] = React.useState(false)
      const [available, setAvailable] = React.useState(false), [catalog, setCatalog] = React.useState(null)
      const [capabilityError, setCapabilityError] = React.useState('')
      const [revision, retryCapability] = React.useReducer(value => value + 1, 0)
      const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
      const [, redraw] = React.useReducer(value => value + 1, 0), root = React.useRef(null)
      const manager = terminalManagers.get(ctx), jobs = manager?.jobs.get(sessionId) || []
      React.useEffect(() => {
        if (!manager) return
        manager.listeners.add(redraw); return () => manager.listeners.delete(redraw)
      }, [manager])
      React.useEffect(() => {
        setOpen(false); setCatalog(null); setError(''); setAvailable(false); setCapabilityError('')
        // The header can mount before historical session hydration creates its Host Agent.
        // Recheck when the native session is open, including after reconnect.
        if (!sessionId || openState !== 'open') return
        const controller = new AbortController()
        call('capability', { sessionId }, controller.signal).then(value => {
          if (!controller.signal.aborted) setAvailable(value.isGitRepository)
        }).catch(cause => { if (!controller.signal.aborted) setCapabilityError(cause.message) })
        return () => controller.abort()
      }, [sessionId, directory, openState, revision])
      React.useEffect(() => {
        if (!open) return
        const controller = new AbortController()
        const load = () => available && call('environment-menu', { sessionId }, controller.signal).then(setCatalog).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
        void load()
        const change = event => { if (event.detail === sessionId) void load() }
        const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
        const key = event => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('wt-environments-changed', change); document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
        return () => { controller.abort(); window.removeEventListener('wt-environments-changed', change); document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
      }, [open, sessionId, available])
      React.useLayoutEffect(() => {
        if (!open) return
        const position = () => {
          const box = root.current?.getBoundingClientRect(), menu = root.current?.querySelector('.wt-command-menu')
          if (box && menu) { menu.style.top = box.bottom + 8 + 'px'; menu.style.left = Math.max(8, Math.min(box.right - 264, window.innerWidth - 272)) + 'px'; menu.style.maxHeight = Math.max(100, window.innerHeight - box.bottom - 24) + 'px' }
        }
        position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
        return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
      }, [open, switching])
      async function perform(operation) {
        setBusy(true); setError('')
        try { await operation() } catch (cause) { setError(cause.message) } finally { setBusy(false) }
      }
      async function run(id) {
        manager.errors.delete(sessionId)
        const value = await call('environment-action', { sessionId, id, environmentId: catalog.selectedId })
        await manager.show(value.terminalJob)
        setOpen(false)
      }
      async function select(id) {
        await call('environment-select', { sessionId, id, kind: catalog.draft ? 'draft' : 'session', draft: catalog.draft || undefined })
        setCatalog(await call('environment-menu', { sessionId })); setSwitching(false); environmentsChanged(sessionId)
      }
      if (!available && !capabilityError) return null
      const profile = catalog?.profiles.find(item => item.id === catalog.selectedId)
      const latest = jobs.at(-1)
      const message = capabilityError || error || manager?.errors.get(sessionId) || (latest?.status === 'failed' || latest?.status === 'stopped' ? latest.error : '')
      return h('div', { className: 'wt-command-anchor', ref: root },
        h('button', { className: 'wt-btn wt-command-trigger', type: 'button', title: '环境命令', 'aria-label': '环境命令', 'aria-expanded': open, onClick: () => { setOpen(!open); setSwitching(false); setError('') } },
          h(SettingsIcon, { name: 'play' }), h(SettingsIcon, { name: 'chevron' }), jobs.some(liveJob) ? h('span', { className: 'wt-running-dot', title: '命令执行中' }) : null),
        open ? h('div', { className: 'wt-command-menu', role: 'dialog', 'aria-label': '环境命令菜单' },
          h('div', { className: 'wt-command-caption' }, capabilityError ? '环境命令暂不可用' : switching ? '切换环境' : profile?.name || '未选择环境'),
          capabilityError ? null : !catalog ? h('p', { className: 'wt-muted' }, '正在读取…') : switching
            ? [h('button', { key: 'none', type: 'button', className: 'wt-menu-item', disabled: busy, onClick: () => perform(() => select('')) }, !catalog.selectedId ? '✓ 无环境' : '无环境'),
              ...catalog.profiles.map(item => h('button', { key: item.id, type: 'button', className: 'wt-menu-item', disabled: busy, onClick: () => perform(() => select(item.id)) }, (item.id === catalog.selectedId ? '✓ ' : '') + item.name))]
            : profile?.actions.length ? profile.actions.map((item, id) => h('button', { key: id, type: 'button', className: 'wt-menu-item', title: item.command, disabled: busy, onClick: () => perform(() => run(id)) }, h(SettingsIcon, { name: 'play' }), item.name))
              : h('p', { className: 'wt-muted' }, profile ? '此环境尚未配置命令。' : '选择一个环境后即可运行命令。'),
          jobs.filter(liveJob).map(job => h('div', { key: job.id, className: 'wt-active-command' },
            h('button', { type: 'button', className: 'wt-menu-item', onClick: () => perform(() => manager.show(job)) }, job.title, ' · ', job.status === 'running' ? '运行中' : '正在启动'),
            h('button', { type: 'button', className: 'wt-menu-stop', 'aria-label': '停止 ' + job.title, onClick: () => perform(() => call('terminal-stop', { sessionId, id: job.id })) }, '停止'))),
          message ? h('div', { className: 'wt-error', role: 'alert' }, message) : null,
          h('div', { className: 'wt-command-footer' },
            capabilityError ? h('button', { type: 'button', className: 'wt-menu-item', onClick: retryCapability }, '重新检查') : null,
            h('button', { type: 'button', className: 'wt-menu-item', disabled: !catalog || busy, onClick: () => setSwitching(!switching) }, switching ? '返回命令列表' : '切换环境', ' ›'),
            h('button', { type: 'button', className: 'wt-menu-item', onClick: () => { setOpen(false); openEnvironments(ctx, sessionId) } }, '管理环境…')),
        ) : null)
    }
    function useSessionDirectory(ctx, sessionId) {
      return React.useSyncExternalStore(ctx.sessions.list.subscribe, () => {
        const row = ctx.sessions.list.getSnapshot().byId[sessionId]
        return row?.projectionValues?.workingDirectory || row?.cwd || ''
      }, () => '')
    }
    const locationCache = new Map()
    const locationQueue = []
    let activeLocations = 0
    function drainLocations() {
      while (activeLocations < 4 && locationQueue.length) {
        const job = locationQueue.shift()
        activeLocations++
        call('location-kind', { path: job.path }).then(value => job.resolve(Boolean(value.worktree)), () => job.resolve(false))
          .finally(() => { activeLocations--; drainLocations() })
      }
    }
    function worktreeLocation(path) {
      if (!path) return Promise.resolve(false)
      if (!locationCache.has(path)) {
        locationCache.set(path, new Promise(resolve => { locationQueue.push({ path, resolve }); drainLocations() }))
      }
      return locationCache.get(path)
    }
    function RowBadge({ ctx, sessionId }) {
      const directory = React.useSyncExternalStore(ctx.sessions.list.subscribe, () => {
        const row = ctx.sessions.list.getSnapshot().byId[sessionId]
        return row?.projectionValues?.workingDirectory || row?.cwd || ''
      }, () => '')
      const ref = React.useRef(null)
      const [worktree, setWorktree] = React.useState(false)
      React.useEffect(() => {
        let active = true
        worktreeLocation(directory).then(value => { if (active) setWorktree(value) })
        return () => { active = false }
      }, [directory])
      React.useEffect(() => {
        const row = ref.current?.closest('[data-row-key^="session:"]')
        if (!row) return
        if (worktree) row.dataset.wtBranch = 'true'
        else delete row.dataset.wtBranch
        return () => { delete row.dataset.wtBranch }
      }, [worktree])
      return h('span', { ref, hidden: true, 'data-wt-marker': '' })
    }
    function lineCounts(patch) {
      let additions = 0, deletions = 0
      for (const line of patch.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++
        if (line.startsWith('-') && !line.startsWith('---')) deletions++
      }
      return { additions, deletions }
    }

    function Panel({ ctx }) {
      const sessionId = useSnapshot(ctx.sidebarRight.mounted)
      const directory = useSessionDirectory(ctx, sessionId)
      const [tab, setTab] = React.useState(() => environmentPages.has(sessionId) ? 'environments' : 'trees'), [catalog, setCatalog] = React.useState(null)
      const [capability, setCapability] = React.useState(null)
      const [diff, setDiff] = React.useState(null), [baseRef, setBaseRef] = React.useState('HEAD')
      const [branch, setBranch] = React.useState(''), [includeChanges, setIncludeChanges] = React.useState(true)
      const [runSetupOnCreate, setRunSetupOnCreate] = React.useState(false), [retention, setRetention] = React.useState('15')
      const [worktreeRoot, setWorktreeRoot] = React.useState('')
      const [editor, setEditorState] = React.useState({ id: '', name: '', setup: '', actions: [] })
      const [actionIssue, setActionIssue] = React.useState(null), editorRoot = React.useRef(null)
      const actionErrorId = React.useId()
      const setEditor = value => { setEditorState(value); setActionIssue(null) }
      React.useLayoutEffect(() => {
        if (!actionIssue) return
        const field = editorRoot.current?.querySelector('[data-environment-action="' + actionIssue.actionIndex + '"] [data-environment-field="' + actionIssue.field + '"]')
        if (!field) { setError(actionIssue.message); setActionIssue(null); return }
        field?.focus({ preventScroll: true })
        field?.scrollIntoView({ block: 'center', inline: 'nearest' })
      }, [actionIssue])
      const [commitMessage, setCommitMessage] = React.useState(''), [expanded, setExpanded] = React.useState('')
      const [busy, setBusy] = React.useState(''), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('')
      const savingEnvironment = busy === 'environment-save'
      const [confirmation, setConfirmation] = React.useState(null)
      const confirmAction = (message, accept) => setConfirmation({ message, accept })
      const [revision, refresh] = React.useReducer(value => value + 1, 0)
      React.useEffect(() => {
        const open = event => { if (event.detail === sessionId) { setTab('environments'); refresh() } }
        const changed = event => { if (event.detail === sessionId) refresh() }
        window.addEventListener('wt-open-environments', open); window.addEventListener('wt-environments-changed', changed)
        return () => { window.removeEventListener('wt-open-environments', open); window.removeEventListener('wt-environments-changed', changed) }
      }, [sessionId])

      React.useEffect(() => {
        setCatalog(null); setDiff(null); setCapability(null); setError('')
        if (!sessionId) return
        const controller = new AbortController()
        call('capability', { sessionId }, controller.signal).then(async value => {
          setCapability({ sessionId, directory, ...value })
          if (!value.isGitRepository) return
          const catalogValue = await call('catalog', { sessionId }, controller.signal)
          return catalogValue
        }).then(value => {
          if (!value) return
          setCatalog(value); setRetention(String(value.retentionLimit)); setWorktreeRoot(value.worktreeRoot);
          if (value.branches.includes(baseRef) || baseRef === 'HEAD') return
          setBaseRef('HEAD')
        }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
        return () => controller.abort()
      }, [sessionId, directory, revision])
      React.useEffect(() => { setError(''); setNotice(''); setCommitMessage(''); setBranch(''); setConfirmation(null); setActionIssue(null) }, [sessionId])

      React.useEffect(() => {
        setDiff(null); setExpanded('')
        if (!sessionId || tab !== 'diff' || capability?.sessionId !== sessionId || capability.directory !== directory || !capability.isGitRepository) return
        const controller = new AbortController()
        call('inspect', { sessionId }, controller.signal).then(setDiff).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
        return () => controller.abort()
      }, [sessionId, directory, tab, revision, capability])

      async function act(action, extra = {}, success = '') {
        if (!sessionId || busy) return
        setBusy(action); setError(''); setNotice('')
        if (action === 'environment-save') setActionIssue(null)
        try {
          const value = await call(action, { sessionId, ...extra })
          if (value?.terminalJob) {
            setNotice('已交给内置工作台执行，可在终端查看输出。')
            await terminalManagers.get(ctx).show(value.terminalJob)
            return value
          }
          if (action.startsWith('environment-')) environmentsChanged(sessionId)
          if (success) setNotice(success)
          if (value?.warnings?.length) setNotice([success, ...value.warnings].filter(Boolean).join('\n'))
          if (value?.output) setNotice([success, value.output].filter(Boolean).join('\n'))
          if (action === 'create' && value?.setupOutput) setNotice(value.setupOutput || '项目初始化完成。')
          setExpanded(''); refresh()
          return value
        } catch (cause) {
          const { actionIndex, field } = cause.validation || {}
          if (action === 'environment-save' && Number.isInteger(actionIndex) && actionIndex >= 0 && extra.profile?.actions?.[actionIndex] && ['name', 'command'].includes(field)) {
            setActionIssue({ actionIndex, field, message: cause.message })
          }
          else setError(cause.message)
        }
        finally { setBusy('') }
      }

      if (!sessionId) return h('div', { className: 'wt-panel wt-scroll' }, '请先打开一个带 Git 工作目录的对话。')
      if (capability?.sessionId !== sessionId || capability.directory !== directory) return h('div', { className: 'wt-panel wt-scroll wt-muted', 'data-plugin': 'dsh-asuta-worktree-control' }, error || '正在检查 Git 工作目录…')
      if (capability?.sessionId === sessionId && capability.directory === directory && !capability.isGitRepository) return h('div', { className: 'wt-panel wt-scroll wt-muted', 'data-plugin': 'dsh-asuta-worktree-control' }, '当前项目不是 Git 仓库')
      const allTrees = catalog?.worktrees || []
      const currentTree = allTrees.find(tree => tree.current)
      const handoffTarget = currentTree?.path === catalog?.primaryRoot
        ? allTrees.filter(tree => tree.managed && !tree.current && tree.sessionIds?.includes(sessionId)).sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))[0]
        : allTrees.find(tree => tree.path === catalog?.primaryRoot)

      return h('div', { className: 'wt-panel', 'data-plugin': 'dsh-asuta-worktree-control' },
        h('div', { className: 'wt-head' }, h('strong', null, '工作树'), h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => refresh() }, '刷新')),
        h('div', { className: 'wt-tabs', role: 'tablist' },
          h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'trees', onClick: () => setTab('trees') }, '工作树'),
          h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'diff', onClick: () => setTab('diff') }, '差异与 Git'),
          h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'environments', onClick: () => setTab('environments') }, '环境'),
        ),
        error ? h('div', { className: 'wt-error', role: 'alert', style: { padding: '8px 14px' } }, error) : null,
        catalog?.environments?.setupWarning ? h('div', { className: 'wt-error', role: 'alert', style: { padding: '8px 14px' } }, catalog.environments.setupWarning, '。可在“差异与 Git”中重试初始化。') : null,
        notice ? h('div', { className: 'wt-ok', role: 'status', style: { padding: '8px 14px' } }, notice) : null,
        confirmation ? h('div', { className: 'wt-card', role: 'alertdialog', 'aria-label': '确认工作树操作', style: { margin: '10px 14px' } },
          h('p', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, confirmation.message),
          h('div', { className: 'wt-actions' }, h('button', { className: 'wt-btn', type: 'button', onClick: () => { const accept = confirmation.accept; setConfirmation(null); accept() } }, '确认继续'), h('button', { className: 'wt-btn', type: 'button', onClick: () => setConfirmation(null) }, '取消')),
        ) : null,
        tab === 'environments' ? h('div', { className: 'wt-scroll' },
          h('div', { className: 'wt-card' },
            h('strong', null, '此对话的环境'),
            h('select', { className: 'wt-select', style: { width: '100%', marginTop: '8px' }, value: catalog?.environments?.selectedId || '', onChange: event => act('environment-select', { kind: catalog?.environments?.draft ? 'draft' : 'session', draft: catalog?.environments?.draft ? { create: catalog.environments.draft.create, baseRef: catalog.environments.draft.baseRef } : undefined, id: event.target.value }, '已切换此对话的环境。') },
              h('option', { value: '' }, '无环境'), ...(catalog?.environments?.profiles || []).map(item => h('option', { key: item.id, value: item.id }, item.name))),
            h('p', { className: 'wt-muted' }, '切换环境不会自动重跑初始化；需要时在“差异与 Git”中手动运行。'),
          ),
          h('div', { className: 'wt-card' },
            h('strong', null, '项目环境配置'),
            (catalog?.environments?.profiles || []).map(item => h('div', { key: item.id, className: 'wt-actions', style: { alignItems: 'center' } },
              h('span', { style: { flex: 1 } }, item.name, item.id === catalog.environments.defaultId ? ' · 默认' : ''),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => setEditor({ id: item.imported ? '' : item.id, name: item.imported ? item.name + ' 副本' : item.name, setup: item.setup, actions: item.actions.map(action => ({ name: action.name, command: action.command })) }) }, item.imported ? '导入副本' : '编辑'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('environment-select', { kind: 'default', id: item.id }, '默认环境已更新。') }, '设为默认'),
              !item.imported ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => confirmAction('删除环境“' + item.name + '”？关联对话会改为无环境。', () => act('environment-delete', { id: item.id }, '环境已删除。')) }, '删除') : null,
            )),
            h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), style: { marginTop: '10px' }, onClick: () => act('environment-select', { kind: 'default', id: '' }, '默认环境已清除。') }, '默认使用无环境'),
          ),
          h('div', { className: 'wt-card', ref: editorRoot },
            h('strong', null, editor.id ? '编辑环境' : '新建环境'),
            h('label', { style: { display: 'block', marginTop: '8px' } }, '名称', h('input', { className: 'wt-input', disabled: savingEnvironment, style: { display: 'block', width: '100%' }, value: editor.name, maxLength: 80, onChange: event => setEditor({ ...editor, name: event.target.value }) })),
            h('label', { style: { display: 'block', marginTop: '8px' } }, '初始化脚本（新建工作树后运行）', h('textarea', { className: 'wt-input', disabled: savingEnvironment, style: { display: 'block', width: '100%', minHeight: '75px' }, value: editor.setup, onChange: event => setEditor({ ...editor, setup: event.target.value }) })),
            h('strong', { style: { display: 'block', marginTop: '10px' } }, '手动操作'),
            h('div', { className: 'wt-muted' }, '支持多行命令，失败即停止后续执行。完全空白的操作保存时自动忽略。'),
            editor.actions.map((item, index) => h('div', { key: index, className: 'wt-action-editor', 'data-environment-action': index },
              h('div', { className: 'wt-action-head' },
                h('input', { className: 'wt-input', disabled: savingEnvironment, value: item.name, placeholder: '名称', 'aria-label': '操作名称 ' + (index + 1), 'data-environment-field': 'name',
                  'aria-invalid': actionIssue?.actionIndex === index && actionIssue.field === 'name', 'aria-describedby': actionIssue?.actionIndex === index ? actionErrorId : undefined,
                  onChange: event => setEditor({ ...editor, actions: editor.actions.map((action, i) => i === index ? { ...action, name: event.target.value } : action) }) }),
                h('button', { className: 'wt-btn', type: 'button', disabled: savingEnvironment, onClick: () => setEditor({ ...editor, actions: editor.actions.filter((_, i) => i !== index) }) }, '移除'),
              ),
              h('textarea', { className: 'wt-input wt-command', disabled: savingEnvironment, rows: 3, spellCheck: false, value: item.command, placeholder: '每行输入一条命令', 'aria-label': '操作命令 ' + (index + 1), 'data-environment-field': 'command',
                'aria-invalid': actionIssue?.actionIndex === index && actionIssue.field === 'command', 'aria-describedby': actionIssue?.actionIndex === index ? actionErrorId : undefined,
                onChange: event => setEditor({ ...editor, actions: editor.actions.map((action, i) => i === index ? { ...action, command: event.target.value } : action) }) }),
              actionIssue?.actionIndex === index ? h('p', { id: actionErrorId, className: 'wt-error', role: 'alert' }, actionIssue.message) : null,
            )),
            h('div', { className: 'wt-actions' },
              h('button', { className: 'wt-btn', type: 'button', disabled: savingEnvironment, onClick: () => setEditor({ ...editor, actions: [...editor.actions, { name: '', command: '' }] }) }, '添加操作'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy) || !editor.name.trim(), onClick: async () => { if (await act('environment-save', { profile: editor }, '环境已保存。')) setEditor({ id: '', name: '', setup: '', actions: [] }) } }, '保存环境'),
              h('button', { className: 'wt-btn', type: 'button', disabled: savingEnvironment, onClick: () => setEditor({ id: '', name: '', setup: '', actions: [] }) }, '清空表单'),
            ),
          ),
        ) : tab === 'trees' ? h('div', { className: 'wt-scroll' },
          h('div', { className: 'wt-card' },
            h('div', { className: 'wt-card-head' }, h('strong', null, '当前对话目录'), h('span', { className: 'wt-muted' }, currentTree?.branch || (currentTree?.detached ? 'detached HEAD' : '本地'))),
            h('div', { className: 'wt-muted' }, catalog?.currentPath || '正在读取…'),
            h('label', { style: { display: 'block', marginTop: '8px' } }, h('span', { className: 'wt-muted' }, '切换目录'),
              h('select', { className: 'wt-select', disabled: Boolean(busy), style: { width: '100%' }, value: currentTree?.path || '', onChange: event => { if (event.target.value) act('switch', { target: event.target.value }, '已在同一对话中切换工作目录。') } },
                allTrees.map(tree => h('option', { key: tree.path, value: tree.path }, (tree.path === catalog?.primaryRoot ? '本地 · ' : '工作树 · ') + (tree.branch || 'detached') + ' — ' + tree.path)),
              ),
            ),
            h('div', { className: 'wt-actions' },
              handoffTarget ? h('button', { className: 'wt-btn', disabled: Boolean(busy), type: 'button', onClick: () => { confirmAction('把当前成果复制到 ' + handoffTarget.path + ' 并在同一对话中继续？源目录保留原样；目标须没有未提交改动，带入的成果将暂存。', () => act('handoff', { target: handoffTarget.path }, '已交接并切换，对话历史保持不变。')) } }, currentTree?.path === catalog?.primaryRoot ? '交接回工作树' : '交接到本地') : null,
            ),
          ),
          h('div', { className: 'wt-card' }, h('strong', null, '新建工作树'),
            h('div', { className: 'wt-create', style: { marginTop: '8px' } },
              h('label', null, h('span', { className: 'wt-muted' }, '基础分支'), h('select', { className: 'wt-select', value: baseRef, onChange: event => setBaseRef(event.target.value) },
                h('option', { value: 'HEAD' }, '当前提交 (HEAD)'), ...(catalog?.branches || []).map(ref => h('option', { key: ref, value: ref }, ref)))),
              h('label', null, h('span', { className: 'wt-muted' }, '新分支（留空则 detached）'), h('input', { className: 'wt-input', value: branch, onChange: event => setBranch(event.target.value), placeholder: '例如 feature/my-task' })),
              h('label', { className: 'wt-wide wt-check' }, h('input', { type: 'checkbox', checked: includeChanges, onChange: event => setIncludeChanges(event.target.checked) }), '把当前未提交改动复制到新工作树'),
              h('label', { className: 'wt-wide wt-check' }, h('input', { type: 'checkbox', checked: runSetupOnCreate, onChange: event => setRunSetupOnCreate(event.target.checked) }), '创建后运行所选环境或项目的 setup.script'),
              h('button', { className: 'wt-btn wt-wide', type: 'button', disabled: Boolean(busy), onClick: () => act('create', { baseRef, branch: branch.trim(), includeChanges, runSetup: runSetupOnCreate, retentionLimit: Number(retention) }, '工作树已创建并切换；对话历史保持不变。') }, busy === 'create' ? '正在创建…' : '创建并切换到工作树'),
            ),
            h('p', { className: 'wt-muted' }, '新目录位于下方设置的工作树根目录；.worktreeinclude 匹配的忽略文件也会复制。'),
          ),
          h('div', { className: 'wt-card' }, h('div', { className: 'wt-card-head' }, h('strong', null, '自动保留'), h('span', { className: 'wt-muted' }, '超出上限时先快照再归档')),
            h('label', null, h('span', { className: 'wt-muted' }, '最多保留多少棵工作树？0 表示关闭自动清理。'), h('input', { className: 'wt-input', type: 'number', min: 0, max: 200, value: retention, onChange: event => setRetention(event.target.value), onBlur: () => { const value = Number(retention); if (Number.isInteger(value) && value >= 0 && value <= 200 && value !== catalog?.retentionLimit) act('retention', { value }, '保留数量已保存。') } })),
            h('label', { style: { display: 'block', marginTop: '8px' } }, h('span', { className: 'wt-muted' }, '工作树根目录（仅影响新建工作树）'), h('input', { className: 'wt-input', style: { width: '100%' }, value: worktreeRoot, onChange: event => setWorktreeRoot(event.target.value) })),
            h('button', { className: 'wt-btn', disabled: Boolean(busy) || !worktreeRoot || worktreeRoot === catalog?.worktreeRoot, type: 'button', onClick: () => act('retention', { worktreeRoot }, '工作树根目录已保存。') }, '保存根目录'),
          ),
          h('strong', null, '受管理的工作树'),
          catalog ? catalog.worktrees.length ? catalog.worktrees.map(tree => h('div', { className: 'wt-card', key: tree.path },
            h('div', { className: 'wt-card-head' }, h('strong', null, tree.branch || 'detached HEAD'), h('span', { className: 'wt-muted' }, tree.current ? '当前对话' : tree.pinned ? '已固定' : '')),
            h('div', { className: 'wt-muted' }, tree.path),
            h('div', { className: 'wt-actions' },
              !tree.current ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('switch', { target: tree.path }, '已在同一对话中切换工作目录。') }, '切换到此处') : null,
              tree.managed ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('pin', { path: tree.path, pinned: !tree.pinned }, tree.pinned ? '已取消固定。' : '已固定，不会被自动清理。') }, tree.pinned ? '取消固定' : '固定') : null,
              tree.managed && !tree.current ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => { confirmAction('归档前会保存 Git 已跟踪改动、未忽略的未跟踪文件和 .worktreeinclude 文件；其余忽略文件不会保留。确定继续？', () => act('archive', { path: tree.path }, '工作树已快照并归档。')) } }, '快照并归档') : null,
            ),
          )) : h('p', { className: 'wt-muted' }, '尚无由此插件创建的工作树。') : h('p', { className: 'wt-muted' }, '正在读取工作树…'),
          h('strong', { style: { display: 'block', marginTop: '16px' } }, '可恢复快照'),
          catalog?.archives?.length ? catalog.archives.map(item => h('div', { className: 'wt-card', key: item.id },
            h('div', { className: 'wt-card-head' }, h('strong', null, item.branch || 'detached HEAD'), h('span', { className: 'wt-muted' }, new Date(item.archivedAt).toLocaleString())),
            h('div', { className: 'wt-muted' }, item.path),
            h('div', { className: 'wt-actions' },
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('restore', { id: item.id }, '快照已恢复，并切换到恢复的工作树。') }, '恢复并切换'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => { confirmAction('永久删除这份快照？此操作无法撤销。', () => act('delete-archive', { id: item.id }, '快照已永久删除。')) } }, '删除快照'),
            ),
          )) : h('p', { className: 'wt-muted' }, '暂无可恢复快照。'),
        ) : h('div', { className: 'wt-scroll' },
          h('div', { className: 'wt-card' }, h('div', { className: 'wt-card-head' }, h('strong', null, '当前工作树差异'), h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => refresh() }, '刷新')),
            h('p', { className: 'wt-muted' }, diff ? diff.root + (diff.branch ? ' · ' + diff.branch : ' · detached HEAD') : '正在读取差异…'),
            diff?.files?.length ? diff.files.map(file => {
              const counts = lineCounts(file.patch)
              return h('div', { className: 'wt-file', key: file.path },
                h('div', { className: 'wt-file-head' },
                  h('button', { className: 'wt-btn wt-file-name', type: 'button', 'aria-expanded': expanded === file.path, onClick: () => setExpanded(expanded === file.path ? '' : file.path) }, file.path + (file.untracked ? ' · 未跟踪' : '')),
                  h('span', { className: 'wt-add' }, '+' + counts.additions), h('span', { className: 'wt-del' }, '-' + counts.deletions),
                  file.staged ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('unstage', { paths: [file.path] }) }, '取消暂存') : null,
                  !file.staged || file.unstaged ? h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('stage', { paths: [file.path] }) }, file.staged ? '暂存剩余改动' : '暂存') : null,
                  h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => { confirmAction('丢弃 ' + file.path + ' 的未提交改动？', () => act('discard', { paths: [file.path] })) } }, '丢弃'),
                ),
                expanded === file.path ? h('pre', { className: 'wt-patch' }, file.patch || '没有可显示的文本差异。') : null,
              )
            }) : diff ? h('p', { className: 'wt-muted' }, '当前没有改动。') : null,
          ),
          h('div', { className: 'wt-card' }, h('strong', null, '提交、推送与 PR'),
            h('label', { style: { display: 'block', marginTop: '8px' } }, h('span', { className: 'wt-muted' }, '提交说明（仅提交已暂存内容）'), h('input', { className: 'wt-input', style: { width: '100%' }, value: commitMessage, onChange: event => setCommitMessage(event.target.value), placeholder: '例如：修复工作树切换' })),
            h('div', { className: 'wt-actions' },
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: async () => { const result = await act('commit', { message: commitMessage }, '提交已创建。'); if (result) setCommitMessage('') } }, '提交'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => act('push', {}, '已推送到远端。') }, '推送'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => { confirmAction('将调用 gh pr create --web 打开 PR 创建页面。继续？', () => act('pull-request', {}, '已打开 PR 创建流程。')) } }, '创建 PR'),
              h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy), onClick: () => { confirmAction('运行当前环境的 setup.script？脚本将修改当前工作树。', () => act('setup', {}, '项目初始化完成。')) } }, '运行当前环境 setup'),
            ),
            h('label', { style: { display: 'block', marginTop: '8px' } }, h('span', { className: 'wt-muted' }, '新分支名称（用于 detached 工作树）'), h('input', { className: 'wt-input', value: branch, onChange: event => setBranch(event.target.value), placeholder: 'feature/my-task' })),
            h('button', { className: 'wt-btn', type: 'button', disabled: Boolean(busy) || !branch.trim(), onClick: () => act('branch', { branch: branch.trim() }, '已在当前工作树创建分支。') }, '在此创建分支'),
            (catalog?.environments?.profiles.find(item => item.id === catalog.environments.selectedId)?.actions || []).length ? h('div', { className: 'wt-actions' }, catalog.environments.profiles.find(item => item.id === catalog.environments.selectedId).actions.map((item, id) => h('button', { key: id, type: 'button', className: 'wt-btn', disabled: Boolean(busy), title: item.command, onClick: () => { confirmAction('运行项目操作“' + item.name + '”？\n' + item.command, () => act('environment-action', { id }, '项目操作已完成。')) } }, item.name))) : null,
          ),
        ),
      )
    }

    function SettingsIcon({ name }) {
      const paths = {
        worktree: 'M6 3v12m0-7c7 0 12 0 12 7M3 12l3 3 3-3m6 0 3 3 3-3',
        branch: 'M6 6v12m12-12v3c0 4-12 2-12 6M4 3h4v4H4zM16 3h4v4h-4zM4 17h4v4H4z',
        environment: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3zm-8 4.5 8 4.5 8-4.5M12 12v9',
        chevron: 'm8 10 4 4 4-4',
        arrow: 'M5 12h14m-5-5 5 5-5 5',
        info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
        settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        play: 'm8 4 12 8-12 8z',
      }
      return h('svg', { className: 'wt-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }))
    }

    function HeroSettings({ ctx }) {
      const sessionId = useSnapshot(ctx.sidebarRight.mounted)
      const directory = useSessionDirectory(ctx, sessionId)
      const [open, setOpen] = React.useState(false), [catalog, setCatalog] = React.useState(null)
      const [capability, setCapability] = React.useState(null)
      const [create, setCreate] = React.useState(false), [baseRef, setBaseRef] = React.useState('HEAD')
      const [environmentId, setEnvironmentId] = React.useState(''), [error, setError] = React.useState('')
      const root = React.useRef(null), queue = React.useRef(Promise.resolve())
      React.useLayoutEffect(() => {
        if (!open) return
        const popover = root.current?.querySelector('.wt-popover')
        if (!popover) return
        const position = () => {
          const anchor = root.current.getBoundingClientRect()
          const above = Math.max(0, anchor.top - 56)
          const below = Math.max(0, window.innerHeight - anchor.bottom - 24)
          const height = popover.scrollHeight + 2
          const upwards = above >= height || above >= below
          popover.style.bottom = upwards ? 'calc(100% + 10px)' : 'auto'
          popover.style.top = upwards ? 'auto' : 'calc(100% + 10px)'
          popover.style.maxHeight = Math.max(80, upwards ? above : below) + 'px'
        }
        position()
        window.addEventListener('resize', position)
        window.addEventListener('scroll', position, true)
        return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
      }, [open, create, catalog, error])
      React.useEffect(() => {
        setCatalog(null); setError(''); setOpen(false)
      }, [sessionId, directory])
      React.useEffect(() => {
        if (!sessionId) return
        const controller = new AbortController()
        call('capability', { sessionId }, controller.signal).then(value => {
          setCapability({ sessionId, directory, ...value })
          if (!value.available) setOpen(false)
        }).catch(() => { if (!controller.signal.aborted) setCapability({ sessionId, directory, available: false }) })
        return () => controller.abort()
      }, [sessionId, directory])
      React.useEffect(() => {
        if (!open || !sessionId) return
        const controller = new AbortController()
        call('catalog', { sessionId }, controller.signal).then(value => {
          setCatalog(value)
          setCreate(Boolean(value.environments.draft?.create))
          setBaseRef(value.environments.draft?.baseRef || 'HEAD')
          setEnvironmentId(value.environments.selectedId)
        }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
        return () => controller.abort()
      }, [open, sessionId, directory])
      React.useEffect(() => {
        if (!open) return
        const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
        const escape = event => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
      }, [open])
      function update(next) {
        setCreate(next.create); setBaseRef(next.baseRef); setEnvironmentId(next.environmentId); setError('')
        queue.current = queue.current.catch(() => {}).then(() => call('environment-select', {
          sessionId, kind: 'draft', id: next.environmentId, draft: { create: next.create, baseRef: next.baseRef },
        })).catch(cause => { setError(cause.message) })
      }
      if (!sessionId || capability?.sessionId !== sessionId || capability.directory !== directory || !capability.available) return null
      return h('div', { className: 'wt-hero', ref: root },
        h('button', { type: 'button', className: 'wt-trigger wt-gear', title: '新对话设置', 'aria-label': '新对话工作树与环境设置', 'aria-expanded': open, onClick: () => setOpen(value => !value) }, h(SettingsIcon, { name: 'settings' })),
        open ? h('div', { className: 'wt-popover', role: 'dialog', 'aria-label': '新对话工作树设置' },
          h('div', { className: 'wt-settings-group' },
            h('label', { className: 'wt-setting-row' },
              h('span', { className: 'wt-setting-label' }, h(SettingsIcon, { name: 'worktree' }), '新建工作树'),
              h('span', { className: 'wt-switch' }, h('input', { type: 'checkbox', role: 'switch', checked: create, disabled: !catalog, onChange: event => update({ create: event.target.checked, baseRef, environmentId }) }), h('span', { className: 'wt-switch-track', 'aria-hidden': true }))),
            h('label', { className: 'wt-setting-row', 'data-disabled': !create || !catalog },
              h('span', { className: 'wt-setting-label' }, h(SettingsIcon, { name: 'branch' }), '基础分支'),
              h('span', { className: 'wt-select-wrap' }, h('select', { value: baseRef, disabled: !create || !catalog, onChange: event => update({ create, baseRef: event.target.value, environmentId }) },
                h('option', { value: 'HEAD' }, '当前提交 (HEAD)'), ...(catalog?.branches || []).map(ref => h('option', { key: ref, value: ref }, ref))), h(SettingsIcon, { name: 'chevron' }))),
            h('label', { className: 'wt-setting-row' },
              h('span', { className: 'wt-setting-label' }, h(SettingsIcon, { name: 'environment' }), '环境'),
              h('span', { className: 'wt-select-wrap' }, h('select', { value: environmentId, disabled: !catalog, onChange: event => update({ create, baseRef, environmentId: event.target.value }) },
                h('option', { value: '' }, '无环境'), ...(catalog?.environments?.profiles || []).map(item => h('option', { key: item.id, value: item.id }, item.name))), h(SettingsIcon, { name: 'chevron' })))),
          !catalog && !error ? h('div', { className: 'wt-muted', role: 'status', style: { padding: '4px 6px' } }, '正在读取…') : null,
          error ? h('span', { className: 'wt-error', role: 'alert' }, error) : null,
          h('div', { className: 'wt-popover-footer' }, h('button', { className: 'wt-details', type: 'button', onClick: () => { setOpen(false); ctx.sidebarRight.openTabIn(sessionId, KIND) } }, '详细设置', h(SettingsIcon, { name: 'arrow' }))),
        ) : null,
      )
    }

    // Wrap the shipped turn-tail renderer so its own access and unavailable
    // checks still own the branch button; only the click destination changes.
    function installForkChoices(ctx) {
      const slots = ctx.slots, originalKey = Symbol.for('cordis.original')
      let patch = null, stopped = false, changing = false
      function restore() {
        if (!patch) return
        const { entry, descriptor, wrapper } = patch
        patch = null
        if (entry.component === wrapper) Object.defineProperty(entry, 'component', descriptor)
      }
      function invalidate() {
        const dispose = slots.register({ name: 'conversation.chat.node', key: 'worktree-control.invalidate', priority: 10000 }, () => null)
        dispose()
      }
      function reconcile() {
        if (stopped || changing) return
        changing = true
        try {
          const candidate = slots.entriesOfSlot('conversation.chat.node').find(entry => entry.options?.key === 'turn-tail')
          const entry = candidate?.[originalKey] ?? candidate
          if (patch && patch.entry === entry && entry.component === patch.wrapper) return
          restore()
          if (!entry) return
          if (entry.component?.$$typeof !== Symbol.for('react.memo') || typeof entry.inject !== 'function' || !entry.children) throw new Error('unsupported-turn-tail-entry')
          const descriptor = Object.getOwnPropertyDescriptor(entry, 'component')
          if (!descriptor || (!descriptor.writable && !descriptor.configurable)) throw new Error('unsupported-turn-tail-component')
          const NativeTail = entry.component
          function ForkChoiceTail(props) {
            const root = React.useRef(null)
            const [seq, setSeq] = React.useState(null)
            const [capability, setCapability] = React.useState(null)
            const [busy, setBusy] = React.useState(false)
            const [error, setError] = React.useState('')
            const [childId, setChildId] = React.useState(null)
            React.useEffect(() => {
              if (seq === null) return
              let active = true
              call('fork-capability', { sessionId: props.sessionId }).then(value => { if (active) setCapability(value) }, cause => {
                if (active) setCapability({ available: false, reason: cause.message })
              })
              return () => { active = false }
            }, [seq, props.sessionId])
            React.useEffect(() => {
              if (seq === null) return
              const outside = event => { if (!root.current?.contains(event.target) && !busy) setSeq(null) }
              const escape = event => { if (event.key === 'Escape' && !busy) setSeq(null) }
              document.addEventListener('pointerdown', outside)
              document.addEventListener('keydown', escape)
              return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
            }, [seq, busy])
            async function forkInWorktree() {
              if (busy || seq === null || !capability?.available) return
              setBusy(true); setError(''); setChildId(null)
              let createdId = null
              try {
                createdId = await ctx.sessions.fork({ sessionId: props.sessionId, atSeq: seq, increaseTitle: true })
                setChildId(createdId)
                await call('create', { sessionId: createdId, sourceSessionId: props.sessionId, forkAtSeq: seq, baseRef: 'HEAD', includeChanges: true, runSetup: false })
                await ctx.uiWorkspace.openSession(createdId)
                setSeq(null)
              } catch (cause) {
                setError((createdId ? '对话已创建，但工作树未完成：' : '创建分支失败：') + String(cause?.message ?? cause))
              } finally { setBusy(false) }
            }
            return h('div', { ref: root, className: 'wt-fork-anchor' },
              h(NativeTail, { ...props, forkAt: at => { setSeq(at); setCapability(null); setError(''); setChildId(null) } }),
              seq === null ? null : h('div', { className: 'wt-fork-menu', role: 'dialog', 'aria-label': '从这里创建对话分支' },
                h('strong', null, '从这里创建对话分支'),
                h('button', { type: 'button', className: 'wt-fork-option', disabled: busy, onClick: () => { setSeq(null); props.forkAt(seq) } }, '在当前工作区中创建分支', h('small', null, '从这条回复继续，沿用当前工作目录')),
                h('button', { type: 'button', className: 'wt-fork-option', disabled: busy || !capability?.available, onClick: forkInWorktree }, '在新工作树中创建分支', h('small', null, capability === null ? '正在检查 Git 工作区…' : capability.available ? '立即创建工作树，复制当前未提交改动' : capability.reason)),
                error ? h('p', { className: 'wt-error', role: 'alert' }, error) : null,
                childId && error ? h('button', { type: 'button', className: 'wt-fork-option', onClick: () => { void ctx.uiWorkspace.openSession(childId); setSeq(null) } }, '打开已创建的对话') : null,
              ),
            )
          }
          Object.defineProperty(entry, 'component', { ...descriptor, value: ForkChoiceTail })
          patch = { entry, descriptor, wrapper: ForkChoiceTail }
          invalidate()
        } catch (cause) { console.warn('worktree-control: fork choices unavailable', cause) }
        finally { changing = false }
      }
      return slots.inject('conversation.chat.node', () => {
        const unsubscribe = slots.subscribe('conversation.chat.node', reconcile)
        reconcile()
        return () => { stopped = true; unsubscribe(); changing = true; try { restore(); invalidate() } finally { changing = false } }
      })
    }

    // The shipped Open In App control and dsh-git-branch-manage both read the
    // immutable session-list cwd. Keep their actions and menus, but supply the
    // live working directory after a conversation moves to a worktree.
    function mirrorDirectorySlot(ctx, slot, id) {
      const slots = ctx.slots
      let source, dispose = null, queued = false, stopped = false
      function CurrentDirectoryControl(props) {
        const directory = props.useProjection('workingDirectory')
        const useSessions = React.useCallback((selector, equal) => props.useSessions(snapshot => {
          const summary = snapshot.byId[props.sessionId]
          if (typeof directory !== 'string' || !summary || summary.cwd === directory) return selector(snapshot)
          return selector({ ...snapshot, byId: { ...snapshot.byId, [props.sessionId]: { ...summary, cwd: directory } } })
        }, equal), [props.useSessions, props.sessionId, directory])
        return source ? h(source.component, { ...props, useSessions }) : null
      }
      function reconcile() {
        const next = slots.entries(slot).find(entry => entry.options.id === id && entry.component !== CurrentDirectoryControl)
        if (next === source) return
        dispose?.()
        dispose = null
        source = next
        if (!next) return
        const options = { name: slot, id, order: next.options.order ?? 0, priority: -100,
          ...(next.locale ? { locale: next.locale } : {}),
          ...(next.inject ? { inject: next.inject } : {}) }
        dispose = slots.register(options, CurrentDirectoryControl)
      }
      function schedule() {
        if (queued || stopped) return
        queued = true
        queueMicrotask(() => { queued = false; if (!stopped) reconcile() })
      }
      const unsubscribe = slots.subscribe(slot, schedule)
      reconcile()
      return () => { stopped = true; unsubscribe(); dispose?.() }
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => installEnvironmentTerminals(ctx), 'worktree-control: terminal jobs')
        ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'dsh-asuta-worktree-control'; style.textContent = CSS; document.head.appendChild(style); return () => style.remove() }, 'worktree-control: styles')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID, kind: KIND, patterns: ['sidebar://worktree-control', 'sidebar://worktree-control/**'], title: () => '工作树',
          guide: [{ id: 'new', order: 43, title: () => '工作树', description: () => '创建、切换、快照和恢复 Git 工作树' }],
        }), 'worktree-control: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, props => h(Panel, { ...props, ctx }))), 'worktree-control: panel')
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'worktree-control.hero', order: 25 }, props => h(HeroSettings, { ...props, ctx }))), 'worktree-control: hero settings')
        ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({ name: 'sidebar.workspaces.session.row.action', id: 'worktree-control.badge', order: 900 }, props => h(RowBadge, { ...props, ctx }))), 'worktree-control: sidebar badges')
        ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => mirrorDirectorySlot(ctx, 'conversation.session.header.utilities', 'open-in-app')), 'worktree-control: current folder')
        ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'worktree-control.commands', order: -7 }, props => h(CommandMenuPlacement, { ...props, ctx }))), 'worktree-control: environment commands')
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => mirrorDirectorySlot(ctx, 'conversation.input.left', 'git-worktree')), 'worktree-control: current branch')
        ctx.effect(() => installForkChoices(ctx), 'worktree-control: fork choices')
      },
    }
  },
})
