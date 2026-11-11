/**
 * Client half of the archived-sessions manager.
 *
 * One surface, inside Settings: a `settings.section` entry (nav row + page) that
 * lists archived sessions with restore and permanent deletion. The sidebar
 * button (`sidebar.panellist`) is deliberately absent — the page is reached from
 * the settings panel only.
 *
 * The `main` keyed slot stays registered without a sidebar entry: the shell
 * remembers a selected panel id, and dropping the registration while that id is
 * still selected would leave the main pane blank until the user picks another
 * sidebar item. With it kept, a stale selection still renders this page.
 *
 * Restore runs entirely on the workspace service. Permanent deletion has no Host
 * API, so it goes through this plugin's own Host route over fetch.
 */

window.__ModuleLoader__.load({
  id: 'dsh-asuta-archived-sessions',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'archived-sessions'
    const NS = 'archived-sessions'
    const API = '/archived-sessions/api'

    const DICT_EN = {
      panel: 'Archived sessions',
      title: 'Archived sessions',
      count: '{n} archived',
      empty: 'No archived sessions.',
      emptyHint: 'Sessions you archive appear here.',
      restore: 'Restore',
      restoreFailed: 'Could not restore: {message}',
      delete: 'Delete permanently',
      deleteConfirm: 'Confirm delete',
      cancel: 'Cancel',
      deleting: 'Deleting…',
      deleteFailed: 'Could not delete: {message}',
      refreshFailed: 'Could not refresh the session list: {message}',
      deleted: 'Deleted',
      untitled: 'Untitled session',
      unknownSession: 'Missing session record',
      ungrouped: 'Ungrouped',
      deleteNote: 'The session log is deleted from disk permanently; index and cache rows are removed. Project files are never touched.',
      confirmNote: 'This removes the session from every list and deletes its log from disk. It cannot be undone.',
      groupConfirm: 'Delete this conversation and {n} side chats ({a} archived) from disk. Independent conversations are kept. This cannot be undone.',
      leftovers: 'Staged copies: {n}',
      leftoverNote: 'Older versions only moved deleted logs to a quarantine folder. Those copies are still on disk.',
      purgeLeftovers: 'Purge leftovers',
      purgeConfirm: 'Delete {n} leftover copies',
      purging: 'Purging…',
      purgeFailed: 'Could not purge: {message}',
      purged: 'Removed {n} leftover copies.',
      deleteIncomplete: 'Removed from every list, but {n} disk copies could not be cleared in {path}. Use "Purge leftovers" to retry.',
    }

    const DICT_ZH = {
      panel: '已归档会话',
      title: '已归档会话',
      count: '已归档 {n} 条',
      empty: '暂无已归档会话。',
      emptyHint: '你归档的会话会出现在这里。',
      restore: '恢复',
      restoreFailed: '恢复失败：{message}',
      delete: '彻底删除',
      deleteConfirm: '确认彻底删除',
      cancel: '取消',
      deleting: '正在删除…',
      deleteFailed: '删除失败：{message}',
      refreshFailed: '会话列表刷新失败：{message}',
      deleted: '已删除',
      untitled: '未命名会话',
      unknownSession: '会话记录已缺失',
      ungrouped: '未分组',
      deleteNote: '会话日志会从磁盘永久删除，索引与缓存一并清除。绝不触碰你的项目文件。',
      confirmNote: '该会话将从所有列表中消失，日志也会从磁盘删除，无法撤销。',
      groupConfirm: '将永久删除该主会话及其 {n} 个侧边对话（其中 {a} 个已归档）的日志。已转为独立会话的对话会保留。无法撤销。',
      leftovers: '隔离残留 {n} 项',
      leftoverNote: '旧版本删除时只把日志移到了隔离目录，这些副本仍在磁盘上。',
      purgeLeftovers: '清理残留',
      purgeConfirm: '确认清理 {n} 项',
      purging: '正在清理…',
      purgeFailed: '清理失败：{message}',
      purged: '已清理 {n} 项残留。',
      deleteIncomplete: '已从所有列表移除，但有 {n} 项磁盘副本未能清除（{path}）。可点击“清理残留”重试。',
    }

    /**
     * Subscribe one DSH snapshot source.
     *
     * The implementation is chosen once, at factory time, so the component calls
     * the same hooks on every render: uSES where React provides it, an
     * equivalent state+effect pair otherwise. A throwing component would blank
     * the whole slot entry, so this must not depend on the React version.
     */
    const useSource =
      typeof React.useSyncExternalStore === 'function'
        ? (source) =>
            React.useSyncExternalStore(
              React.useCallback((notify) => source.subscribe(notify), [source]),
              React.useCallback(() => source.getSnapshot(), [source]),
            )
        : (source) => {
            const [value, setValue] = React.useState(() => source.getSnapshot())
            React.useEffect(() => {
              setValue(source.getSnapshot())
              return source.subscribe(() => setValue(source.getSnapshot()))
            }, [source])
            return value
          }

    /** POST one operation to this plugin's Host route. */
    async function callHost(method, args) {
      const response = await fetch(API + '/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args || {}),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (payload === null || typeof payload !== 'object') {
        return { ok: false, error: { message: 'host route returned no JSON (HTTP ' + response.status + ')' } }
      }
      return payload
    }

    function formatCount(template, n) {
      return template.replace('{n}', String(n))
    }

    function formatMessage(template, message) {
      return template.replace('{message}', String(message))
    }

    function relativeTime(ms, now) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
      const delta = Math.max(0, now - ms)
      const minute = 60000
      const hour = 60 * minute
      const day = 24 * hour
      if (delta < minute) return 'just now'
      if (delta < hour) return Math.floor(delta / minute) + 'm'
      if (delta < day) return Math.floor(delta / hour) + 'h'
      return Math.floor(delta / day) + 'd'
    }

    /**
     * Page styles, tuned for the settings panel content column: the shell's
     * `.options` region owns the scrolling and the side padding, so the root
     * paints nothing and does not scroll, and rows borrow the settings
     * vocabulary (border-l2 hairline, 12px radius, no fill) so they read like
     * the other settings sections instead of the main-panel cards they replaced.
     */
    const CSS = `
.asx-root{display:flex;flex-direction:column;min-height:0;color:var(--dsw-alias-label-primary)}
.asx-inner{padding:0 0 12px}
.asx-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
.asx-h1{font-size:18px;line-height:24px;font-weight:600;margin:0}
.asx-count{font-size:12px;color:var(--dsw-alias-label-secondary)}
.asx-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:0 0 18px}
.asx-list{display:flex;flex-direction:column;gap:8px}
.asx-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}
.asx-row.is-busy{opacity:.6}
.asx-main{flex:1;min-width:0}
.asx-title{font-size:13px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.asx-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.asx-actions{display:flex;align-items:center;gap:6px;flex:none}
.asx-btn{font:inherit;font-size:12px;line-height:1;padding:6px 12px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.asx-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.asx-btn:disabled{cursor:default;opacity:.5}
.asx-btn.is-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.asx-err{font-size:11px;color:var(--dsw-alias-state-error-primary);margin-top:4px}
.asx-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary);margin-top:4px}
.asx-ok{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}
.asx-leftovers{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-6px 0 16px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.asx-leftovers span{flex:1;min-width:220px}
.asx-empty{padding:40px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}
.asx-empty-hint{font-size:12px;margin-top:6px;opacity:.8}
`

    function SessionRow({ entry, t, busy, confirming, deletionPlan, error, onRestore, onAskDelete, onCancelDelete, onConfirmDelete }) {
      const title = entry.missing
        ? t('unknownSession')
        : entry.blank
          ? t('untitled')
          : entry.title || t('untitled')

      const meta = [entry.workspaceTitle || t('ungrouped'), relativeTime(entry.updatedAt, Date.now())]
        .filter(Boolean)
        .join(' · ')

      const actions = confirming
        ? [
            h('button', { key: 'c', type: 'button', className: 'asx-btn is-danger', disabled: busy, onClick: onConfirmDelete }, busy ? t('deleting') : t('deleteConfirm')),
            h('button', { key: 'x', type: 'button', className: 'asx-btn', disabled: busy, onClick: onCancelDelete }, t('cancel')),
          ]
        : [
            h('button', { key: 'r', type: 'button', className: 'asx-btn', disabled: busy || entry.missing || entry.deleting, onClick: onRestore }, t('restore')),
            // A failed post-delete check can leave only an archive marker. Keep
            // deletion available so that refreshing the list cannot block retry.
            h('button', { key: 'd', type: 'button', className: 'asx-btn is-danger', disabled: busy, onClick: onAskDelete }, t('delete')),
          ]

      return h(
        'div',
        { className: busy ? 'asx-row is-busy' : 'asx-row' },
        h(
          'div',
          { className: 'asx-main' },
          h('div', { className: 'asx-title' }, title),
          h('div', { className: 'asx-sub' }, meta),
          confirming ? h('div', { className: 'asx-warn' }, deletionPlan?.sideCount > 0
            ? t('groupConfirm').replace('{n}', deletionPlan.sideCount).replace('{a}', deletionPlan.archivedSideCount) : t('confirmNote')) : null,
          error ? h('div', { className: 'asx-err' }, error) : null,
        ),
        h('div', { className: 'asx-actions' }, actions),
      )
    }

    function ArchivedSessionsPage({ workspaces, sessions, locale, t }) {
      const workspaceSnapshot = useSource(workspaces.list)
      const sessionSnapshot = useSource(sessions.list)
      useSource(locale)

      const [busyId, setBusyId] = React.useState(null)
      const [confirmId, setConfirmId] = React.useState(null)
      const [deletionPlans, setDeletionPlans] = React.useState({})
      const [errors, setErrors] = React.useState({})
      const [pendingIds, setPendingIds] = React.useState([])
      const [leftovers, setLeftovers] = React.useState(0)
      const [purgeAsk, setPurgeAsk] = React.useState(false)
      const [purging, setPurging] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const refreshPending = React.useCallback(async () => {
        try {
          const result = await callHost('pending', {})
          if (result.ok) setPendingIds(result.value.ids)
        } catch {}
      }, [])
      React.useEffect(() => { void refreshPending() }, [refreshPending, workspaceSnapshot])
      const refreshLeftovers = React.useCallback(async () => {
        try {
          const result = await callHost('leftovers', {})
          if (result.ok) setLeftovers(result.value.count)
        } catch {}
      }, [])
      React.useEffect(() => { void refreshLeftovers() }, [refreshLeftovers, workspaceSnapshot])

      const entries = React.useMemo(() => {
        const items = workspaceSnapshot.items || []
        const rows = []
        for (const id of new Set([...(workspaceSnapshot.archivedSessionIds || []), ...pendingIds])) {
          const summary = sessionSnapshot.byId ? sessionSnapshot.byId[id] : undefined
          const owner = items.find((item) => (item.sessionIds || []).includes(id))
          rows.push({
            id,
            deleting: pendingIds.includes(id),
            missing: summary === undefined,
            blank: summary ? summary.blank === true : false,
            title: summary ? summary.title : undefined,
            updatedAt: summary ? summary.updatedAt : undefined,
            workspaceTitle: owner ? owner.title : undefined,
          })
        }
        rows.sort((left, right) => {
          if (left.missing !== right.missing) return left.missing ? 1 : -1
          return (right.updatedAt || 0) - (left.updatedAt || 0)
        })
        return rows
      }, [workspaceSnapshot, sessionSnapshot, pendingIds])

      const setError = (id, message) => {
        setErrors((previous) => ({ ...previous, [id]: message }))
      }

      const clearError = (id) => {
        setErrors((previous) => {
          if (!(id in previous)) return previous
          const next = { ...previous }
          delete next[id]
          return next
        })
      }

      const runRestore = async (id) => {
        setBusyId(id)
        clearError(id)
        try {
          await workspaces.unarchiveSession(id)
        } catch (error) {
          setError(id, formatMessage(t('restoreFailed'), error && error.message ? error.message : String(error)))
        } finally {
          setBusyId(null)
        }
      }

      const runDelete = async (id) => {
        setBusyId(id)
        clearError(id)
        setNotice(null)
        try {
          const result = await callHost('delete', { sessionId: id, confirmation: deletionPlans[id]?.confirmation })
          if (!result.ok) {
            const message = result.error && result.error.message ? result.error.message : 'unknown error'
            setError(id, formatMessage(t('deleteFailed'), message))
          } else if (result.value && result.value.warning === 'quarantine-partial') {
            // The row is already gone from every list; keep the partial cleanup
            // visible at page level so it cannot be mistaken for a full delete.
            setNotice({
              kind: 'warn',
              text: t('deleteIncomplete')
                .replace('{n}', String((result.value.remaining || []).length))
                .replace('{path}', String(result.value.quarantine || '')),
            })
          }
        } catch (error) {
          setError(id, formatMessage(t('deleteFailed'), error && error.message ? error.message : String(error)))
        } finally {
          setBusyId(null)
          setConfirmId(null)
          // Reconcile the baseline as well as live removal events, including
          // when a group was only partially deleted before a later failure.
          try { await sessions.refresh() } catch (error) {
            setNotice({ kind: 'warn', text: formatMessage(t('refreshFailed'), error.message || String(error)) })
          }
          await refreshPending()
          await refreshLeftovers()
        }
      }

      const runPurge = async () => {
        setPurging(true)
        setNotice(null)
        try {
          const result = await callHost('purge', {})
          if (!result.ok) throw new Error(result.error?.message || 'unknown error')
          const failures = result.value?.failures || []
          if (failures.length > 0) {
            setNotice({ kind: 'warn', text: formatMessage(t('purgeFailed'), failures.map((row) => row.name).join(', ')) })
          } else {
            setNotice({ kind: 'ok', text: t('purged').replace('{n}', String(result.value?.removed ?? 0)) })
          }
        } catch (error) {
          setNotice({ kind: 'err', text: formatMessage(t('purgeFailed'), error && error.message ? error.message : String(error)) })
        } finally {
          setPurging(false)
          setPurgeAsk(false)
          await refreshLeftovers()
        }
      }
      const askDelete = async id => {
        setBusyId(id); clearError(id); setConfirmId(null)
        try {
          const result = await callHost('preview', { sessionId: id })
          if (!result.ok) throw new Error(result.error?.message || 'Could not inspect deletion scope')
          setDeletionPlans(previous => ({ ...previous, [id]: result.value }))
          setConfirmId(id)
        } catch (error) { setError(id, formatMessage(t('deleteFailed'), error.message)) }
        finally { setBusyId(null) }
      }

      return h(
        'div',
        { className: 'asx-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'asx-inner' },
          h(
            'div',
            { className: 'asx-head' },
            h('h1', { className: 'asx-h1' }, t('title')),
            h('span', { className: 'asx-count' }, formatCount(t('count'), entries.length)),
          ),
          h('p', { className: 'asx-note' }, t('deleteNote')),
          leftovers > 0
            ? h(
                'div',
                { className: 'asx-leftovers' },
                h('span', null, t('leftovers').replace('{n}', String(leftovers)) + ' ' + t('leftoverNote')),
                purgeAsk
                  ? h(
                      'div',
                      { className: 'asx-actions' },
                      h('button', { type: 'button', className: 'asx-btn is-danger', disabled: purging, onClick: runPurge }, purging ? t('purging') : t('purgeConfirm').replace('{n}', String(leftovers))),
                      h('button', { type: 'button', className: 'asx-btn', disabled: purging, onClick: () => setPurgeAsk(false) }, t('cancel')),
                    )
                  : h('button', { type: 'button', className: 'asx-btn', disabled: purging, onClick: () => setPurgeAsk(true) }, t('purgeLeftovers')),
              )
            : null,
          notice
            ? h('div', { className: notice.kind === 'warn' ? 'asx-warn' : notice.kind === 'err' ? 'asx-err' : 'asx-ok' }, notice.text)
            : null,
          entries.length === 0
            ? h(
                'div',
                { className: 'asx-empty' },
                h('div', null, t('empty')),
                h('div', { className: 'asx-empty-hint' }, t('emptyHint')),
              )
            : h(
                'div',
                { className: 'asx-list' },
                entries.map((entry) =>
                  h(SessionRow, {
                    key: entry.id,
                    entry,
                    t,
                    busy: busyId === entry.id,
                    confirming: confirmId === entry.id,
                    deletionPlan: deletionPlans[entry.id],
                    error: errors[entry.id],
                    onRestore: () => runRestore(entry.id),
                    onAskDelete: () => askDelete(entry.id),
                    onCancelDelete: () => setConfirmId(null),
                    onConfirmDelete: () => runDelete(entry.id),
                  }),
                ),
              ),
        ),
      )
    }

    return {
      name: NS,
      inject: ['slots', 'workspaces', 'sessions', 'locale'],

      apply(ctx) {
        const locale = ctx.locale
        const disposeEn = locale.register(NS, 'en', DICT_EN)
        const disposeZh = locale.register(NS, 'zh', DICT_ZH)
        // Aliases so a region-tagged active locale still resolves a dictionary.
        const disposeEnUs = locale.register(NS, 'en-US', DICT_EN)
        const disposeZhCn = locale.register(NS, 'zh-CN', DICT_ZH)
        const t = locale.bind(NS)

        ctx.effect(() => () => {
          disposeEn()
          disposeZh()
          disposeEnUs()
          disposeZhCn()
        }, 'archived-sessions: locale dictionaries')

        const face = { workspaces: ctx.workspaces, sessions: ctx.sessions, locale, t }

        // The page now lives in Settings: one `settings.section` entry projects
        // the nav row and mounts the page in the panel's content column. `order`
        // sits past every shipped section (general 0, models 10, plugins 15,
        // agent-presets 20), so the row lands at the bottom of the rail.
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: PANEL_ID,
              order: 90,
              label: () => t('panel'),
              locale: NS,
              inject: () => face,
            },
            ArchivedSessionsPage,
          ),
        )

        // Kept on purpose, without the sidebar entry that used to select it: see
        // the file header. Nothing in the UI reaches this key any more.
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => face }, ArchivedSessionsPage),
        )
      },
    }
  },
})
