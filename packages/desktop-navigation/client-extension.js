function reportClientStage(stage, error) {
  const detail = String(error?.message ?? error ?? '').slice(0, 2000);
  reportClientStage.queue = (reportClientStage.queue ?? Promise.resolve()).then(async () => {
    try { await fetch('/desktop-navigation/client-status', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage, error: detail }) }); } catch { /* Diagnostics must never prevent UI activation. */ }
  });
  return reportClientStage.queue;
}

/** Keep paging relative to the actual viewport, including sidebar-more hot reloads. */
function useRecentScrollRoot(area) {
  const resolve = () => area?.closest('[data-sm-scroll-region]') ?? area;
  const [root, setRoot] = react.useState(resolve);
  react.useLayoutEffect(() => {
    const sync = () => setRoot(resolve());
    sync();
    window.addEventListener('sidebar-more:scroll-root-change', sync);
    return () => window.removeEventListener('sidebar-more:scroll-root-change', sync);
  }, [area]);
  return root;
}

const SIDEBAR_MORE_RENAME_BRIDGE = Symbol.for('sidebar-more.native-row-bridge');
const SIDEBAR_MORE_ROW_WRAPPER = Symbol.for('sidebar-more.workspace-row-bridge');
const RECENT_RENAME_WRAPPER = Symbol.for('desktop-navigation.recent-rename-bridge');
let nativeRenameRequest = null;
let nativeHoverRender = null;

function requestRecentSessionRename(sessionId, title) {
  const shared = window[SIDEBAR_MORE_RENAME_BRIDGE]?.getSnapshot?.()?.requestSessionRename;
  (shared ?? nativeRenameRequest)?.(sessionId, title);
}

function renderRecentHoverSlot(sessionId) {
  const shared = window[SIDEBAR_MORE_RENAME_BRIDGE]?.getSnapshot?.()?.renderSlot;
  return (shared ?? nativeHoverRender)?.('sidebar.session.row.hover', { sessionId }) ?? null;
}

function installRecentRenameBridge(ctx) {
  const slots = ctx.slots, original = Symbol.for('cordis.original');
  return slots.inject('sidebar.workspaces', () => {
    let patch = null, changing = false, stopped = false;
    function restore() {
      if (patch && patch.entry.component === patch.wrapper) Object.defineProperty(patch.entry, 'component', patch.descriptor);
      patch = null;
    }
    function reconcile() {
      if (stopped || changing) return;
      changing = true;
      try {
        const candidate = slots.entriesOfSlot('sidebar.workspaces')[0];
        const entry = candidate?.[original] ?? candidate;
        if (patch && patch.entry === entry && entry?.component === patch.wrapper) return;
        restore();
        if (!entry || typeof entry.component !== 'function' || entry.component[SIDEBAR_MORE_ROW_WRAPPER]) return;
        const descriptor = Object.getOwnPropertyDescriptor(entry, 'component');
        if (!descriptor || (!descriptor.writable && !descriptor.configurable)) return;
        const NativeWorkspace = entry.component;
        function RecentRenameWorkspace(props) {
          const request = props.requestSessionRename;
          const renderSlot = props.renderSlot;
          react.useLayoutEffect(() => {
            nativeRenameRequest = request;
            nativeHoverRender = renderSlot;
            return () => {
              if (nativeRenameRequest === request) nativeRenameRequest = null;
              if (nativeHoverRender === renderSlot) nativeHoverRender = null;
            };
          }, [request, renderSlot]);
          return react.createElement(NativeWorkspace, props);
        }
        Object.defineProperty(RecentRenameWorkspace, RECENT_RENAME_WRAPPER, { value: true });
        Object.defineProperty(entry, 'component', { ...descriptor, value: RecentRenameWorkspace });
        patch = { entry, descriptor, wrapper: RecentRenameWorkspace };
      } catch (error) { console.warn('desktop-navigation: recent rename bridge:', error); }
      finally { changing = false; }
    }
    const unsubscribe = slots.subscribe('sidebar.workspaces', reconcile);
    reconcile();
    return () => { stopped = true; unsubscribe(); nativeRenameRequest = null; nativeHoverRender = null; restore(); };
  });
}

function installNavigation(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.pluginCss = 'dsh-asuta-desktop-navigation/recent-layout.css';
    tag.textContent = '[data-slot="sidebar.recent.section"] > [class*="_header"] { box-sizing: border-box; padding-left: var(--dsh-sidebar-row-padding, 12px); padding-right: 1px; }';
    tag.textContent += '.desktop-navigation-recent-anchor{position:relative;display:block}.aalpzW_row .aalpzW_rowActions{display:none}.aalpzW_row:hover .aalpzW_rowActions,.aalpzW_rowActive .aalpzW_rowActions{display:inline-flex}.aalpzW_row:hover .aalpzW_time,.aalpzW_row:hover .aalpzW_pinIndicator,.aalpzW_rowActive .aalpzW_time,.aalpzW_rowActive .aalpzW_pinIndicator{display:none}';
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, 'desktop-navigation: align recent section header');
  ctx.effect(() => installRecentRenameBridge(ctx), 'desktop-navigation: native recent rename bridge');
  installChatNavigation(ctx, (sessionId) => createNativeOpener({
    cwd: () => ctx.get('sessions')?.list?.getSnapshot()?.byId?.[sessionId]?.cwd,
    remote: { openWorkspacePath(request) {
      const api = ctx.get('remote')?.session;
      if (typeof api?.openWorkspacePath !== 'function') throw new Error('native-unavailable');
      return api.openWorkspacePath(request);
    } },
    available: async () => (await ctx.get('remote')?.session?.canOpenWorkspacePath?.()) === true,
    inspectPath: async (path) => {
      const response = await fetch('/desktop-navigation/path-info', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'invalid-path');
      return result;
    },
  }), message => reportClientStage('navigation-render-error', message), react);
}

const RecentHoverContext = react.createContext(null);

/** One card for the Recent list. CSS anchors position it without synchronous layout reads on every handoff. */
function RecentMotionList({ folded, rows, now, t, className, children }) {
  const [mounted, setMounted] = react.useState(!folded);
  const [shown, setShown] = react.useState(!folded);
  const [card, setCard] = react.useState(null);
  const [copied, setCopied] = react.useState(false);
  const [hover] = react.useState(() => {
    let row = null;
    let anchor = null;
    let dwell = null;
    let grace = null;
    let warm = false;
    const clearDwell = () => { clearTimeout(dwell); dwell = null; };
    const clearGrace = () => { clearTimeout(grace); grace = null; };
    const dismiss = () => {
      clearDwell(); clearGrace();
      anchor?.style.removeProperty('anchor-name');
      anchor = null; row = null; warm = false;
      setCard(null); setCopied(false);
    };
    const armGrace = () => {
      clearGrace();
      grace = setTimeout(dismiss, 200);
    };
    return {
      enter(next, t, now, element) {
        clearGrace();
        if (row?.id === next.id && anchor === element) return;
        clearDwell();
        anchor?.style.removeProperty('anchor-name');
        row = next; anchor = element;
        anchor.style.setProperty('anchor-name', '--dsh-recent-hover-anchor');
        setCopied(false);
        if (warm) setCard({ row: next, t, now });
        else dwell = setTimeout(() => {
          dwell = null; warm = true;
          setCard({ row: next, t, now });
        }, CARD_DWELL_MS);
      },
      leave(id) {
        if (row?.id !== id) return;
        if (warm) armGrace();
        else {
          clearDwell();
          anchor?.style.removeProperty('anchor-name');
          anchor = null; row = null;
        }
      },
      enterCard: clearGrace,
      leaveCard: armGrace,
      currentId: () => row?.id,
      refresh(rows, t, now) {
        if (!warm || row === null) return;
        const latest = rows.find(item => item.id === row.id);
        if (!latest) { dismiss(); return; }
        row = latest;
        setCard(previous => previous && (previous.row !== latest || previous.now !== now || previous.t !== t)
          ? { row: latest, t, now } : previous);
      },
      dismiss,
      dispose() {
        clearDwell(); clearGrace();
        anchor?.style.removeProperty('anchor-name');
      },
    };
  });
  if (!folded && !mounted) setMounted(true);
  react.useEffect(() => { if (folded) hover.dismiss(); }, [folded, hover]);
  react.useEffect(() => { hover.refresh(rows, t, now); }, [hover, rows, t, now]);
  react.useEffect(() => () => hover.dispose(), [hover]);
  const reduce = react.useRef(false);
  react.useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduce.current = query.matches; if (query.matches && folded) setMounted(false); };
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [folded]);
  react.useEffect(() => {
    let frame; let timer;
    if (!folded) { setMounted(true); frame = requestAnimationFrame(() => setShown(true)); }
    else { setShown(false); if (reduce.current) setMounted(false); else timer = setTimeout(() => setMounted(false), 190); }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [folded]);
  return react.createElement(RecentHoverContext.Provider, { value: hover },
    react.createElement('div', { className: 'desktop-navigation-recent-motion', 'data-open': shown && !folded ? '' : undefined, 'aria-hidden': folded ? 'true' : undefined, ref: element => { if (element) element.inert = folded; } },
      react.createElement('div', { className: 'desktop-navigation-recent-clip' }, mounted ? react.createElement('ul', { className }, children) : null),
      react.createElement('style', null, '.desktop-navigation-recent-motion{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows 180ms ease,opacity 140ms ease}.desktop-navigation-recent-motion[data-open]{grid-template-rows:1fr;opacity:1}.desktop-navigation-recent-clip{min-height:0;overflow:hidden}.desktop-navigation-recent-card{--dsw-hovercard-bg:#2C2C2E;position:fixed;position-anchor:--dsh-recent-hover-anchor;left:calc(anchor(right) + 8px);top:anchor(top);position-try-fallbacks:--dsh-recent-bottom;z-index:100;box-sizing:border-box;width:244px;padding:12px 16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-hovercard-bg);box-shadow:var(--dsw-shadow-lv3);cursor:pointer}@position-try --dsh-recent-bottom{top:auto;bottom:8px}.desktop-navigation-recent-card:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.desktop-navigation-recent-copied{color:#fff;font-size:14px;line-height:20px;text-align:center}.aalpzW_chevron{transition:transform 180ms ease!important}@media(prefers-reduced-motion:reduce){.desktop-navigation-recent-motion,.aalpzW_chevron,[data-dsh-recent-section-chevron]{transition:none!important}}')),
    card && react_dom.createPortal(react.createElement('div', {
      className: 'desktop-navigation-recent-card',
      role: 'button', tabIndex: 0,
      'aria-label': card.t('copy') + ': ' + card.row.title,
      onPointerEnter: hover.enterCard, onPointerLeave: hover.leaveCard,
      onClick: () => {
        const id = card.row.id;
        if (!navigator.clipboard?.writeText) return;
        navigator.clipboard.writeText(card.row.title).then(() => {
          if (hover.currentId() !== id) return;
          setCopied(true);
          setTimeout(() => { if (hover.currentId() === id) setCopied(false); }, 1000);
        }).catch(() => {});
      },
      onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } },
    }, copied ? react.createElement('span', { className: 'desktop-navigation-recent-copied', 'aria-hidden': true }, card.t('hover.copied')) : react.createElement(RecentRowCard, { row: card.row, t: card.t, now: card.now })), document.body));
}
