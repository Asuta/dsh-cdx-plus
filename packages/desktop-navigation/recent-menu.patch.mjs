// Keep Recent's two menu entry points on the host's shared, permission-aware menu.
export function patchRecentMenu(client, replaceOnce) {
  replaceOnce('const [menuOpen, setMenuOpen] = (0, react.useState)(false);', 'const menuOpen = useContextMenuTarget(target => target?.kind === "session" && target.value.sessionId === row.id);\nconst { getTriggerProps } = useContextMenu();\nconst target = { kind: "session", value: { sessionId: row.id, displayTitle: row.title } };\nconst trigger = getTriggerProps(target);');
  replaceOnce('className: rowClass,', 'className: rowClass, onContextMenu: event => { recentHover.dismiss(); trigger.onContextMenu?.(event); },');
  replaceOnce('if (event.key !== "Enter" && event.key !== " ") return;', 'if (event.target !== event.currentTarget) return; trigger.onKeyDown?.(event); if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) return;');
  const start = client.indexOf('/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {', client.indexOf('function RecentRowItem'));
  const end = client.indexOf('/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {', start);
  if (start < 0 || end < 0) throw new Error('Upstream recent build changed: row menu');
  replaceOnce(client.slice(start, end), 'renderFactorySlot("contextMenu.button", { target, label: t("actions.session.aria", { name: row.title }), className: RecentSessions_module_css_default.iconButton }),\n');
  replaceOnce('function RecentRowItem({ row, now, t, actions, onArchive, showWorkspace, separatesGroups })', 'function RecentRowItem({ row, now, t, actions, onArchive, showWorkspace, separatesGroups, useContextMenu, useContextMenuTarget, renderFactorySlot })');
  replaceOnce('function RecentSessions({ wide, t, useSessions, useSessionStatus, useWorkspaces, open, archive, stopAndArchive, pin, unpin, fork })', 'function RecentSessions({ wide, t, useSessions, useSessionStatus, useWorkspaces, open, archive, stopAndArchive, pin, unpin, fork, useContextMenu, useContextMenuTarget, renderFactorySlot })');
  replaceOnce('onArchive: archiveRow,', 'onArchive: archiveRow, useContextMenu, useContextMenuTarget, renderFactorySlot,');
  replaceOnce('"uiWorkspace"\n', '"uiWorkspace", "contextMenus"\n');
  replaceOnce('inject: () => recentActions(ctx.uiWorkspace)', 'inject: () => ({ ...recentActions(ctx.uiWorkspace), hooks: { contextMenuTarget: ctx.contextMenus.active } })');
  replaceOnce('className: recentFolded ? RecentSessions_module_css_default.chevron', 'size: 14, className: recentFolded ? RecentSessions_module_css_default.chevron');
}
