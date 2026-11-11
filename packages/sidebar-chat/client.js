/**
 * Side chat (browser half).
 *
 * Each entry starts an isolated Agent seeded from the current conversation.
 * Tabs use the native conversation UI and archive their session when closed.
 */
window.__ModuleLoader__.load({
  id: 'dsh-asuta-sidebar-chat',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let primitives = {}
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') || {} } catch {}

    /** One native glyph by export name; absent glyphs render nothing. */
    function PIcon({ name, size }) {
      const Glyph = name ? primitives[name] : undefined
      return typeof Glyph === 'function' || (Glyph && typeof Glyph === 'object') ? h(Glyph, size ? { size } : {}) : null
    }

    const NS = 'sidebarChat'
    const TAB_ID = 'dsh-asuta-sidebar-chat/sidebar-chat'
    const TAB_KIND = 'sidebar-chat'
    const THREAD_ADDRESS = 'dsh-resource://sidebar-chat/thread/'
    const MANAGER_ADDRESS = 'dsh-resource://sidebar-chat/manage/'
    const detachedThreads = new Set()
    function managerAddress(parentId) { return MANAGER_ADDRESS + encodeURIComponent(parentId) }

    function threadAddress(parentSessionId, childId, title) {
      const query = new URLSearchParams({ parentSessionId, childId, title: title || 'Side chat' })
      return THREAD_ADDRESS + encodeURIComponent(parentSessionId) + '/' + encodeURIComponent(childId) + '?' + query
    }

    function threadParams(tab) {
      const address = tab?.contentId
      const manager = parseManagerAddress(address)
      if (manager !== undefined) return manager
      const parsed = parseThreadAddress(address)
      if (parsed !== undefined) return parsed
      return tab?.navigation?.params || {}
    }

    function parseManagerAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(MANAGER_ADDRESS)) return undefined
      try {
        const parentSessionId = decodeURIComponent(address.slice(MANAGER_ADDRESS.length))
        if (parentSessionId) return { parentSessionId, manager: true }
      } catch {}
      return undefined
    }

    /** One thread address as its two session ids; undefined for anything else. */
    function parseThreadAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(THREAD_ADDRESS)) return undefined
      try {
        const url = new URL(address)
        const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent)
        const parentSessionId = url.searchParams.get('parentSessionId') || parts[0]
        const childId = url.searchParams.get('childId') || parts[1]
        if (typeof parentSessionId === 'string' && parentSessionId !== ''
          && typeof childId === 'string' && childId !== '') {
          return { parentSessionId, childId, title: url.searchParams.get('title') || '' }
        }
      } catch {}
      return undefined
    }
    const en = {
      button: 'Side chat',
      title: 'Side chat',
      hint: 'Runs in the right sidebar with this conversation as context. It never posts back to the main conversation.',
      placeholder: 'Ask something here…',
      start: 'Start',
      starting: 'Starting…',
      empty: 'No side chats yet',
      newThread: 'New side chat',
      failed: 'Could not start the side chat',
      prefillFailed: 'Could not add the reference. Reopen this side chat to retry.',
      close: 'Close',
      invalidThread: 'This side conversation could not be opened.',
      composerPlaceholder: 'Continue the side chat, / for commands, @ for files',
      sectionAdd: 'Add',
      sectionCommands: 'Commands',
      sectionSkills: 'Skills',
      sectionEffort: 'Reasoning effort',
      noMatches: 'No matches',
      loadingOptions: 'Loading options…',
      commandsAria: 'Commands',
      fileLabel: 'File',
      fileDescription: 'Reference a workspace file',
      modelDescription: 'Choose the model for this side chat',
      userOnly: 'Manual only',
      providerDefault: 'Default',
      permissionAria: 'Permission',
      branchAria: 'Current branch',
      confirmFull: 'Full access lets this side chat skip confirmation steps and run sensitive operations, file changes and external commands directly.',
      confirmAuto: 'Auto review runs without a sandbox; the same model reviews each tool call before it runs. Experimental.',
      enable: 'Enable',
      cancel: 'Cancel',
      dismiss: 'Dismiss',
      thinking: 'Thinking…',
      sending: 'Sending…',
      send: 'Send',
      stop: 'Stop',
      queued: 'Queued',
      removeQueued: 'Remove from queue',
      newThread: 'New side chat',
      save: 'Save as conversation',
      archived: 'Archive',
      archiveFailed: 'Could not archive the side chat. The tab has been reopened.',
      manage: 'Manage side chats', activeChats: 'Active', archivedChats: 'Archived',
      openChat: 'Open', restoreChat: 'Restore and open', detachChat: 'Convert to independent conversation',
      refreshChats: 'Refresh', noChats: 'No side chats in this group.',
      model: 'Model',
      tools: 'Tool activity',
      saved: 'Saved as a conversation.',
      opening: 'Opening side chat…',
      openMain: 'Open the main conversation before starting a side chat.',
      openIndependentFailed: 'Could not open the independent conversation. The side tab has been kept; try again.',
      detachedOpenFailed: 'Converted to an independent conversation, but opening it failed. The side tab has been kept; click Convert again to retry.',
      guideDescription: 'Continue this conversation in an independent sidebar thread.',
      legacyNote: 'This side conversation was created by an older version, so the native view cannot open it. Its transcript is shown below; you can carry it into a new side conversation and continue there.',
      legacyContinue: 'Continue in a new side chat',
      legacyEmpty: 'This side conversation has no readable messages.',
      legacyYou: 'Me: ',
      legacyAssistant: 'Assistant: ',
      legacySeed: 'Below is the transcript of an older side conversation. Continue from it:',
      showInherited: 'Show inherited history',
      hideInherited: 'Hide inherited history',
      historySetting: 'Hide inherited history in side chats',
      historySettingHint: 'Only changes what is shown. The model still receives the inherited context.',
    }
    const zh = {
      button: '侧边对话',
      title: '侧边对话',
      hint: '以当前对话为上下文，在右侧栏独立进行，不会把内容发回主对话。',
      placeholder: '想问点什么…',
      start: '开始',
      starting: '正在开启…',
      empty: '还没有侧边对话',
      newThread: '新开侧边对话',
      failed: '侧边对话没能开起来',
      prefillFailed: '引用未能加入输入框，请重新打开此侧边对话重试。',
      close: '关闭',
      invalidThread: '无法打开这条侧边对话。',
      composerPlaceholder: '继续侧边对话，/ 调用指令，@ 文件',
      sectionAdd: '添加',
      sectionCommands: '指令',
      sectionSkills: '技能',
      sectionEffort: '推理强度',
      noMatches: '无匹配项',
      loadingOptions: '正在加载选项…',
      commandsAria: '指令',
      fileLabel: '文件',
      fileDescription: '引用工作区文件',
      modelDescription: '选择本会话使用的模型',
      userOnly: '仅手动调用',
      providerDefault: '默认',
      permissionAria: '权限',
      branchAria: '当前分支',
      confirmFull: '启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。',
      confirmAuto: '自动审查不使用沙箱。每次工具调用前由与当前 agent 相同的模型进行审查。此功能仍属实验性。',
      enable: '启用',
      cancel: '取消',
      dismiss: '关闭',
      thinking: '正在思考…',
      sending: '正在发送…',
      send: '发送',
      stop: '停止',
      queued: '排队中',
      removeQueued: '从队列移除',
      newThread: '新开侧边对话',
      save: '保存为会话',
      archived: '归档',
      archiveFailed: '侧边对话归档失败，已重新打开标签。',
      manage: '管理侧边对话', activeChats: '活动', archivedChats: '已归档',
      openChat: '打开', restoreChat: '恢复并打开', detachChat: '转为独立会话',
      refreshChats: '刷新', noChats: '还没有侧边对话。',
      model: '模型',
      tools: '工具活动',
      saved: '已保存为会话。',
      opening: '正在打开侧边对话…',
      openMain: '请先打开主对话，再从这里开启侧边对话。',
      openIndependentFailed: '未能打开独立会话，已保留侧边标签，请重试。',
      detachedOpenFailed: '已转为独立会话，但打开失败。已保留侧边标签，可再次点击“转为独立会话”重试。',
      guideDescription: '在右侧栏独立继续当前对话，不回写主对话。',
      legacyNote: '这条侧边对话由旧版本创建，原生视图无法直接打开。下面是它的历史记录，可以带进一条新的侧边对话继续。',
      legacyContinue: '在新侧边对话中继续',
      legacyEmpty: '这条侧边对话没有可显示的消息。',
      legacyYou: '我：',
      legacyAssistant: '助手：',
      legacySeed: '下面是之前一条侧边对话的记录，请在此基础上继续：',
      showInherited: '显示继承历史',
      hideInherited: '收起继承历史',
      historySetting: '隐藏侧边对话继承的历史消息',
      historySettingHint: '仅影响界面显示，模型仍可使用继承的上下文。',
    }

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

    async function call(method, payload) {
      const response = await fetch('/sidebar-chat/api/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error('HTTP ' + response.status)
      }
      if (!body || body.ok !== true) {
        throw new Error(body?.error?.message || ('HTTP ' + response.status))
      }
      return body.value
    }

    const THREADS_KEY = 'dsh-sidebar-chat:v1:threads'
    const HISTORY_SETTING_KEY = 'dsh-sidebar-chat:v1:hide-inherited-history'
    const historySettingListeners = new Set()

    function readHideInheritedHistory() {
      try { return localStorage.getItem(HISTORY_SETTING_KEY) !== 'false' } catch { return true }
    }

    function setHideInheritedHistory(value) {
      localStorage.setItem(HISTORY_SETTING_KEY, String(Boolean(value)))
      for (const listener of historySettingListeners) listener()
    }

    function useHideInheritedHistory() {
      const [hidden, setHidden] = React.useState(readHideInheritedHistory)
      React.useEffect(() => {
        const sync = () => setHidden(readHideInheritedHistory())
        const storage = (event) => { if (event.key === HISTORY_SETTING_KEY) sync() }
        historySettingListeners.add(sync)
        window.addEventListener('storage', storage)
        sync()
        return () => { historySettingListeners.delete(sync); window.removeEventListener('storage', storage) }
      }, [])
      return hidden
    }

    /** Side threads that must not appear in the workspace session list. */
    const hiddenThreads = new Set()
    const visibilityListeners = new Set()
    let hiddenRevision = 0

    function readThreadIndex() {
      try {
        const parsed = JSON.parse(localStorage.getItem(THREADS_KEY) || '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function saveThread(parentId, row) {
      const index = readThreadIndex()
      const rows = Array.isArray(index[parentId]) ? index[parentId] : []
      index[parentId] = [row, ...rows.filter((item) => item && item.id !== row.id)].slice(0, 30)
      try { localStorage.setItem(THREADS_KEY, JSON.stringify(index)) } catch {}
      hideThread(row.id)
    }

    const archiveErrors = new Map()

    function markDetached(ids) {
      let changed = false
      const index = readThreadIndex()
      for (const id of ids) {
        if (typeof id !== 'string' || detachedThreads.has(id)) continue
        detachedThreads.add(id)
        hiddenThreads.delete(id)
        for (const parentId of Object.keys(index)) {
          if (Array.isArray(index[parentId])) index[parentId] = index[parentId].filter(row => row?.id !== id)
        }
        changed = true
      }
      if (changed) {
        try { localStorage.setItem(THREADS_KEY, JSON.stringify(index)) } catch {}
        hiddenRevision++; notifyVisibility()
      }
    }

    function installVisibilityEvents() {
      if (typeof EventSource !== 'function') return
      const stream = new EventSource('/sidebar-chat/api/visibility-events')
      stream.onmessage = event => {
        try { markDetached(JSON.parse(event.data).detachedIds || []) } catch {}
      }
      return () => stream.close()
    }

    /** rc.3 calls close handlers synchronously, before removing the tab. */
    function installCloseArchive(ctx, label) {
      const pending = new Map()
      let disposed = false
      const unregister = ctx.sidebarRight.registerCloseHandler(TAB_KIND, (ownerId, tab) => {
        const params = threadParams(tab)
        if (!params.childId || !params.parentSessionId || pending.has(params.childId) || detachedThreads.has(params.childId)) return
        archiveErrors.delete(params.childId)
        // The host does not await this promise. Start the archive here; on
        // failure restore the tab in its owning session and expose the error.
        const task = Promise.resolve().then(async () => {
          // The host serializes this check with detach, including other clients.
          const value = await call('close', { parentSessionId: params.parentSessionId, childId: params.childId })
          if (value.detached) markDetached([params.childId])
          const index = readThreadIndex()
          if (Array.isArray(index[params.parentSessionId])) {
            index[params.parentSessionId] = index[params.parentSessionId].filter(row => row?.id !== params.childId)
            try { localStorage.setItem(THREADS_KEY, JSON.stringify(index)) } catch {}
          }
          clearPrefill(params.childId)
        }).catch(error => {
          if (disposed) return
          const message = label('archiveFailed') + ' ' + String(error?.message || error)
          archiveErrors.set(params.childId, message)
          ctx.sidebarRight.openResourceIn(ownerId, tab.contentId)
          window.dispatchEvent(new CustomEvent('dsh-sidebar-chat:archive-error', {
            detail: { childId: params.childId, message },
          }))
        }).finally(() => { pending.delete(params.childId) })
        pending.set(params.childId, task)
      })
      return () => { disposed = true; unregister(); archiveErrors.clear() }
    }

    function hideThread(id) {
      if (typeof id !== 'string' || id === '' || hiddenThreads.has(id) || detachedThreads.has(id)) return
      hiddenThreads.add(id)
      hiddenRevision += 1
      for (const listener of visibilityListeners) listener()
    }
    function notifyVisibility() { for (const listener of visibilityListeners) listener() }

    /**
     * Keep side threads out of the workspace session list without touching the
     * session itself. The host hides `origin: 'subagent'` rows but refuses to
     * retain a thread without a subagent descriptor, and archiving a thread
     * blocks its composer, so the filter lives in the client-side list view.
     */
    function installWorkspaceFilter(ctx) {
      const sessions = ctx.get('sessions')
      const list = sessions?.list
      if (!list || typeof list.getSnapshot !== 'function') return
      const snapshotDescriptor = Object.getOwnPropertyDescriptor(list, 'getSnapshot')
      const subscribeDescriptor = Object.getOwnPropertyDescriptor(list, 'subscribe')
      const original = list.getSnapshot.bind(list)
      const subscribe = list.subscribe.bind(list)
      const checkedIds = new Set()
      let stopped = false
      let scanning = false
      let scanAgain = false
      const scan = async () => {
        if (stopped) return
        if (scanning) { scanAgain = true; return }
        scanning = true
        const candidates = Object.values(original()?.byId ?? {}).filter(row =>
          typeof row?.id === 'string' && row.origin !== 'subagent'
          && typeof row.parentId === 'string'
          && !checkedIds.has(row.id)).map(row => row.id)
        try {
          for (let offset = 0; offset < candidates.length && !stopped; offset += 100) {
            const value = await call('visibility', { ids: candidates.slice(offset, offset + 100) })
            if (stopped) break
            for (const id of value.checkedIds) checkedIds.add(id)
            markDetached(value.detachedIds || [])
            for (const id of value.hiddenIds) hideThread(id)
          }
        } catch (error) {
          console.warn('sidebar-chat: workspace visibility:', error)
        } finally {
          scanning = false
          if (scanAgain) { scanAgain = false; void scan() }
        }
      }
      let lastSource = null
      let lastRevision = -1
      let lastResult = null
      const getSnapshot = () => {
        const snapshot = original()
        if (snapshot === lastSource && hiddenRevision === lastRevision) return lastResult
        lastSource = snapshot
        lastRevision = hiddenRevision
        let byId = snapshot?.byId
        if (byId === null || typeof byId !== 'object') {
          lastResult = snapshot
          return snapshot
        }
        let copied = false
        for (const id of hiddenThreads) {
          const summary = byId[id]
          if (summary === undefined || summary.origin === 'subagent') continue
          if (!copied) {
            byId = { ...byId }
            copied = true
          }
          byId[id] = { ...summary, origin: 'subagent' }
        }
        lastResult = copied ? { ...snapshot, byId } : snapshot
        return lastResult
      }
      // ui-session has already shared this exact source with the root hooks.
      // Replacing sessions.list would leave useSessions reading the old source.
      list.getSnapshot = getSnapshot
      const subscribeVisibility = (listener) => {
        visibilityListeners.add(listener)
        const stop = subscribe(listener)
        return () => { visibilityListeners.delete(listener); stop() }
      }
      list.subscribe = subscribeVisibility
      const stopScan = subscribe(() => { void scan() })
      void scan()
      return () => {
        stopped = true
        stopScan()
        if (list.getSnapshot === getSnapshot) {
          if (snapshotDescriptor) Object.defineProperty(list, 'getSnapshot', snapshotDescriptor)
          else delete list.getSnapshot
        }
        if (list.subscribe === subscribeVisibility) {
          if (subscribeDescriptor) Object.defineProperty(list, 'subscribe', subscribeDescriptor)
          else delete list.subscribe
        }
        for (const listener of visibilityListeners) listener()
        visibilityListeners.clear()
      }
    }

    /**
     * Create a native session; visibility is handled only in the list source.
     */
    async function createThread(ctx, parentSessionId, question = '') {
      const value = await call('new', {
        parentSessionId,
        question: typeof question === 'string' ? question : '',
        locale: navigator.language,
      })
      return value
    }

    /*
     * Prefill: other plugins (selection-quote) can hand a thread's composer a
     * draft. Texts wait here until that thread's Composer mounts, so opening a
     * tab and prefilling it in one go never loses the text.
     */
    const prefillQueue = new Map()
    const prefillListeners = new Set()

    function queuePrefill(childId, text) {
      const reference = text && typeof text === 'object' && typeof text.source === 'string'
        && typeof text.ref === 'string' && typeof text.clipboardText === 'string' && typeof text.label === 'string'
      if (typeof childId !== 'string' || childId === '' || (!reference && (typeof text !== 'string' || text.trim() === ''))) return false
      if (reference) text = { ...text }
      const list = prefillQueue.get(childId) || []
      if (!list.some(item => reference ? item?.source === text.source && item.ref === text.ref : item === text)) list.push(text)
      prefillQueue.set(childId, list)
      for (const listener of [...prefillListeners]) listener(childId)
      return true
    }

    /** The queued text for one thread, left in place until it reaches the composer. */
    function peekPrefill(childId) {
      const list = prefillQueue.get(childId) || []
      return list[0]
    }

    function clearPrefill(childId) {
      const list = prefillQueue.get(childId)
      list?.shift()
      if (!list?.length) prefillQueue.delete(childId)
    }

    function useSnapshot(observable) {
      const [value, setValue] = React.useState(() => observable?.getSnapshot?.())
      React.useEffect(() => {
        if (!observable || typeof observable.subscribe !== 'function') return undefined
        const notify = () => { setValue(observable.getSnapshot()) }
        const off = observable.subscribe(notify)
        notify()
        return typeof off === 'function' ? off : () => {}
      }, [observable])
      return value
    }

    /** Hide only nodes from the seeded prefix, leaving the native chat and session untouched. */
    function syncInheritedRows(root, binding, chat, boundarySeq) {
      const entries = binding.eventSource.getSnapshot().entries || []
      const nodes = chat.getSnapshot().nodes
      const turnLastSeq = new Map()
      let currentTurn
      for (const entry of entries) {
        const event = entry.event
        if (event.type === 'turn/start') currentTurn = event.data?.turn
        const turn = Number.isSafeInteger(event.data?.turn) ? event.data.turn : currentTurn
        if (Number.isSafeInteger(turn) && Number.isSafeInteger(event.seq)) turnLastSeq.set(turn, event.seq)
        if (event.type === 'turn/end') currentTurn = undefined
      }
      for (const row of root.querySelectorAll('[data-chat-node-key], [data-chat-group-key]')) {
        const nodeKey = row.getAttribute('data-chat-node-key')
        const node = nodeKey === null ? undefined : nodes.get(nodeKey)
        const turnAttribute = row.getAttribute('data-chat-turn')
        const rowTurn = turnAttribute !== null && /^\d+$/.test(turnAttribute) ? Number(turnAttribute) : undefined
        const turn = Number.isSafeInteger(node?.data?.turn) ? node.data.turn : rowTurn
        const lastSeq = turnLastSeq.get(turn)
        const aggregate = node?.kind === 'assistant-step' || node?.kind === 'turn-process' || node?.kind === 'turn-tail'
        const inherited = aggregate || nodeKey === null
          ? Number.isSafeInteger(lastSeq) && lastSeq <= boundarySeq
          : Number.isSafeInteger(node?.data?.seq) && node.data.seq <= boundarySeq
        row.toggleAttribute('data-dshc-inherited-history', inherited)
      }
    }

    function HistorySetting({ t }) {
      const label = translator(t)
      const hidden = useHideInheritedHistory()
      const [error, setError] = React.useState('')
      return h('div', { className: 'dshc-history-setting', 'data-plugin': 'dsh-asuta-sidebar-chat' },
        h('label', { className: 'dshc-history-setting-row' },
          h('span', null, label('historySetting')),
          h('input', { type: 'checkbox', checked: hidden, onChange: event => {
            try { setHideInheritedHistory(event.target.checked); setError('') }
            catch (cause) { setError(String(cause?.message || cause)) }
          } })),
        h('p', null, label('historySettingHint')),
        error ? h('p', { role: 'alert' }, error) : null)
    }

    const CSS = `

      .dshc-pop { position: fixed; z-index: 80; width: 348px; max-width: calc(100vw - 24px); padding: 14px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family), system-ui, sans-serif; box-shadow: var(--dsw-shadow-lv2); }
      .dshc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .dshc-title { font-size: 13px; font-weight: 600; }
      .dshc-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
      .dshc-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
      .dshc-input { width: 100%; min-height: 74px; max-height: 180px; padding: 9px 11px; box-sizing: border-box; resize: vertical; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.55; }
      .dshc-input:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      .dshc-hint { margin: 7px 2px 10px; font-size: 11.5px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
      .dshc-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
      .dshc-error { margin: 8px 2px 0; font-size: 12px; color: #e0695f; }
      .dshc-primary { height: 30px; padding: 0 14px; border: none; border-radius: 999px; background: #3568d4; color: #fff; font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; }
      .dshc-primary:hover { background: #2c59b8; }
      .dshc-primary:disabled { opacity: 0.55; cursor: default; }
      .dshc-list { display: flex; flex-direction: column; gap: 2px; max-height: 190px; overflow: auto; }
      .dshc-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; box-sizing: border-box; border: none; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
      .dshc-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
      .dshc-row-icon { flex: none; display: inline-flex; color: var(--dsw-alias-label-tertiary); }
      .dshc-row-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dshc-empty { padding: 6px 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      .dshc-pane { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family), system-ui, sans-serif; }
      .dshc-transcript { flex: 1; min-height: 0; overflow: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; gap: 12px; }
      .dshc-message { max-width: 94%; padding: 9px 11px; border-radius: 12px; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
      .dshc-message-user { align-self: flex-end; padding: 8px 14px; border-radius: 16px; background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2)); }
      .dshc-message-command { align-self: stretch; max-width: none; padding: 0 2px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.55; }
      .dshc-message-command code { padding: 1px 5px; border-radius: 5px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font: 11.5px ui-monospace, monospace; }
      .dshc-message-command[data-status="error"] .dshc-command-result { color: #e0695f; }
      .dshc-message-assistant { align-self: flex-start; background: transparent; padding-left: 2px; }
      .dshc-message-live { color: var(--dsw-alias-label-secondary); }
      .dshc-message-tool { align-self: stretch; max-width: none; padding: 0; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
      .dshc-message-tool summary { cursor: pointer; padding: 5px 8px; }
      .dshc-message-tool pre { max-height: 160px; overflow: auto; margin: 0; padding: 8px; background: var(--dsw-alias-bg-layer-1); border-radius: 8px; white-space: pre-wrap; }
      .dshc-message-error, .dshc-pane-error { color: #e0695f; font-size: 12px; }
      .dshc-thinking { color: var(--dsw-alias-label-tertiary); font-size: 12px; padding: 4px 2px; }
      .dshc-composer { flex: none; position: relative; padding: 4px 10px 10px; }
      .dshc-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 6px; padding: 4px 8px; border-radius: var(--dsw-radius-md, 8px); background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .dshc-notice[data-kind="error"] { color: #e0695f; }
      .dshc-notice button { flex: none; margin-left: auto; padding: 0 2px; border: none; background: transparent; color: inherit; font-size: 14px; line-height: 18px; cursor: pointer; }
      .dshc-legacy { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; padding: 14px 14px 18px; overflow: auto; }
      .dshc-legacy-note { padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
      .dshc-legacy-list { display: flex; flex-direction: column; gap: 8px; }
      .dshc-legacy-row { padding: 8px 11px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
      .dshc-legacy-row[data-kind="user"] { background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2)); }
      .dshc-legacy > .dshc-primary { align-self: flex-start; }
      .dshc-card { position: relative; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; width: 100%; padding-top: 8px; border-radius: var(--dsw-radius-panel, 20px); background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2)); box-shadow: var(--dsw-elevation-soft, var(--dsw-shadow-lv2, none)); --dsw-elevation-stroke-color: var(--dsw-alias-border-l2); font-size: var(--dsh-content-font-size, 14px); line-height: calc(24px + var(--dsh-content-font-delta, 0px)); }
      .dshc-scroll { max-height: 180px; margin-right: 4px; overflow-y: auto; }
      .dshc-cinput { display: block; width: 100%; min-height: 36px; box-sizing: border-box; margin: 0; padding: 4px 8px 0 14px; resize: none; overflow: hidden; border: 0; outline: none; background: transparent; color: var(--dsw-alias-label-primary); caret-color: var(--dsw-alias-state-business-primary, currentColor); font-family: var(--dsw-font-family), system-ui, sans-serif; font-size: inherit; line-height: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
      .dshc-cinput::placeholder { color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary)); }
      .dshc-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 2px 8px 6px; }
      .dshc-tools, .dshc-trailing { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .dshc-trailing { flex: 0 1 auto; margin-left: auto; }
      .dshc-add { flex: none; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: none; border-radius: 999px; background: var(--dsw-specific-selector, var(--dsw-alias-interactive-bg-hover)); color: var(--dsw-alias-label-primary); cursor: pointer; }
      .dshc-add:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover)); }
      .dshc-add:disabled { opacity: .5; cursor: default; }
      .dshc-chip { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 190px; height: 28px; padding: 0 6px; border: none; border-radius: var(--dsw-radius-sm, 6px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; }
      .dshc-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .dshc-chip:disabled { opacity: .5; cursor: default; }
      .dshc-chip-static, .dshc-chip-static:hover:not(:disabled) { background: transparent; cursor: default; }
      .dshc-chip svg { flex: none; }
      .dshc-chip-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .dshc-chip-effort { flex: none; color: var(--dsw-alias-label-tertiary); font-weight: 400; }
      .dshc-send { flex: none; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: none; border-radius: 999px; background: var(--dsw-alias-button-info-fill, #3568d4); color: #fff; cursor: pointer; transform: translateY(-2px); transition: background-color .1s; }
      .dshc-send:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #2c59b8); }
      .dshc-send:disabled { opacity: .4; cursor: default; }
      .dshc-menu, .dshc-popmenu { position: absolute; z-index: 30; bottom: calc(100% + 4px); box-sizing: border-box; display: flex; flex-direction: column; max-height: 360px; padding: 4px; overflow: hidden; border-radius: 16px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2)); -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(24px)); backdrop-filter: var(--dsw-menu-backdrop-filter, blur(24px)); box-shadow: var(--dsw-elevation-prominent, var(--dsw-shadow-lv2, none)); --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); }
      .dshc-menu { left: 0; right: 0; }
      .dshc-popmenu { min-width: 210px; max-width: calc(100% - 8px); border-radius: 12px; }
      .dshc-popmenu[data-side="left"] { left: 4px; }
      .dshc-popmenu[data-side="right"] { right: 4px; }
      .dshc-menu-viewport { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
      .dshc-menu-section { flex: none; min-height: 23px; box-sizing: border-box; padding: 5px 8px 2px; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-weight: 500; line-height: 16px; }
      .dshc-menu-section:not(:first-child) { margin-top: 3px; }
      .dshc-menu-item { flex: none; display: flex; align-items: center; gap: 6px; width: 100%; min-height: 34px; box-sizing: border-box; padding: 6px 8px; border: none; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
      .dshc-menu-item[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
      .dshc-menu-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; color: var(--dsw-alias-menu-icon, var(--dsw-alias-label-tertiary)); }
      .dshc-menu-icon svg { width: 14px; height: 14px; }
      .dshc-menu-name { flex: none; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dshc-menu-alias { flex: none; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
      .dshc-menu-desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
      .dshc-menu-check { flex: none; margin-left: auto; display: inline-flex; color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
      .dshc-menu-empty { padding: 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .dshc-secondary { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
      .dshc-toolbar { display: flex; align-items: center; gap: 5px; padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dshc-embedded-body { display: flex; flex: 1; min-height: 0; }
      .dshc-embedded-body > * { flex: 1; min-width: 0; min-height: 0; }
      .dshc-embedded-status { padding: 18px 14px; color: var(--dsw-alias-label-tertiary); font-size: 12.5px; }
      .dshc-embedded-body [data-dshc-inherited-history] { display: none !important; }
      .dshc-history-setting { padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
      .dshc-history-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; cursor: pointer; }
      .dshc-history-setting-row input { width: 18px; height: 18px; accent-color: var(--dsw-alias-brand-primary); }
      .dshc-history-setting p { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .dshc-pane-error { padding: 8px 12px; }
      .dshc-note { padding: 6px 12px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
      .dshc-tool { height: 27px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; cursor: pointer; }
      .dshc-tool:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
      .dshc-tool:disabled { opacity: .45; cursor: default; }
      .dshc-note { padding: 5px 12px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
      .dshc-pending { align-self: flex-end; max-width: 94%; padding: 8px 10px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
      .dshc-pending-head { display: flex; align-items: center; gap: 6px; margin-top: 5px; color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
      .dshc-pending-head button { margin-left: auto; padding: 0; border: none; background: transparent; color: inherit; font-size: 14px; cursor: pointer; }
      .dshc-md { white-space: normal; }
      .dshc-md p { margin: 0 0 8px; white-space: pre-wrap; }
      .dshc-md p:last-child { margin-bottom: 0; }
      .dshc-md pre { max-width: 100%; overflow: auto; margin: 7px 0; padding: 8px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); font: 11.5px/1.55 ui-monospace, monospace; white-space: pre; }
      .dshc-md code { padding: 1px 4px; border-radius: 4px; background: var(--dsw-alias-bg-layer-1); font: 11.5px ui-monospace, monospace; }
      .dshc-md a { color: var(--dsw-alias-brand-primary); text-decoration: underline; }
      .dshc-md ul, .dshc-md ol { margin: 4px 0 8px; padding-left: 20px; }
      .dshc-md h1, .dshc-md h2, .dshc-md h3 { margin: 7px 0 5px; font-size: 14px; }
      .dshc-md blockquote { margin: 6px 0; padding-left: 8px; border-left: 2px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
      .dshc-tool-row { align-self: stretch; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
      .dshc-tool-row summary { padding: 5px 8px; cursor: pointer; }
      .dshc-tool-row pre { max-height: 160px; overflow: auto; margin: 0; padding: 8px; background: var(--dsw-alias-bg-layer-1); border-radius: 8px; white-space: pre-wrap; }
      .dshc-conn { padding: 6px 12px; color: #d08a2e; font-size: 11.5px; }
      .dshc-menu-row { display: flex; gap: 6px; align-items: center; padding: 4px 12px 8px; }
      .dshc-menu-row select { min-width: 0; flex: 1; height: 28px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; }
      .dshc-launcher { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 28px; color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-family), system-ui, sans-serif; text-align: center; }
      .dshc-launcher-icon { color: var(--dsw-alias-label-tertiary); }
      .dshc-launcher-title { color: var(--dsw-alias-label-primary); font-size: 13.5px; font-weight: 600; }
      .dshc-launcher-hint { max-width: 260px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); }
      .dshc-launcher-error { max-width: 280px; font-size: 12px; line-height: 1.55; color: #e0695f; }
      .dshc-manager { padding: 14px; overflow: auto; flex: 1; color: var(--dsw-alias-label-primary); }
      .dshc-manager h3 { font-size: 13px; margin: 20px 0 8px; color: var(--dsw-alias-label-secondary); }
      .dshc-manager-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dshc-manager-row > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    `

    function ChatIcon({ size }) {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } },
        h('path', { d: 'M2.6 7.6a4.6 4.6 0 0 1 4.6-4.6h1.6a4.6 4.6 0 0 1 0 9.2H6.2l-2.4 2v-2.5a4.6 4.6 0 0 1-1.2-4.1z' }),
        h('path', { d: 'M5.6 6.5h4.8M5.6 8.9h3.2' }),
      )
    }

    function SideChatTitle({ useTabInfo, t }) {
      const { tab } = useTabInfo()
      const label = translator(t)
      if (typeof tab.contentId === 'string' && tab.contentId.startsWith('sidebar://' + TAB_KIND)) return label('button')
      const params = threadParams(tab)
      if (params.manager) return label('manage')
      const [, setRevision] = React.useState(0)
      React.useEffect(() => {
        const update = () => setRevision((value) => value + 1)
        window.addEventListener('dsh-sidebar-chat:title', update)
        return () => window.removeEventListener('dsh-sidebar-chat:title', update)
      }, [])
      const stored = (readThreadIndex()[params.parentSessionId] || []).find((row) => row?.id === params.childId)
      return stored?.title || params.title || tab.title || 'Side chat'
    }

    function SideChatLauncher({ ctx, t, tab }) {
      const label = translator(t)
      const sessionId = useSnapshot(ctx.sidebarRight?.mounted)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(true)
      const started = React.useRef(false)

      const openThread = React.useCallback(async (parentSessionId) => {
        setBusy(true)
        setError('')
        try {
          const { childId, title } = await createThread(ctx, parentSessionId, '')
          saveThread(parentSessionId, { id: childId, title, createdAt: Date.now() })
          ctx.sidebarRight.openResource(threadAddress(parentSessionId, childId, title || label('title')))
          setTimeout(() => {
            try { tab.actions.close() } catch {}
          }, 600)
        } catch (cause) {
          setBusy(false)
          setError(String(cause?.message || cause) === 'open the main conversation before starting a side chat'
            ? label('openMain')
            : String(cause?.message || cause))
        }
      }, [ctx, label, tab])

      React.useEffect(() => {
        if (started.current || !sessionId) return
        started.current = true
        void openThread(sessionId)
      }, [openThread, sessionId])

      return h('div', { className: 'dshc-launcher', 'data-plugin': 'dsh-asuta-sidebar-chat' },
        h('span', { className: 'dshc-launcher-icon' }, h(ChatIcon, { size: 34 })),
        h('div', { className: 'dshc-launcher-title' }, busy ? label('opening') : label('button')),
        error ? h('div', { className: 'dshc-launcher-error', role: 'alert' }, error) : null,
        error && sessionId
          ? h('button', { type: 'button', className: 'dshc-primary', onClick: () => { void openThread(sessionId) } }, label('button'))
          : null,
      )
    }

    /** Abort-aware wait that keeps one chat resource open for the pane's lifetime. */
    function waitForAbort(signal) {
      return new Promise((resolve) => {
        if (signal.aborted) { resolve(); return }
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
    }

    /** Chat resources for this tab kind: retain one side session for the pane. */
    function sideChatResourceProvider(sessions) {
      return {
        protocol: 'sidebar-chat',
        async *open(resourceAddress, { signal }) {
          const manager = parseManagerAddress(resourceAddress)
          if (manager !== undefined) {
            if (signal.aborted) return
            yield { ok: true, value: manager }
            await waitForAbort(signal)
            return
          }
          const params = parseThreadAddress(resourceAddress)
          if (params === undefined) throw new Error('sidebar-chat: invalid side chat address ' + JSON.stringify(resourceAddress))
          if (signal.aborted) return
          const reference = sessions.retain(
            params.childId,
            { source: 'sidebarChat', signal },
          )
          try {
            yield { ok: true, value: { ...params, reference } }
            await waitForAbort(signal)
          } finally {
            reference.release()
          }
        },
      }
    }

    /** Fixed Chat selection used by the embedded Conversation occurrence. */
    function FixedChatConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    /** The native conversation shell for one retained side session. */
    function SideChatConversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession((value) => value)
      const shellPhase = useConversation((value) => value).activeTargets.size > 0
        || (!session.blank && !session.awaitingFirstTurn) || session.running ? 'active'
        : session.promptAttempted ? 'engaging' : 'blank'
      const summaryBlank = useSessions((state) => state.byId[sessionId]?.blank)
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
      return renderFactorySlot('conversation.content', {
        variant: 'embedded',
        phase: settling ? 'settling' : hero ? 'hero' : 'active',
        hero,
      }, { slots: { views: FixedChatConversationView } })
    }

    /** Insert queued text into the native composer of one session. */
    function insertIntoComposer(ctx, sessionId, text) {
      let input = null
      try { input = ctx.get('conversation')?.input ?? null } catch { input = null }
      if (input === null || typeof input.shell !== 'function') return false
      let shell = null
      try { shell = input.shell(sessionId) } catch { shell = null }
      const actions = shell?.actions
      if (actions === null || actions === undefined || typeof actions.insertText !== 'function') return false
      try {
        const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : null
        if (text && typeof text === 'object') return shell.insertReference?.(text, span) === true
        return actions.insertText(text, span) === true
      } catch {
        return false
      }
    }

    /**
     * The side chat tab body: our own toolbar over the host's native
     * conversation shell, so streaming, steps, tools, usage, copy and branch
     * behave exactly like the main conversation.
     */
    function SideChatThreadBody({ ctx, t, tab, parentId, childId, boundarySeq, hideHistory, useResource, SessionProvider, renderSlot }) {
      const label = translator(t)
      const resource = useResource(tab.contentId)
      const bodyRef = React.useRef(null)

      React.useLayoutEffect(() => {
        const root = bodyRef.current
        if (!root) return undefined
        if (!hideHistory || !Number.isSafeInteger(boundarySeq)) return undefined
        let binding, chat
        try {
          binding = ctx.sessions.binding(childId)
          chat = ctx.uiConversation.binding(binding).target('chat')
        } catch { return undefined }
        const scan = () => syncInheritedRows(root, binding, chat, boundarySeq)
        const observer = new MutationObserver(scan)
        observer.observe(root, { childList: true, subtree: true })
        const offEvents = binding.eventSource.subscribe(scan)
        const offChat = chat.subscribe(scan)
        scan()
        return () => {
          observer.disconnect()
          offEvents?.()
          offChat?.()
          for (const row of root.querySelectorAll('[data-dshc-inherited-history]')) row.removeAttribute('data-dshc-inherited-history')
        }
      }, [ctx, childId, boundarySeq, hideHistory, resource.value])

      React.useEffect(() => {
        if (resource.value === undefined || !childId) return undefined
        let cancelled = false
        let attempts = 0
        let timer = null
        const flush = () => {
          if (cancelled) return
          const pendingText = peekPrefill(childId)
          if (pendingText === undefined) { clearInterval(timer); timer = null; attempts = 0; return }
          attempts += 1
          if (insertIntoComposer(ctx, childId, pendingText)) {
            clearPrefill(childId)
            attempts = 0
            return
          }
          if (attempts === 40) {
            clearInterval(timer); timer = null
            try { ctx.get('conversation')?.input?.shell(childId)?.notify('error', label('prefillFailed')) } catch {}
          }
        }
        const wake = id => {
          if (id !== childId || timer !== null) return
          attempts = 0
          timer = setInterval(flush, 120)
        }
        prefillListeners.add(wake)
        if (peekPrefill(childId) !== undefined) wake(childId)
        return () => { cancelled = true; clearInterval(timer); prefillListeners.delete(wake) }
      }, [ctx, childId, resource.value])

      // The native composer sends straight to the host, so this pane gives the
      // thread its durable title once its first own question lands. Polling
      // stops as soon as a real title is stored.
      React.useEffect(() => {
        if (!childId || !parentId) return undefined
        const stored = (readThreadIndex()[parentId] || []).find((row) => row?.id === childId)
        const placeholder = stored === undefined
          || stored.title === '' || stored.title === '新对话' || stored.title === 'New thread' || stored.title === label('title')
        if (!placeholder) return undefined
        let cancelled = false
        let done = false
        let pending = false
        const rename = async () => {
          if (cancelled || done || pending) return
          pending = true
          try {
            const value = await call('events', { parentSessionId: parentId, childId })
            if (cancelled || done) return
            const first = (value.rows || []).find((row) => row.kind === 'user' && typeof row.text === 'string' && row.text.trim() !== '')
            if (first === undefined) return
            const title = Array.from(first.text.replace(/\s+/g, ' ').trim()).slice(0, 44).join('')
            saveThread(parentId, { id: childId, title, createdAt: stored?.createdAt ?? Date.now() })
            done = true
            clearInterval(timer)
            window.dispatchEvent(new CustomEvent('dsh-sidebar-chat:title', { detail: { parentId, childId, title } }))
          } catch {} finally { pending = false }
        }
        const timer = setInterval(() => { void rename() }, 2000)
        void rename()
        return () => { cancelled = true; clearInterval(timer) }
      }, [childId, parentId])

      return resource.value === undefined
        ? h('div', { className: 'dshc-embedded-status' }, label('opening'))
        : h(SessionProvider, { session: resource.value.reference },
          h('div', { className: 'dshc-embedded-body', ref: bodyRef }, renderSlot('sidebar-chat.conversation', {})))
    }

    /**
     * A thread created before the native view existed. It is readable through
     * this plugin's own route but cannot be retained as a host session, so the
     * pane shows its transcript and offers to carry it into a fresh thread.
     */
    function LegacySideChat({ ctx, t, parentId, childId }) {
      const label = translator(t)
      const [rows, setRows] = React.useState([])
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let cancelled = false
        call('events', { parentSessionId: parentId, childId })
          .then((value) => { if (!cancelled) setRows(Array.isArray(value?.rows) ? value.rows : []) })
          .catch((cause) => { if (!cancelled) setError(String(cause?.message || cause)) })
        return () => { cancelled = true }
      }, [parentId, childId])

      const carryOver = async () => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const transcript = rows
            .map((row) => row.kind === 'user' ? label('legacyYou') + row.text
              : row.kind === 'assistant' ? label('legacyAssistant') + row.text : '')
            .filter((line) => line !== '')
            .join('\n\n')
          const question = transcript === '' ? '' : label('legacySeed') + '\n\n' + transcript
          const value = await createThread(ctx, parentId, question)
          saveThread(parentId, { id: value.childId, title: value.title, createdAt: Date.now() })
          ctx.sidebarRight.openResource(threadAddress(parentId, value.childId, value.title))
        } catch (cause) {
          setError(String(cause?.message || cause))
        } finally {
          setBusy(false)
        }
      }

      const shown = rows.filter((row) => row.kind === 'user' || row.kind === 'assistant').slice(-30)
      return h('div', { className: 'dshc-legacy' },
        h('div', { className: 'dshc-legacy-note' }, label('legacyNote')),
        error !== '' ? h('div', { className: 'dshc-pane-error', role: 'alert' }, error) : null,
        shown.length === 0
          ? h('div', { className: 'dshc-empty' }, label('legacyEmpty'))
          : h('div', { className: 'dshc-legacy-list' }, shown.map((row, index) => h('div', {
            key: String(index),
            className: 'dshc-legacy-row',
            'data-kind': row.kind,
          }, row.text))),
        h('button', {
          type: 'button',
          className: 'dshc-primary',
          disabled: busy,
          onClick: () => { void carryOver() },
        }, busy ? label('starting') : label('legacyContinue')),
      )
    }

    function SideChatManager({ ctx, t, parentId }) {
      const label = translator(t)
      const [rows, setRows] = React.useState([])
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const load = React.useCallback(async () => {
        setBusy(true); setError('')
        try { setRows((await call('list', { parentSessionId: parentId, locale: ctx.locale.getSnapshot?.().active || navigator.language })).threads) }
        catch (cause) { setError(String(cause?.message || cause)) } finally { setBusy(false) }
      }, [parentId])
      React.useEffect(() => { void load() }, [load])
      const open = async row => {
        setBusy(true); setError('')
        try {
          if (row.archived) await call('restore', { parentSessionId: parentId, childId: row.id })
          saveThread(parentId, { id: row.id, title: row.title, createdAt: row.createdAt })
          ctx.sidebarRight.openResource(threadAddress(parentId, row.id, row.title))
          await load()
        } catch (cause) { setError(String(cause?.message || cause)); setBusy(false) }
      }
      return h('div', { className: 'dshc-manager' },
        h('div', { className: 'dshc-toolbar' }, h('strong', null, label('manage')),
          h('button', { type: 'button', className: 'dshc-tool', disabled: busy, onClick: load }, label('refreshChats'))),
        error ? h('div', { role: 'alert', className: 'dshc-pane-error' }, error) : null,
        !rows.length && !busy ? h('p', null, label('noChats')) : null,
        ...[false, true].map(isArchived => h('section', { key: String(isArchived) },
          h('h3', null, label(isArchived ? 'archivedChats' : 'activeChats')),
          ...rows.filter(row => row.archived === isArchived).map(row => h('div', { key: row.id, className: 'dshc-manager-row' },
            h('span', null, row.title),
            h('button', { type: 'button', className: 'dshc-tool', disabled: busy, onClick: () => open(row) }, label(isArchived ? 'restoreChat' : 'openChat')),
          )),
        )),
      )
    }

    // Use the native persisted view, including rows hidden by the overflow limit.
    // Workspace membership alone does not update the browser's manual order.
    function positionDetached(ctx, parentId, childId, workspaceId) {
      return new Promise((resolve, reject) => {
        const stops = []
        let done = false, timer
        const finish = error => {
          if (done) return
          done = true
          window.clearTimeout(timer)
          for (const stop of stops) stop()
          error ? reject(error) : resolve()
        }
        const check = () => {
          if (done) return
          try {
            const workspaces = ctx.get('workspaces').list.getSnapshot()
            const list = ctx.sessions.list.getSnapshot()
            if (workspaces.phase !== 'ready' || list.phase !== 'ready' || !list.byId[childId]) return
            const owner = id => workspaces.items.find(item => item.sessionIds.includes(id))?.workspaceId ?? ''
            // The detach reply can precede the workspace stream, including a
            // legacy worktree repair. Wait for its confirmed destination.
            if (workspaceId !== undefined && owner(childId) !== (workspaceId ?? '')) return
            const pins = new Set(workspaces.pinnedSessionIds), archived = new Set(workspaces.archivedSessionIds)
            const parent = list.byId[parentId]
            if (!parent || parent.origin === 'subagent' || archived.has(parentId)
              || owner(parentId) !== owner(childId) || pins.has(parentId) !== pins.has(childId)) { finish(); return }
            const entry = ctx.slots.entries('sidebar.workspaces').find(item => item.store?.spec?.persist === 'dsh.workspace.view.v5')
            const store = entry?.store.create()
            const scopedUi = ctx.get('uiWorkspace')
            const ui = scopedUi?.[Symbol.for('cordis.original')] ?? scopedUi
            if (!store?.actions?.setSessionOrder || store.actions !== ui?.view) throw new Error('Sidebar ordering is unavailable')
            const view = store.getSnapshot()
            if (!['manual', 'updated'].includes(view.orderBy)) throw new Error('Sidebar order mode is unavailable')
            const accounted = new Set(workspaces.items.flatMap(item => item.sessionIds))
            const members = Object.fromEntries(workspaces.items.map(item => [item.workspaceId, item.sessionIds]))
            members[''] = list.ids.filter(id => !accounted.has(id))
            members.__flat_session_order__ = list.ids.filter(id => list.byId[id]?.origin !== 'subagent')
            const current = Object.values(list.byId).find(row => row.retainedBy?.mainView > 0)
            const orders = Object.fromEntries(Object.entries(members).map(([key, ids]) => {
              const recent = ids.filter(id => list.byId[id]).sort((a, b) => {
                const x = list.byId[a].updatedAt, y = list.byId[b].updatedAt
                return x === y ? (a < b ? -1 : a === b ? 0 : 1) : x > y ? -1 : 1
              })
              let order = recent
              if (view.orderBy === 'manual') {
                const saved = [...new Set(view.sessionOrderByAccount[key] ?? [])].filter(id => ids.includes(id))
                const addedPins = workspaces.pinnedSessionIds.filter(id => ids.includes(id) && list.byId[id] && !saved.includes(id) && !archived.has(id))
                const rest = recent.filter(id => !saved.includes(id) && !addedPins.includes(id))
                order = [...addedPins, ...saved, ...rest.filter(id => !archived.has(id)), ...rest.filter(id => archived.has(id))]
              }
              if (current?.blank && ids.includes(current.id)) order = [current.id, ...order.filter(id => id !== current.id)]
              return [key, order]
            }))
            const account = owner(childId)
            for (const key of [account, '__flat_session_order__']) {
              const order = orders[key].filter(id => id !== childId)
              order.splice(order.indexOf(parentId) + 1, 0, childId)
              orders[key] = order
            }
            // One synchronous write rebases on the latest native order and
            // persists both grouped and flat views without touching other rows.
            store.actions.setSessionOrder(account, orders[account], orders)
            finish()
          } catch (error) { finish(error) }
        }
        const schedule = () => queueMicrotask(check)
        timer = window.setTimeout(() => finish(new Error('Sidebar membership did not settle; retry conversion')), 8000)
        try {
          stops.push(ctx.get('workspaces').list.subscribe(schedule))
          stops.push(ctx.sessions.list.subscribe(schedule))
          check()
        } catch (error) { finish(error) }
      })
    }

    function SideChatTab({ ctx, t, useTabInfo, useResource, SessionProvider, renderSlot }) {
      const label = translator(t)
      const { tab } = useTabInfo()
      const params = threadParams(tab)
      const parentId = params.parentSessionId
      const childId = params.childId
      const [error, setError] = React.useState(() => archiveErrors.get(childId) || '')
      const [note, setNote] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const isTabRoot = typeof tab.contentId === 'string' && tab.contentId.startsWith('sidebar://' + TAB_KIND)
      const [probe, setProbe] = React.useState({ status: 'checking' })
      const hideInheritedHistory = useHideInheritedHistory()
      const [reveal, setReveal] = React.useState({ childId: '', shown: false })
      React.useEffect(() => { setReveal({ childId, shown: false }) }, [childId, hideInheritedHistory])

      React.useEffect(() => {
        setError(archiveErrors.get(childId) || '')
        const onError = event => {
          if (event.detail?.childId === childId) setError(event.detail.message)
        }
        window.addEventListener('dsh-sidebar-chat:archive-error', onError)
        return () => window.removeEventListener('dsh-sidebar-chat:archive-error', onError)
      }, [childId])

      // Old threads are not registered as host subagent children; retaining one
      // fails with a catalog diagnostic. Probe the durable header first so the
      // native view is only mounted for threads it can actually open.
      React.useEffect(() => {
        if (isTabRoot || !childId) return undefined
        let cancelled = false
        setProbe({ status: 'checking' })
        call('info', { childId })
          .then((value) => { if (!cancelled) setProbe({
            status: value?.legacy === true ? 'legacy' : 'ready',
            inheritedEventCount: value?.inheritedEventCount,
            boundarySeq: value?.inheritedDisplayBoundary,
          }) })
          .catch(() => { if (!cancelled) setProbe({ status: 'ready' }) })
        return () => { cancelled = true }
      }, [childId, isTabRoot])

      const save = async () => {
        if (!childId || busy) return
        const workspace = ctx.get('uiWorkspace')
        setBusy(true)
        setError('')
        setNote('')
        let reference, detached = false
        try {
          if (typeof workspace?.openSession !== 'function' || typeof workspace.selection?.getSnapshot !== 'function') {
            throw new Error(label('openIndependentFailed'))
          }
          // ready settles the initial open attempt, including attempts that end
          // in an error snapshot. Hold this generation until the main view owns it.
          reference = ctx.sessions.retain(childId, { source: 'sidebarChat', signal: AbortSignal.timeout(15000) })
          const binding = await reference.ready
          if (binding.session.getSnapshot().openState !== 'open') throw new Error(label('openIndependentFailed'))
          const result = await call('detach', { parentSessionId: parentId, childId })
          detached = true
          markDetached([childId])
          await positionDetached(ctx, parentId, childId, result.workspaceId)
          await workspace.openSession(childId)
          if (workspace.selection.getSnapshot().sessionId !== childId) throw new Error(label('openIndependentFailed'))
          tab.actions.close()
        } catch (err) {
          setError(detached ? label('detachedOpenFailed') + ' ' + String(err?.message || err) : String(err?.message || err))
        } finally { reference?.release(); setBusy(false) }
      }

      if (isTabRoot) return h(SideChatLauncher, { ctx, t, tab })
      if (params.manager) return h(SideChatManager, { ctx, t, parentId })
      if (!childId || !parentId) return h('div', { className: 'dshc-pane-error' }, label('invalidThread'))

      return h('div', { className: 'dshc-pane dshc-embedded', 'data-plugin': 'dsh-asuta-sidebar-chat' },
        h('div', { className: 'dshc-toolbar' },
          probe.status === 'ready' && probe.inheritedEventCount > 0 && hideInheritedHistory
            ? h('button', { type: 'button', className: 'dshc-tool', 'aria-pressed': reveal.childId === childId && reveal.shown,
              onClick: () => setReveal({ childId, shown: !(reveal.childId === childId && reveal.shown) }) },
              label(reveal.childId === childId && reveal.shown ? 'hideInherited' : 'showInherited')) : null,
          h('button', { type: 'button', className: 'dshc-tool', onClick: save, disabled: busy }, label('detachChat')),
        ),
        error ? h('div', { className: 'dshc-pane-error', role: 'alert' }, error) : null,
        note ? h('div', { className: 'dshc-note' }, note) : null,
        probe.status === 'checking'
          ? h('div', { className: 'dshc-embedded-status' }, label('opening'))
          : probe.status === 'legacy'
            ? h(LegacySideChat, { ctx, t, parentId, childId })
            : h(SideChatThreadBody, {
              ctx, t, tab, parentId, childId, useResource, SessionProvider, renderSlot,
              boundarySeq: probe.boundarySeq,
              hideHistory: hideInheritedHistory && !(reveal.childId === childId && reveal.shown),
            }),
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'resources', 'sessions', 'uiConversation', 'commandUi'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        for (const rows of Object.values(readThreadIndex())) {
          if (Array.isArray(rows)) for (const row of rows) hideThread(row?.id)
        }
        ctx.effect(() => installWorkspaceFilter(ctx), 'sidebar-chat: workspace visibility')
        ctx.effect(() => installVisibilityEvents(), 'sidebar-chat: live visibility')
        ctx.effect(() => ctx.locale.register(NS, { en: en, zh: zh }), 'sidebar-chat: locale')
        ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: 'sidebar-chat.history', order: 75, locale: NS,
        }, props => h(HistorySetting, props))), 'sidebar-chat: history setting')
        ctx.effect(() => ctx.resources.register(sideChatResourceProvider(ctx.sessions)), 'sidebar-chat: resources')
        ctx.effect(() => installCloseArchive(ctx, translator(t)), 'sidebar-chat: archive on close')

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-asuta-sidebar-chat'
          tag.dataset.pluginCss = 'dsh-asuta-sidebar-chat/sidebar-chat.css'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => { tag.remove() }
        }, 'sidebar-chat: styles')

        // Public face for other plugins: open (reuse or new) a side thread and
        // prefill its composer. Version 1 keeps these shapes stable.
        ctx.effect(() => {
          const api = {
            version: 1,
            prefill: (childId, text) => queuePrefill(childId, text),
            threads: (parentSessionId) => {
              const rows = readThreadIndex()[parentSessionId]
              return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === 'string').map((row) => ({ ...row })) : []
            },
            rows: async (parentSessionId, childId) => {
              const value = await call('events', { parentSessionId, childId })
              return Array.isArray(value?.rows) ? value.rows : []
            },
            open: async ({ parentSessionId, childId, text, reference, mode, title } = {}) => {
              if (typeof parentSessionId !== 'string' || parentSessionId === '') throw new Error('parentSessionId is required')
              let id = typeof childId === 'string' && childId !== '' ? childId : ''
              let name = typeof title === 'string' ? title : ''
              if (id === '' && mode !== 'new') {
                const latest = api.threads(parentSessionId)[0]
                if (latest) { id = latest.id; name = name || latest.title || '' }
              }
              let created = false
              if (id === '') {
                const value = await createThread(ctx, parentSessionId, '')
                id = value.childId
                name = value.title
                created = true
                saveThread(parentSessionId, { id, title: value.title, createdAt: Date.now() })
              }
              if (typeof text === 'string' && text.trim() !== '') queuePrefill(id, text)
              if (reference !== undefined) queuePrefill(id, reference)
              ctx.sidebarRight.openResource(threadAddress(parentSessionId, id, name || translator(t)('title')))
              return { childId: id, title: name, created }
            },
          }
          const onPrefill = (event) => { queuePrefill(event?.detail?.childId, event?.detail?.text) }
          window.__dshSidebarChat = api
          window.addEventListener('dsh-sidebar-chat:prefill', onPrefill)
          window.dispatchEvent(new CustomEvent('dsh-sidebar-chat:ready', { detail: { version: 1 } }))
          return () => {
            window.removeEventListener('dsh-sidebar-chat:prefill', onPrefill)
            if (window.__dshSidebarChat === api) delete window.__dshSidebarChat
            prefillQueue.clear()
            prefillListeners.clear()
          }
        }, 'sidebar-chat: public api')

        ctx.effect(() => ctx.commandUi.register({
          name: 'side',
          label: () => translator(t)('button'),
          description: () => translator(t)('guideDescription'),
          icon: ChatIcon,
          available: session => Boolean(session?.sessionId),
          ui: {
            kind: 'action',
            run: session => window.__dshSidebarChat.open({ parentSessionId: session.sessionId, mode: 'new' }),
          },
        }), 'sidebar-chat: slash command')

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          patterns: ['dsh-resource://sidebar-chat/**'],
          canOpen: (address) => typeof address === 'string' && (address.startsWith(THREAD_ADDRESS) || address.startsWith(MANAGER_ADDRESS)),
          title: () => translator(t)('button'),
          guide: [{
            id: 'new',
            order: 40,
            title: () => translator(t)('button'),
            description: () => translator(t)('guideDescription'),
            icon: ChatIcon,
          }],
        }), 'sidebar-chat: tab type')
        const Pane = (props) => h(SideChatTab, { ...props, ctx: ctx })
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          children: { 'sidebar-chat.conversation': { kind: 'single', scope: 'session' } },
        }, Pane)), 'sidebar-chat: tab body')
        ctx.effect(() => ctx.slots.inject('sidebar-chat.conversation', () => ctx.slots.register({
          name: 'sidebar-chat.conversation',
        }, SideChatConversation)), 'sidebar-chat: conversation')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
          locale: NS,
        }, SideChatTitle)), 'sidebar-chat: tab title')
      },
    }
  },
})

