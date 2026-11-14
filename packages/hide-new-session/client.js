/**
 * Client half of the hide-new-session bundle.
 *
 * The New Session control at the top of the sidebar is drawn by the shipped
 * ui-sidebar shell itself. Since rc.3 it also shares a row with controls
 * contributed through sidebar.session.action. Target the native button by
 * its CSS-module class name: the shell writes
 * `className: SidebarRoot_module_css_default.newSession`, and the build emits
 * that as `<hash>_newSession` (the hash changes between builds, the local name
 * does not). Matching the local-name suffix therefore keeps working across
 * rebuilds without pinning a hash.
 *
 * Remove the rc.3 row only when its slot contains just that button. If another
 * plugin contributes a control (for example DeepSeek chat import), preserve
 * the row and its spacing. rc.2 has no row and keeps the button-only behavior.
 *
 * The shell's own brand row remains a New Session shortcut and the keyboard
 * shortcut still works; this plugin only removes the button from view.
 */

window.__ModuleLoader__.load({
  id: 'dsh-asuta-hide-new-session',
  factory() {
    const CSS = `
      button[class*="newSession"] { display: none !important; }
      div[class*="newSessionRow"]:has(> [data-slot="sidebar.session.action"]:only-child > button[class*="newSession"]:only-child) {
        display: none !important;
      }
    `
    const TAG_ID = 'dsh-asuta-hide-new-session/hide-new-session.css'

    return {
      apply(ctx) {
        ctx.effect(() => {
          // Idempotent across HMR re-activation: reuse an existing tag.
          const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(TAG_ID)}]`)
          if (existing !== null) return () => { existing.remove() }

          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-asuta-hide-new-session'
          tag.dataset.pluginCss = TAG_ID
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => { tag.remove() }
        }, 'hide-new-session: styles')
      },
    }
  },
})
