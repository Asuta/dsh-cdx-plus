# Sidebar More and pinned conversations

The sidebar keeps the native Plugins entry and More launcher visible. Every other panel, including panels pinned later, appears inside More above the existing plugin discovery and creation actions. The pinned conversation section and workspace browser remain below the panel list.

## 1.0.5 — DSH rc.2 scroll hand-off

The shared Pinned, Workspaces and Recent viewport now binds to the native `useSectionScroller` capability. DSH 0.2.2-rc.2 can route both upward and downward wheel gestures to the actual scrolling element. The outer shell keeps navigation fixed; the workspace's new height cap is removed only while this adapter is active. Collapsing the sidebar or unloading the plugin restores native refs and styles.

## 1.0.3 — shared sidebar scrolling

Pinned, Workspaces and Recent now scroll together, including their section headings. Global controls above them and the footer stay fixed. Pinned no longer has an eight-row scroll limit in this layout; each section retains its collapse control. Opening a conversation preserves the shared scroll offset.

The existing workspace component bridge marks the shell browsing region and its native list ancestors, then applies scoped styles. Native React nodes and stores stay in place. The adapter releases its attributes, observer and scroll listener when the sidebar collapses or the plugin unloads. This layout adapter is verified against DSH 0.2.2-rc.1; it relies on that version's shell region structure. Desktop Navigation 1.0.3 follows the shared scroll viewport for Recent pagination and falls back to its native list when this adapter is absent.

Validation: 51 existing pinned/bridge checks passed. An isolated real DSH web profile with 12 pinned sessions, 16 workspaces and 70 sessions verified wheel scrolling, fixed controls/footer, no nested scrollers, Recent paging, section collapse, conversation switching, sidebar collapse/expand, search, and mouse drag/undo between workspaces. Desktop verification remains manual.

## 1.0.1 — unified pinned conversation rows

The top pinned section retains its position, collapse preference, filters, running-first/recent-update ordering, and eight-row scroll limit.

Pinned rows now use the workspace owner's authorized child slot renderer for native leading decorations, hover-card sections, row actions (archive and pin), and the session menu (pin, rename, fork, archive, copy Session ID, plus compatible third-party additions). Native operation implementations, permissions, confirmations, and menu state remain owned by the workspace plugin.

There is no exported native whole-row factory in DSH 0.2.1-rc.3. The row shell mirrors SessionNodeItem, uses its loaded stylesheet class prefix, existing shared Menu/HoverCard/StateDot primitives, relative-time formatter, and the same session-status snapshot. Pending interactions, running subagents, and unread completion indicators follow native precedence. Selection, title marquee, pin indicator, age, menu visibility, double-click rename, and button propagation match native behavior.

A guarded component wrapper borrows the original workspace registration's renderSlot without replacing its children, store, injection, or permissions. This integration is version-coupled, not a public whole-row API. Unknown entries or absent native CSS use the original minimal pinned-row fallback. Unloading restores the exact original component descriptor unless another plugin has replaced it.

The active native row bridge is also published under `Symbol.for('sidebar-more.native-row-bridge')` so sibling sidebar sections can invoke the workspace owner's rename dialog without reimplementing it.

## Verification

- `node --check sidebar-more/client.js`
- `node --test .sidebar-more/pinned.test.mjs`: 41 isolated behavior tests pass.
- `git diff --check -- sidebar-more` passes.
- Bundle 1.0.1 installed with `application: applied`, no bundle warnings. Native workspace ownership and pinned footer registration remain active.
- Automated browser window reached the GUI authentication screen; actual visual layout and menu clicks were not verified in the signed-in Desktop page. Reload that frontend (Ctrl+R) to ensure the updated client script is loaded. No real session was archived, unpinned, renamed, or forked for testing.

Updated 2026-10-26 (Asia/Shanghai).
