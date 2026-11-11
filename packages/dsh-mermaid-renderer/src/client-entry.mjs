import mermaid from 'mermaid'
import { hasMermaidLanguage, looksLikeMermaidSource, sourceHash } from './logic.mjs'

const PLUGIN = 'dsh-asuta-mermaid-renderer'
const GLOBAL = '__dshMermaidRenderer'
const STYLE_ID = PLUGIN + '/style'
const CHAT = '[data-conversation-content]'
const ASSISTANT = '[data-chat-flow-kind="assistant-step"]'
const CANDIDATE = CHAT + ' ' + ASSISTANT + ' .md-code-block code'

const CSS = [
  '.md-code-block[data-dsh-mermaid-state="rendered"]:not([data-dsh-mermaid-source="open"]) [data-code-block-content]{display:none}',
  '.md-code-block[data-dsh-mermaid-state="rendered"][data-dsh-mermaid-source="open"] [data-code-block-content]{display:block}',
  '.dsh-mermaid-actions{display:flex;align-items:center;gap:8px;padding:6px 10px;font:12px/1.4 system-ui,sans-serif;color:var(--dsw-alias-label-secondary,#666)}',
  '.dsh-mermaid-source-toggle{border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:6px;padding:3px 8px;background:transparent;color:inherit;cursor:pointer;font:inherit}',
  '.dsh-mermaid-source-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}',
  '.dsh-mermaid-diagram{overflow:auto;padding:14px 12px;max-width:100%;color:var(--dsw-alias-label-primary,#222)}',
  '.dsh-mermaid-diagram[hidden]{display:none}',
  '.dsh-mermaid-diagram svg{display:block;max-width:100%;height:auto;margin:0 auto}',
  '.md-code-block[data-dsh-mermaid-source="open"] .dsh-mermaid-diagram{display:none}',
  '.dsh-mermaid-error{padding:8px 12px;color:var(--dsw-alias-label-secondary,#666);font:12px/1.5 system-ui,sans-serif}'
].join('\n')

function language() {
  return String(document.documentElement.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function installStyles() {
  if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = PLUGIN
  style.dataset.pluginCss = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

function apply(ctx) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) return
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, suppressErrorRendering: true })
  let stopped = false
  let timer = null
  let sequence = 0
  const wrappers = new Set()
  const renderPending = new WeakMap()
  const cleanStyle = installStyles()

  function removeOwned(wrapper) {
    wrapper.querySelectorAll('[data-dsh-mermaid-owned="true"]').forEach(node => node.remove())
    wrapper.removeAttribute('data-dsh-mermaid-state')
    wrapper.removeAttribute('data-dsh-mermaid-source')
    wrapper.removeAttribute('data-dsh-mermaid-hash')
  }

  function forget(wrapper) {
    renderPending.delete(wrapper)
    if (wrappers.delete(wrapper)) removeOwned(wrapper)
  }

  function hasMermaidTitle(wrapper) {
    const banner = wrapper.querySelector('[data-code-block-banner]')
    if (!banner) return false
    return [...banner.querySelectorAll('span, div')].some(node => node.children.length === 0 && node.textContent?.trim().toLowerCase() === 'mermaid')
  }

  function ensureActions(wrapper) {
    let actions = wrapper.querySelector(':scope > .dsh-mermaid-actions')
    if (actions) return actions
    actions = document.createElement('div')
    actions.className = 'dsh-mermaid-actions'
    actions.dataset.dshMermaidOwned = 'true'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dsh-mermaid-source-toggle'
    button.addEventListener('click', () => {
      const sourceOpen = wrapper.dataset.dshMermaidSource !== 'open'
      wrapper.dataset.dshMermaidSource = sourceOpen ? 'open' : 'closed'
      const diagram = wrapper.querySelector('.dsh-mermaid-diagram')
      if (diagram) diagram.hidden = sourceOpen
      button.textContent = sourceOpen
        ? (language() === 'zh' ? '查看图表' : 'Show diagram')
        : (language() === 'zh' ? '查看源码' : 'View source')
      button.setAttribute('aria-expanded', String(sourceOpen))
    })
    button.textContent = language() === 'zh' ? '查看源码' : 'View source'
    button.setAttribute('aria-expanded', 'false')
    actions.appendChild(button)
    const content = wrapper.querySelector(':scope > [data-code-block-content]')
    if (content) content.insertAdjacentElement('beforebegin', actions)
    else wrapper.appendChild(actions)
    return actions
  }

  async function renderCode(code) {
    const source = code.textContent || ''
    const wrapper = code.closest('[data-code-block-content]')?.parentElement
    if (!wrapper) return
    const step = code.closest(ASSISTANT)
    if (!step || !step.closest(CHAT) || !source.trim()
      || (!hasMermaidLanguage(code.classList) && !hasMermaidTitle(wrapper) && !looksLikeMermaidSource(source))) {
      forget(wrapper)
      return
    }
    if (step.querySelector('[data-streaming="true"]')) {
      if (wrapper.dataset.dshMermaidHash !== sourceHash(source)) forget(wrapper)
      return
    }
    const hash = sourceHash(source)
    if (wrapper.dataset.dshMermaidHash === hash && wrapper.dataset.dshMermaidState === 'error') return
    if (wrapper.dataset.dshMermaidHash === hash && wrapper.dataset.dshMermaidState === 'rendered'
      && wrapper.querySelector('.dsh-mermaid-diagram')) return
    if (renderPending.get(wrapper)?.hash === hash && renderPending.get(wrapper)?.code === code) return
    const pending = { hash, code }
    renderPending.set(wrapper, pending)
    wrappers.add(wrapper)
    removeOwned(wrapper)
    const actions = ensureActions(wrapper)
    const button = actions.querySelector('button')
    if (button) button.disabled = true
    const id = PLUGIN + '-' + (++sequence)
    try {
      const result = await mermaid.render(id, source)
      if (stopped || !code.isConnected || renderPending.get(wrapper) !== pending || sourceHash(code.textContent || '') !== hash) return
      const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
      const svg = parsed.documentElement
      if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Invalid SVG output')
      const diagram = document.createElement('div')
      diagram.className = 'dsh-mermaid-diagram'
      diagram.dataset.dshMermaidOwned = 'true'
      diagram.setAttribute('role', 'img')
      diagram.setAttribute('aria-label', language() === 'zh' ? 'Mermaid 图表' : 'Mermaid diagram')
      diagram.appendChild(document.importNode(svg, true))
      wrapper.appendChild(diagram)
      wrapper.dataset.dshMermaidState = 'rendered'
      wrapper.dataset.dshMermaidHash = hash
      if (button) button.disabled = false
    } catch (error) {
      if (stopped || !code.isConnected || renderPending.get(wrapper) !== pending || sourceHash(code.textContent || '') !== hash) return
      wrapper.dataset.dshMermaidState = 'error'
      wrapper.dataset.dshMermaidHash = hash
      const notice = document.createElement('div')
      notice.className = 'dsh-mermaid-error'
      notice.dataset.dshMermaidOwned = 'true'
      notice.setAttribute('role', 'status')
      notice.textContent = language() === 'zh' ? '图表无法渲染，已保留原始代码。' : 'Could not render this diagram. The source code is preserved.'
      wrapper.appendChild(notice)
      if (button) button.remove()
    } finally {
      if (renderPending.get(wrapper) === pending) renderPending.delete(wrapper)
    }
  }

  function scan() {
    if (stopped) return
    const seen = new Set()
    document.querySelectorAll(CANDIDATE).forEach(code => {
      const wrapper = code.closest('[data-code-block-content]')?.parentElement
      if (wrapper) seen.add(wrapper)
      void renderCode(code)
    })
    for (const wrapper of wrappers) if (!seen.has(wrapper)) forget(wrapper)
  }

  function scheduleScan() {
    if (stopped || timer !== null) return
    timer = window.setTimeout(() => { timer = null; scan() }, 100)
  }

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-streaming'] })
  scan()
  const api = { scan, offline: true, version: 1 }
  window[GLOBAL] = api
  ctx.effect(() => () => {
    stopped = true
    observer.disconnect()
    if (timer !== null) window.clearTimeout(timer)
    for (const wrapper of wrappers) forget(wrapper)
    cleanStyle()
    if (window[GLOBAL] === api) delete window[GLOBAL]
  }, PLUGIN + ': renderer')
}

export { apply, CSS, hasMermaidLanguage, sourceHash }
export const inject = []
