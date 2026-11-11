# Desktop Navigation

Workspace-authored bundle for Windows DSH Desktop. It combines local Chat-path navigation with a narrowly changed, MIT-licensed copy of the currently installed `dsh-recent` 0.1.0 browser artifact.

## 1.0.3 — shared sidebar scroll compatibility

When Sidebar More enables its shared browsing viewport, Recent uses that viewport for incremental loading. A layout-change event rebinds the observer when Sidebar More activates, collapses, expands or unloads; without the shared viewport it uses the original workspace list. The source patch lives in `build.mjs` and `client-extension.js`, and the vendored upstream artifact remains untouched. Verified in DSH 0.2.2-rc.1 with wheel scrolling, incremental loading, independent folding, search and cross-workspace mouse drag/undo.

Installed in the current profile as `dsh-asuta-desktop-navigation` through a local source link. The original `include:dsh-recent` row is disabled through Plugin Manager to avoid duplicate workspace-fold observers. To roll back, disable this bundle and re-enable the original row through Plugin Manager. Do not activate both copies. The package was renamed from `@local/desktop-navigation` to give the native loader a fresh client manifest identity without restarting the backend.

## Behavior

Existing Chat blue file links retain the original StoredEntry, component inputs, child declarations, store, hooks, localization, and error/retry surface. A guarded wrapper around that entry's component changes only its `openFile` prop. Relative paths use the viewed Session's current workspace. A directory opens directly in Explorer; a file reveals its containing directory and selects the file. HTTP(S), arbitrary schemes, UNC shares, device paths, control characters, alternate data streams, and unresolved relative paths are rejected. Line anchors such as `#L24-L30` are removed from filesystem targets.

A small authenticated Host route, `POST /desktop-navigation/path-info`, performs read-only metadata checks through the composed `fs` capability and refuses absent/unsupported targets. It verifies a local Host mapping and revalidates the canonical path. The Client then calls the existing native `remote.session.openWorkspacePath` operation: directories use ordinary open and files use `action: reveal`. Paths never become shell commands. This bundle contains no subprocess launches and no alternative URL opener.

Recent retains upstream ordering, row actions, persistent options, workspace folding, paging, portals, and selectors. Double-clicking a Recent conversation title opens the native rename dialog, matching Workspace and Pinned lists. It reuses the shared native-row bridge from sidebar-more 1.0.2 when available and installs its own guarded bridge otherwise. The Recent detail card shows the session title, working directory, relative time, and native status lines. One shared card waits 800ms on the first hover, then switches immediately between rows, with a 200ms pointer grace. CSS anchor positioning keeps it beside the active row without synchronous geometry reads during each handoff; row actions use CSS hover visibility. Its own list receives a 180ms height transition and 140ms opacity transition. The header chevron rotates over 180ms. Closed content becomes inert immediately and unmounts after the transition; the paging sentinel is absent while folded. `prefers-reduced-motion: reduce` disables transitions and removes closed content immediately.

## Compatibility and rollback

The Chat adapter uses the inspected registry APIs to observe declaration lifetimes and trigger re-rendering, plus a guarded private seam on the native Chat StoredEntry's writable component property. It preserves that entry's complete standard kit and original child ownership. The wrapper forwards every prop and changes only openFile; it does not re-declare any slot or replace the registered entry. Disposal restores the exact descriptor only while the wrapper still owns it. Activating or unloading the wrapper remounts local Chat React state once; external store and cached injected values stay attached to their original entry. Startup ACK has been observed as navigation-ready on the installed client.

The copied upstream recent implementation already includes its own DOM-based workspace-fold compatibility layer and primitive imports. Those upstream behaviors are retained; the new animation code only owns its React-rendered list box. No DSH installation/profile files were modified. The vendored original remains byte-for-byte preserved under `vendor/recent-original.js`, with attribution and MIT license. `vendor/UPSTREAM.json` records the source and SHA-256. The build refuses a different upstream fingerprint.

## Build and verification

Run `node build.mjs` inside this directory. It builds entirely from the retained original artifact; no dependency installation is required. Run `node --test ../.desktop-navigation/navigation.test.mjs` for URL/path rejection, native call intent, absent-target checks, complete registration preservation, and loader/motion contracts. All native calls in tests are stubs. No user folder or file is opened during testing.

Final integration checks on 2026-10-26: the installed Client acknowledged navigation-ready, the native chat and trajectory entries remain active with no duplicate chat or transient marker, and sidebar.footer.action contains one active recent entry. All 12 navigation tests pass, including full factory/apply, actual wrapper render with native-call stubs, descriptor restoration, changed registry entries, and concurrent-owner protection. The combined suite has 35 passing tests plus 22 isolated settings-persistence assertions. Syntax checks and git diff --check pass.

Verification limits: animation appearance, displayed artwork, and end-user Explorer handoff were not visually/click tested in the authenticated main window. The bundle deliberately does not launch Explorer automatically as a test. No real conversation history or user model settings were changed, and no Git commit or push was performed.

Original icon: created specifically for this bundle. Original upstream recent copyright and license remain in `vendor/LICENSE.dsh-recent`.
