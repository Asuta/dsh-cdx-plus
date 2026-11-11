/* -------------------------------------------------------------------------- *
 * selection-quote — the browser half.
 *
 * Two actions on one selection: annotate it for the draft, or open it in the
 * user's own side chat. A separate surface —
 * the quote list — collects everything the session has quoted so far.
 *
 * The bar is document-level on purpose: a selection can outlive a composer
 * remount, and the bar must not go dead with it. The overlay slot entry below
 * only publishes the composer's write actions per session.
 * -------------------------------------------------------------------------- */

const NS = 'selectionQuote'
const SOURCE_NAME = 'selectionQuote'
const SOURCE_TRIGGER = '#'
const TAB_ID = 'dsh-asuta-selection-quote/list'
const TAB_KIND = 'selection-quote-list'
const BAR_ATTR = 'data-selection-quote-bar'
const TOAST_MS = 1900

const zh = {
  quote: '添加到对话',
  comment: '评论',
  sideChat: '在侧边聊天中提问',
  copy: '复制',
  send: '加入待发送注释',
  cancel: '取消',
  placeholder: '添加评论…',
  quoted: '已加入待发送注释',
  notes: '条注释',
  annotationCount: '1 条注释',
  selectedText: '所选文本',
  userComment: '用户评论',
  edit: '编辑注释',
  remove: '删除注释',
  clear: '清空注释',
  close: '关闭',
  copied: '已复制',
  failed: '未能加入注释，请稍后重试',
  noComposer: '这个会话的输入框还没就绪',
  sideChatMissing: '侧边对话插件没有运行',
  sideChatFailed: '没能打开侧边对话',
  panelTitle: '引用清单',
  panelGuide: '查看这个会话里发出的每一条引用，并跳回原文',
  panelEmpty: '这个会话还没有引用',
  panelSearch: '搜索引用或评论',
  panelExport: '导出 Markdown',
  panelInsert: '插入到输入框',
  panelJump: '跳回原文',
  panelLost: '找不到原文那一行',
  panelLoading: '读取中…',
  panelFailed: '读不到这个会话的记录'
}

const en = {
  quote: 'Add to conversation',
  comment: 'Comment',
  sideChat: 'Ask in side chat',
  copy: 'Copy',
  send: 'Add pending annotation',
  cancel: 'Cancel',
  placeholder: 'Add a comment…',
  quoted: 'Annotation added to draft',
  notes: 'annotations',
  annotationCount: '1 annotation',
  selectedText: 'Selected text',
  userComment: 'Your comment',
  edit: 'Edit annotation',
  remove: 'Delete annotation',
  clear: 'Clear annotations',
  close: 'Close',
  copied: 'Copied',
  failed: 'Could not add the annotation; please retry',
  noComposer: 'This session has no composer yet',
  sideChatMissing: 'The side chat plugin is not running',
  sideChatFailed: 'Could not open the side chat',
  panelTitle: 'Quotes',
  panelGuide: 'Every quote sent in this session, with a jump back to its source',
  panelEmpty: 'No quotes in this session yet',
  panelSearch: 'Search quotes and comments',
  panelExport: 'Export Markdown',
  panelInsert: 'Insert into composer',
  panelJump: 'Jump to source',
  panelLost: 'That row is gone',
  panelLoading: 'Loading…',
  panelFailed: 'Could not read this session'
}

let pluginCtx = null
let configCache = null
let sourceCount = 0
let sourceDisposer = null
let runtimeCount = 0
let runtimeDisposer = null
let bar = null
let commentNode = null
let pending = null
let lastRect = null
let toastNode = null
let toastTimer = 0

/** The composer write actions each mounted session published. */
const sessions = new Map()
const noteRanges = new Map()
let noteSequence = 0

function isZh() {
  const lang = typeof document === 'undefined' ? '' : String(document.documentElement.lang || '')
  const nav = typeof navigator === 'undefined' ? '' : String(navigator.language || '')
  return /^zh/iu.test(lang) || /^zh/iu.test(nav)
}

function label(key) {
  const table = isZh() ? zh : en
  const value = table[key]
  return value === undefined ? key : value
}

function config() {
  if (configCache !== null) return configCache
  let stored = null
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CONFIG_KEY)
    if (typeof raw === 'string' && raw !== '') stored = JSON.parse(raw)
  } catch {
    stored = null
  }
  configCache = sanitizeConfig(stored)
  return configCache
}

function setConfig(patch) {
  const merged = patch !== null && typeof patch === 'object' ? { ...config(), ...patch } : config()
  configCache = sanitizeConfig(merged)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CONFIG_KEY, JSON.stringify(configCache))
  } catch {
    // A blocked store must not lose the change in effect.
  }
  return configCache
}

function service(name) {
  if (pluginCtx === null) return null
  try {
    const value = typeof pluginCtx.get === 'function' ? pluginCtx.get(name) : null
    return value === undefined ? null : value
  } catch {
    return null
  }
}

function toast(text) {
  if (typeof document === 'undefined') return
  if (toastNode === null || !toastNode.isConnected) {
    toastNode = document.createElement('div')
    toastNode.className = 'dsq-toast'
    toastNode.setAttribute('role', 'status')
    document.body.appendChild(toastNode)
  }
  toastNode.textContent = String(text)
  toastNode.classList.add('dsq-toast-on')
  if (toastTimer !== 0) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastTimer = 0
    if (toastNode !== null) toastNode.classList.remove('dsq-toast-on')
  }, TOAST_MS)
}

/* -------------------------------------------------------------------------- *
 * Reading the selection
 * -------------------------------------------------------------------------- */

function elementOf(node) {
  if (node === null || node === undefined) return null
  if (node.nodeType === 3) return node.parentElement
  return node.nodeType === 1 ? node : null
}

function closestFrom(node, selector) {
  const element = elementOf(node)
  if (element === null || typeof element.closest !== 'function') return null
  return element.closest(selector)
}

/** The row a selection sits in, plus the turn and role that row carries. */
function anchorOf(node) {
  const element = elementOf(node)
  if (element === null || typeof element.closest !== 'function') return null
  const row = element.closest('[data-chat-anchor-key],[data-chat-node-key]')
  if (row === null) return null
  const attr = row.hasAttribute('data-chat-anchor-key') ? 'data-chat-anchor-key' : 'data-chat-node-key'
  const key = row.getAttribute(attr)
  if (typeof key !== 'string' || key === '') return null
  const turnRow = element.closest('[data-chat-turn]')
  const turn = turnRow === null ? '' : String(turnRow.getAttribute('data-chat-turn') || '')
  const flow = element.closest('[data-chat-flow-kind]')
  const kind = flow === null ? '' : String(flow.getAttribute('data-chat-flow-kind') || '')
  const role = kind === 'user' ? 'u' : kind === 'assistant' || kind === 'assistant-step' ? 'a' : ''
  return { attr, key, turn, role }
}

/** A selection inside one rendered code block is code, and keeps its language. */
function codeOf(range) {
  const pre = closestFrom(range.startContainer, 'pre')
  if (pre === null) return null
  if (closestFrom(range.startContainer, 'pre') !== closestFrom(range.endContainer, 'pre')) return null
  const code = pre.querySelector('code')
  const attr = (pre.getAttribute('data-language') || (code === null ? '' : code.getAttribute('data-language')) || '').trim()
  const tagged = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/u.exec(String(pre.className || '') + ' ' + String(code === null ? '' : code.className))
  return { lang: sanitizeLang(attr) || (tagged === null ? '' : sanitizeLang(tagged[1]) || '') }
}

function readSelection() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (closestFrom(range.startContainer, '[data-composer-card]') !== null) return null
  const host = closestFrom(range.startContainer, '[data-conversation-content]')
  if (host === null) return null
  const text = String(selection.toString()).replace(/^\n+|\n+$/gu, '')
  if (text.trim().length < config().minChars) return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const sessionId = String(host.getAttribute('data-conversation-session') || '')
  if (sessionId === '') return null
  const start = anchorOf(range.startContainer)
  const end = anchorOf(range.endContainer)
  const source = start !== null && end !== null && start.attr === end.attr && start.key === end.key ? start : null
  return { text, rect, sessionId, code: codeOf(range), source, range: range.cloneRange?.() ?? null }
}

/* -------------------------------------------------------------------------- *
 * Writing into the draft
 * -------------------------------------------------------------------------- */

function inputShellFor(sessionId) {
  const hub = service('conversation')
  const input = hub === null ? null : hub.input
  if (input === null || typeof input.shell !== 'function') return null
  try {
    return input.shell(sessionId) ?? null
  } catch {
    return null
  }
}

/** The mounted slot entry's actions, else the shell's own. */
function insertionFace(sessionId, shell) {
  const entry = sessions.get(sessionId)
  if (entry !== undefined) {
    const actions = entry.actions()
    if (actions !== null && actions !== undefined) return actions
  }
  const actions = shell === null ? null : shell.actions
  if (actions === null || actions === undefined || typeof actions.captureInsertion !== 'function') return null
  return actions
}

function ensureSource() {
  if (sourceDisposer !== null) return true
  const triggers = service('inputTriggers')
  if (triggers === null || typeof triggers.registerSource !== 'function') return false
  try {
    const legacy = triggers.registerSource({
      trigger: SOURCE_TRIGGER,
      name: SOURCE_NAME,
      showGroupTitle: false,
      candidates: () => [],
      codec: {
        clipboardText: (ref) => ref,
        serialize: (ref) => Promise.resolve(String(ref))
      }
    })
    try {
      const notes = triggers.registerSource({
        trigger: SOURCE_TRIGGER, name: NOTE_SOURCE, showGroupTitle: false, candidates: () => [],
        codec: {
          clipboardText: ref => noteBlock(decodeNote(ref)),
          serialize: ref => Promise.resolve(noteBlock(decodeNote(ref))),
        },
      })
      sourceDisposer = () => { notes?.(); legacy?.() }
    } catch (error) { legacy?.(); throw error }
    return true
  } catch {
    sourceDisposer = null
    return false
  }
}

function holdSource() {
  sourceCount += 1
  ensureSource()
  return () => {
    sourceCount -= 1
    if (sourceCount > 0) return
    const dispose = sourceDisposer
    sourceDisposer = null
    if (typeof dispose === 'function') {
      try {
        dispose()
      } catch {
        // The host tears the rest down with the plugin.
      }
    }
  }
}

/** A quote on the wire, with the coordinate that lets it jump back. */
function wireFor(captured, options) {
  const source = options.source
  const ref =
    source === null || source === undefined
      ? null
      : { s: options.sessionId, a: source.attr, k: source.key, t: source.turn, n: 0, r: source.role }
  const meta = { ref, path: captured && captured.path ? captured.path : '', lang: captured && captured.lang ? captured.lang : '' }
  return { block: quoteBlock(options.text, options.comment, options.code === true, meta), ref }
}

/** Add a pending annotation; only the host composer submits it. */
function insertQuote(sessionId, text, comment, code, source, range) {
  const note = createNote(sessionId, text, comment, code, source, range)
  const shell = inputShellFor(sessionId)
  const actions = insertionFace(sessionId, shell)
  if (!shell || !actions || !ensureSource() || typeof shell.insertReference !== 'function') {
    noteRanges.delete(note.id)
    toast(label('noComposer'))
    return false
  }
  try {
    const ok = shell.insertReference(noteAttachment(note), actions.captureInsertion()) === true
    if (!ok) noteRanges.delete(note.id)
    return ok
  } catch { noteRanges.delete(note.id); toast(label('noComposer')); return false }
}

function noteBlock(note) {
  if (note === null) throw new Error('Invalid annotation')
  return '\n' + wireFor(note.code, { ...note, code: note.code !== null && note.code !== undefined }).block + '\n\n'
}

function noteAttachment(note) {
  return { source: NOTE_SOURCE, ref: JSON.stringify(note), label: chipLabel(note.text, note.comment),
    appearance: 'session', clipboardText: noteBlock(note) }
}

function createNote(sessionId, text, comment, code, source, range) {
  const note = { v: 1, id: Date.now().toString(36) + '-' + (++noteSequence),
    sessionId, text, comment, code: code ?? null, source: source ?? null }
  if (range) noteRanges.set(note.id, range)
  return note
}

function draftNotes(shell) {
  return (shell?.draftSnapshot?.references ?? []).flatMap(reference => {
    const note = reference.source === NOTE_SOURCE ? decodeNote(reference.ref) : null
    return note ? [{ note, reference }] : []
  })
}

function changeNote(sessionId, id, comment) {
  const shell = inputShellFor(sessionId)
  if (!shell || !['plain', 'claimed'].includes(shell.snapshot?.phase)) return false
  const entry = draftNotes(shell).find(({ note }) => note.id === id)
  if (!entry) return false
  const replacement = comment === null ? null : noteAttachment({ ...entry.note, comment })
  shell.setDraft(editDraftReference(shell.draftSnapshot, entry.reference, replacement))
  shell.persistCurrentDraft?.()
  return true
}

/* -------------------------------------------------------------------------- *
 * The bar
 * -------------------------------------------------------------------------- */

function button(action, text) {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = 'dsq-bar-btn'
  node.dataset.action = action
  node.setAttribute('data-action', action)
  node.textContent = text
  return node
}

function ensureBar() {
  if (bar !== null && bar.isConnected) return bar
  bar = document.createElement('div')
  bar.className = 'dsq-bar'
  bar.setAttribute(BAR_ATTR, '')
  bar.appendChild(button('quote', label('quote')))
  bar.appendChild(button('side', label('sideChat')))
  document.body.appendChild(bar)
  return bar
}

function hideBar() {
  pending = null
  lastRect = null
  if (bar !== null) bar.classList.remove('dsq-bar-on')
  hideComment()
}

function place() {
  if (bar === null || lastRect === null) return
  const width = bar.offsetWidth || 220
  const height = bar.offsetHeight || 36
  const viewWidth = window.innerWidth
  const viewHeight = window.innerHeight
  const center = lastRect.left + lastRect.width / 2
  let left = center - width / 2
  left = Math.max(8, Math.min(left, viewWidth - width - 8))
  let top = lastRect.top - height - 8
  if (top < 8) top = Math.min(lastRect.bottom + 8, viewHeight - height - 8)
  bar.style.left = Math.round(left) + 'px'
  bar.style.top = Math.round(top) + 'px'
}

function showBar(found) {
  hideComment()
  ensureBar()
  pending = found
  lastRect = found.rect
  bar.classList.add('dsq-bar-on')
  place()
}

function hideComment() {
  if (commentNode !== null) {
    commentNode.remove()
    commentNode = null
  }
}

function showComment(edit = null) {
  if (pending === null && edit === null) return
  const target = edit?.note ?? pending
  const targetSession = edit?.sessionId ?? target.sessionId
  hideComment()
  if (bar !== null) bar.classList.remove('dsq-bar-on')
  const box = document.createElement('div')
  box.className = 'dsq-comment'
  const field = document.createElement('textarea')
  field.className = 'dsq-comment-field'
  field.rows = 1
  field.value = target.comment ?? ''
  field.setAttribute('aria-label', label('placeholder'))
  field.placeholder = label('placeholder')
  const row = document.createElement('div')
  row.className = 'dsq-comment-row'
  const sendBtn = button('send', '✓')
  sendBtn.title = label('send')
  sendBtn.setAttribute('aria-label', label('send'))
  sendBtn.className = 'dsq-bar-btn dsq-primary'
  const cancelBtn = button('cancel', '×')
  cancelBtn.setAttribute('aria-label', label('cancel'))
  cancelBtn.className = 'dsq-bar-btn'
  row.appendChild(sendBtn)
  row.appendChild(cancelBtn)
  box.appendChild(field)
  box.appendChild(row)
  document.body.appendChild(box)
  commentNode = box

  const width = Math.min(420, window.innerWidth - 16)
  const center = lastRect === null ? window.innerWidth / 2 : lastRect.left + lastRect.width / 2
  let left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8))
  let top = (lastRect === null ? 0 : lastRect.bottom + 8) + 6
  const estimated = 148
  if (top + estimated > window.innerHeight - 8) top = Math.max(8, (lastRect === null ? window.innerHeight : lastRect.top) - estimated - 8)
  box.style.left = Math.round(left) + 'px'
  box.style.top = Math.round(top) + 'px'
  field.focus({ preventScroll: true })

  const submit = () => {
    const comment = field.value.trim()
    const ok = edit
      ? changeNote(targetSession, target.id, comment)
      : insertQuote(targetSession, target.text, comment, target.code, target.source, target.range)
    if (ok) { hideBar(); window.getSelection()?.removeAllRanges?.() }
  }
  sendBtn.addEventListener('click', submit)
  cancelBtn.addEventListener('click', () => {
    hideComment()
    hideBar()
  })
  field.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      hideComment()
    }
  })
}

function openSideChat() {
  if (pending === null) return false
  const api = typeof window === 'undefined' ? null : window.__dshSidebarChat
  if (api === null || api === undefined || typeof api.open !== 'function') {
    toast(label('sideChatMissing'))
    return false
  }
  // Side chat inserts the reference into its own composer. Ensure the codec
  // exists before handing it over, just as insertQuote does for the main chat.
  if (!ensureSource()) {
    toast(label('failed'))
    return false
  }
  const target = pending
  hideBar()
  const note = createNote(target.sessionId, target.text, '', target.code, target.source, target.range)
  Promise.resolve(api.open({ parentSessionId: target.sessionId, reference: noteAttachment(note), mode: 'new' })).catch(() => {
    noteRanges.delete(note.id)
    toast(label('sideChatFailed'))
  })
  return true
}

function commitSelection(mode) {
  if (pending === null) return false
  const target = pending
  if (mode === 'side') {
    return openSideChat()
  }
  if (mode === 'comment' || mode === 'quote') {
    showComment()
    return true
  }
  hideBar()
  const ok = insertQuote(target.sessionId, target.text, '', target.code, target.source, target.range)
  if (ok) toast(label('quoted'))
  return true
}

function onDocumentMouseUp(event) {
  if (bar !== null && typeof bar.contains === 'function' && bar.contains(event.target)) return
  if (commentNode !== null && commentNode.contains(event.target)) return
  const found = readSelection()
  if (found === null) {
    if (bar !== null) bar.classList.remove('dsq-bar-on')
    pending = null
    return
  }
  showBar(found)
}

function onDocumentKeyUp(event) {
  if (event.key === 'Escape') {
    hideBar()
    return
  }
  if (event.shiftKey || event.key === 'Shift') {
    const found = readSelection()
    if (found !== null) showBar(found)
  }
}

function onDocumentMouseDown(event) {
  // Keep the selection alive while the bar itself is being clicked.
  if (bar !== null && bar.contains(event.target)) event.preventDefault()
  if (commentNode !== null && commentNode.contains(event.target)) return
  if (bar === null || !bar.contains(event.target)) {
    if (commentNode !== null && !commentNode.contains(event.target)) {
      hideComment()
    }
  }
}

function onScrollOrResize() {
  if (bar !== null && bar.classList.contains('dsq-bar-on')) hideBar()
}

function onBarClick(event) {
  const target = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-action]') : null
  if (target === null) return
  event.preventDefault()
  commitSelection(String(target.getAttribute('data-action') || ''))
}

function quoteBadge(quote) {
  if (quote === null || quote.ref === undefined) return null
  const wrapper = document.createElement('span')
  wrapper.className = 'dsq-sent-annotation'
  wrapper.dataset.dsqSentAnnotation = 'true'

  const badge = document.createElement('button')
  badge.type = 'button'
  badge.className = 'dsq-sent-annotation-badge'
  badge.setAttribute('aria-label', label('annotationCount'))
  badge.textContent = '▤ ' + label('annotationCount')
  badge.addEventListener('click', (event) => {
    event.preventDefault()
    jumpToRow(quote.ref)
  })

  const card = document.createElement('span')
  card.className = 'dsq-sent-annotation-card'
  card.setAttribute('role', 'tooltip')
  const quoteTitle = document.createElement('span')
  quoteTitle.className = 'dsq-sent-annotation-title'
  quoteTitle.textContent = label('selectedText') + ':'
  const quoteText = document.createElement('span')
  quoteText.className = 'dsq-sent-annotation-text'
  quoteText.textContent = quote.quote
  card.append(quoteTitle, quoteText)
  if (quote.comment !== '') {
    const commentTitle = document.createElement('span')
    commentTitle.className = 'dsq-sent-annotation-title'
    commentTitle.textContent = label('userComment') + ':'
    const commentText = document.createElement('span')
    commentText.className = 'dsq-sent-annotation-text'
    commentText.textContent = quote.comment
    card.append(commentTitle, commentText)
  }
  wrapper.append(badge, card)
  return wrapper
}

function replaceQuoteRange(row, start, end, quote) {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  const nodes = []
  let length = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    nodes.push({ node, start: length, end: length + node.nodeValue.length })
    length += node.nodeValue.length
  }
  const point = (position, isEnd) => {
    const item = nodes.find((entry) => position >= entry.start && (position < entry.end || (isEnd && position === entry.end)))
    if (item === undefined) return null
    return [item.node, Math.max(0, Math.min(item.node.nodeValue.length, position - item.start))]
  }
  const first = point(start, false)
  const last = point(end, true)
  if (first === null || last === null) return false
  const range = document.createRange()
  range.setStart(first[0], first[1])
  range.setEnd(last[0], last[1])
  const badge = quoteBadge(quote)
  if (badge === null) return false
  range.deleteContents()
  range.insertNode(badge)
  return true
}

function installRuntime() {
  runtimeCount += 1
  if (runtimeDisposer !== null) return releaseRuntimeOnce
  ensureBar()
  document.addEventListener('mouseup', onDocumentMouseUp, true)
  document.addEventListener('keyup', onDocumentKeyUp, true)
  document.addEventListener('mousedown', onDocumentMouseDown, true)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize, true)
  bar.addEventListener('click', onBarClick)
  const rowsIn = (root) => {
    const rows = new Set()
    const element = root?.nodeType === 3 ? root.parentElement : root
    if (element?.matches?.('[data-chat-anchor-key],[data-chat-node-key]')) rows.add(element)
    const row = element?.closest?.('[data-chat-anchor-key],[data-chat-node-key]')
    if (row !== null && row !== undefined) rows.add(row)
    for (const nested of element?.querySelectorAll?.('[data-chat-anchor-key],[data-chat-node-key]') || []) rows.add(nested)
    return rows
  }
  const decorateRow = (row) => {
    if (row === null || typeof row.querySelectorAll !== 'function') return
    if (row.getAttribute('data-chat-flow-kind') !== 'user') return
    // The row also contains message actions and a timestamp. Their text is
    // concatenated with the final q1 line, so parse only the user-text body.
    const body = row.querySelector('[data-slot="conversation.user.text.node"]')?.parentElement
    if (body === undefined || body === null) return
    const matches = findSerializedQuotes(body.textContent || '')
    for (const match of matches.reverse()) replaceQuoteRange(body, match.start, match.end, match.quote)
  }
  const hideExistingWire = () => {
    for (const row of rowsIn(document.body)) decorateRow(row)
  }
  hideExistingWire()
  const wireObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
    const rows = new Set()
    for (const record of records) {
      for (const row of rowsIn(record.target)) rows.add(row)
      for (const added of record.addedNodes || []) {
        for (const row of rowsIn(added)) rows.add(row)
      }
    }
    for (const row of rows) decorateRow(row)
  })
  if (wireObserver !== null && document.body !== null) {
    wireObserver.observe(document.body, { childList: true, characterData: true, subtree: true })
  }
  runtimeDisposer = () => {
    document.removeEventListener('mouseup', onDocumentMouseUp, true)
    document.removeEventListener('keyup', onDocumentKeyUp, true)
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
    wireObserver?.disconnect()
    window.removeEventListener('scroll', onScrollOrResize, true)
    window.removeEventListener('resize', onScrollOrResize, true)
    if (bar !== null) {
      bar.removeEventListener('click', onBarClick)
      bar.remove()
    }
    bar = null
    hideComment()
    if (toastNode !== null) {
      toastNode.remove()
      toastNode = null
    }
  }
  return releaseRuntimeOnce
}

function releaseRuntimeOnce() {
  runtimeCount -= 1
  if (runtimeCount > 0) return
  const dispose = runtimeDisposer
  runtimeDisposer = null
  if (dispose !== null) dispose()
  noteRanges.clear()
}

/* -------------------------------------------------------------------------- *
 * Styles
 * -------------------------------------------------------------------------- */

const CSS = [
  '[data-composer-chip="selectionQuoteNotes"]{display:none;}',
  '.dsq-sent-annotation{position:relative;display:inline-block;vertical-align:middle;margin:2px 0;z-index:4;}',
  '.dsq-sent-annotation-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2,#5b5b5b);border-radius:999px;background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:13px;line-height:1.35;cursor:pointer;}',
  '.dsq-sent-annotation:hover .dsq-sent-annotation-badge,.dsq-sent-annotation:focus-within .dsq-sent-annotation-badge{border-color:#c98160;box-shadow:0 0 0 1px #c98160;}',
  '.dsq-sent-annotation-card{position:absolute;display:none;right:0;bottom:calc(100% + 8px);width:min(480px,calc(100vw - 40px));max-height:min(360px,55vh);overflow:auto;box-sizing:border-box;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2,#555);border-radius:14px;background:linear-gradient(var(--dsw-alias-bg-layer-2,#303238),var(--dsw-alias-bg-layer-2,#303238)),#303238;box-shadow:0 8px 28px #0005;color:var(--dsw-alias-label-primary,#e8eaed);white-space:normal;z-index:2147483003;}',
  '.dsq-sent-annotation:hover .dsq-sent-annotation-card,.dsq-sent-annotation:focus-within .dsq-sent-annotation-card{display:flex;flex-direction:column;gap:5px;}',
  '.dsq-sent-annotation-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary,#aaa);}',
  '.dsq-sent-annotation-text{font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:5px;}',
  '[data-composer-overlay]:has(.dsq-draft){position:relative;height:auto;inset:auto;z-index:3;}',
  '.dsq-draft{position:relative;padding:12px 14px 4px;color:var(--dsw-alias-label-primary,#e8eaed);font:inherit;}',
  '.dsq-summary{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2,#555);border-radius:14px;background:var(--dsw-specific-selector,rgba(128,128,128,.15));}',
  '.dsq-summary button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;padding:8px 10px;}',
  '.dsq-summary-toggle{display:inline-flex;align-items:center;gap:6px;}',
  '.dsq-summary .dsq-clear{padding:2px 8px;margin-right:4px;border:1px solid var(--dsw-alias-border-l2,#666);border-radius:50%;}',
  '.dsq-notes{position:absolute;bottom:calc(100% - 4px);left:14px;width:min(550px,calc(100% - 28px));box-sizing:border-box;max-height:min(480px,60vh);overflow:auto;padding:20px 16px 16px;border-radius:18px;',
  'background:var(--dsw-specific-menu,#303238);backdrop-filter:blur(32px);border:1px solid var(--dsw-alias-border-l2,#555);box-shadow:0 8px 28px #0003;}',
  '.dsq-note{display:flex;align-items:flex-start;gap:16px;line-height:1.55;padding:0 0 20px;}.dsq-note:last-child{padding-bottom:0;}',
  '.dsq-note-number{flex:none;opacity:.7;}.dsq-note-content{flex:1;min-width:0;}.dsq-note-caption{color:var(--dsw-alias-label-tertiary,#aaa);margin-bottom:2px;}',
  '.dsq-note-text{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:10px;}',
  '.dsq-note-actions{display:flex;gap:8px;}.dsq-note-actions button,.dsq-notes-close{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:0 2px;}',
  '.dsq-notes-close{display:block;margin:-14px -6px 4px auto;}',
  '.dsq-marker{position:fixed;z-index:30;background:#c98160;color:white;border:1px solid white;border-radius:50% 50% 50% 6px;width:30px;height:32px;font:600 14px sans-serif;cursor:pointer;-webkit-app-region:no-drag;}',
  '.dsq-marker[hidden]{display:none;}',
  '.dsq-bar{position:fixed;z-index:2147483000;display:none;gap:2px;padding:4px;border-radius:12px;',
  'background:var(--dsw-specific-menu,#23262d);border:1px solid var(--dsw-alias-border-l2,#3a3f47);',
  'backdrop-filter:blur(32px);-webkit-app-region:no-drag;box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.35));}',
  '.dsq-bar.dsq-bar-on{display:flex;}',
  '.dsq-bar-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary,#e8eaed);',
  'font:inherit;font-size:13px;line-height:1;padding:8px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;}',
  '.dsq-bar-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));}',
  '.dsq-bar-btn.dsq-primary{background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff;}',
  '.dsq-comment{position:fixed;z-index:2147483001;width:min(420px,calc(100vw - 16px));box-sizing:border-box;padding:8px 10px 8px 18px;border-radius:30px;',
  'background:var(--dsw-specific-menu,#23262d);border:1px solid var(--dsw-alias-border-l2,#3a3f47);',
  'backdrop-filter:blur(32px);-webkit-app-region:no-drag;box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.35));display:flex;align-items:center;gap:8px;}',
  '.dsq-comment-field{resize:none;width:100%;box-sizing:border-box;border-radius:8px;padding:8px;',
  'background:transparent;color:var(--dsw-alias-label-primary,#e8eaed);',
  'border:0;outline:none;min-width:0;max-height:100px;font:inherit;font-size:14px;line-height:1.45;}',
  '.dsq-comment .dsq-primary{border-radius:50%;width:36px;height:36px;padding:0;font-size:22px;background:var(--dsw-alias-button-info-fill,#4d6bfe);}',
  '.dsq-comment-row{display:flex;justify-content:flex-end;gap:6px;}',
  '.dsq-toast{position:fixed;left:50%;bottom:88px;transform:translate(-50%,8px);z-index:2147483002;',
  'padding:8px 14px;border-radius:999px;background:var(--dsw-specific-menu,#23262d);',
  'border:1px solid var(--dsw-alias-border-l2,#3a3f47);color:var(--dsw-alias-label-primary,#e8eaed);',
  'font:inherit;font-size:13px;opacity:0;pointer-events:none;transition:opacity .16s ease,transform .16s ease;}',
  '.dsq-toast.dsq-toast-on{opacity:1;transform:translate(-50%,0);}',
  '.dsq-list{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;}',
  '.dsq-list-head{display:flex;gap:6px;padding:10px;border-bottom:1px solid var(--dsw-alias-border-l1,#33373f);}',
  '.dsq-list-search{flex:1;min-width:0;border-radius:8px;padding:6px 8px;background:var(--dsw-specific-input-major,#1b1e24);',
  'color:var(--dsw-alias-label-primary,#e8eaed);border:1px solid var(--dsw-alias-border-l1,#33373f);font:inherit;font-size:13px;}',
  '.dsq-list-body{flex:1;min-height:0;overflow:auto;padding:8px 10px 24px;}',
  '.dsq-row{border:1px solid var(--dsw-alias-border-l1,#33373f);border-radius:10px;padding:8px 10px;margin:0 0 8px;}',
  '.dsq-row-quote{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary,#e8eaed);line-height:1.5;',
  'border-left:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);padding-left:8px;margin-bottom:6px;}',
  '.dsq-row-comment{color:var(--dsw-alias-label-secondary,#b6bcc7);white-space:pre-wrap;word-break:break-word;margin-bottom:6px;}',
  '.dsq-row-meta{display:flex;gap:8px;align-items:center;color:var(--dsw-alias-label-tertiary,#8b929e);font-size:12px;}',
  '.dsq-row-link{appearance:none;border:0;background:transparent;color:var(--dsw-alias-state-business-primary,#4d6bfe);',
  'font:inherit;font-size:12px;cursor:pointer;padding:0;}',
  '.dsq-empty{padding:24px 10px;text-align:center;color:var(--dsw-alias-label-tertiary,#8b929e);}',
  '.dsq-flash{animation:dsq-flash 1.4s ease;}',
  '@keyframes dsq-flash{0%{background:rgba(77,107,254,.28);}100%{background:transparent;}}'
].join('')

function installStyles() {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-asuta-selection-quote'
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}

/* -------------------------------------------------------------------------- *
 * The quote list page
 * -------------------------------------------------------------------------- */

async function withSession(sessionId, read) {
  const service_ = service('sessions')
  if (service_ === null || typeof service_.retain !== 'function') throw new Error('no sessions service')
  const ref = service_.retain(sessionId, { source: 'selection-quote' })
  try {
    if (ref !== null && typeof ref === 'object' && ref.ready !== undefined) await ref.ready
    const session = ref !== null && typeof ref === 'object' && ref.binding ? ref.binding.session : null
    if (session === null || session === undefined) throw new Error('no session binding')
    return await read(session)
  } finally {
    try {
      if (ref !== null && typeof ref === 'object' && typeof ref.release === 'function') ref.release()
    } catch {
      // Releasing twice is the host's business.
    }
  }
}

async function readRows(sessionId) {
  return withSession(sessionId, (session) => {
    const snapshot = session.eventSource.getSnapshot()
    return quoteRowsFromEntries(snapshot.entries)
  })
}

function jumpToRow(ref) {
  if (ref === null || ref === undefined) return false
  const selector = '[' + ref.a + '="' + String(ref.k).replace(/["\\]/gu, '\\$&') + '"]'
  const row = document.querySelector(selector)
  if (row === null) return false
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  row.classList.remove('dsq-flash')
  void row.offsetWidth
  row.classList.add('dsq-flash')
  setTimeout(() => row.classList.remove('dsq-flash'), 1500)
  return true
}

function downloadText(filename, text) {
  try {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch {
    return false
  }
}

function buildListPage(react) {
  return function QuoteListBody(props) {
    const sessionId = props === null || props === undefined ? '' : props.sessionId
    const [rows, setRows] = react.useState([])
    const [query, setQuery] = react.useState('')
    const [state, setState] = react.useState('loading')

    react.useEffect(() => {
      let alive = true
      if (typeof sessionId !== 'string' || sessionId === '') {
        setState('failed')
        return () => {
          alive = false
        }
      }
      setState('loading')
      readRows(sessionId)
        .then((list) => {
          if (!alive) return
          setRows(list)
          setState('ready')
        })
        .catch(() => {
          if (!alive) return
          setState('failed')
        })
      return () => {
        alive = false
      }
    }, [sessionId])

    const visible = filterRows(rows, query)
    const head = react.createElement(
      'div',
      { className: 'dsq-list-head' },
      react.createElement('input', {
        className: 'dsq-list-search',
        value: query,
        placeholder: label('panelSearch'),
        onChange: (event) => setQuery(event.target.value)
      }),
      react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsq-row-link',
          onClick: () => {
            downloadText('quotes-' + String(Date.now()) + '.md', listMarkdown(visible, label('panelTitle')))
          }
        },
        label('panelExport')
      )
    )

    let body
    if (state === 'loading') body = react.createElement('div', { className: 'dsq-empty' }, label('panelLoading'))
    else if (state === 'failed') body = react.createElement('div', { className: 'dsq-empty' }, label('panelFailed'))
    else if (visible.length === 0) body = react.createElement('div', { className: 'dsq-empty' }, label('panelEmpty'))
    else
      body = visible.map((row, index) =>
        react.createElement(
          'div',
          { className: 'dsq-row', key: rowKey(row) + ':' + index },
          react.createElement('div', { className: 'dsq-row-quote' }, row.quote),
          row.comment === '' ? null : react.createElement('div', { className: 'dsq-row-comment' }, row.comment),
          react.createElement(
            'div',
            { className: 'dsq-row-meta' },
            react.createElement('span', null, '#' + row.seq + (row.time === '' ? '' : ' · ' + formatQuoteTime(row.time))),
            row.ref === undefined
              ? null
              : react.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsq-row-link',
                    onClick: () => {
                      if (!jumpToRow(row.ref)) toast(label('panelLost'))
                    }
                  },
                  label('panelJump')
                ),
            react.createElement(
              'button',
              {
                type: 'button',
                className: 'dsq-row-link',
                onClick: () => {
                  const source =
                    row.ref === undefined
                      ? null
                      : { attr: row.ref.a, key: row.ref.k, turn: row.ref.t, role: row.ref.r }
                  const ok = insertQuote(sessionId, row.quote, row.comment, row.code ? { lang: row.fence } : null, source)
                  toast(label(ok ? 'quoted' : 'failed'))
                }
              },
              label('panelInsert')
            )
          )
        )
      )

    return react.createElement('div', { className: 'dsq-list' }, head, react.createElement('div', { className: 'dsq-list-body' }, body))
  }
}

function installListPage(ctx) {
  const tabs = service('sidebarRightTabs')
  const right = service('sidebarRight')
  if (tabs === null || right === null) return
  if (typeof tabs.register !== 'function' || typeof right.openTab !== 'function') return
  let disposeTab = null
  try {
    disposeTab = tabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      title: () => label('panelTitle'),
      guide: [
        {
          id: 'selection-quote-list',
          order: 30,
          title: () => label('panelTitle'),
          description: () => label('panelGuide')
        }
      ]
    })
  } catch {
    return
  }
  const Body = buildListPage(react)
  const disposePane = ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: (sessionId) => ({ sessionId })
      },
      Body
    )
  )
  const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, () =>
      react.createElement('span', null, label('panelTitle'))
    )
  )
  pendingDisposers.push(() => {
    try {
      if (typeof disposeTitle === 'function') disposeTitle()
    } catch {
      // Best effort.
    }
    try {
      if (typeof disposePane === 'function') disposePane()
    } catch {
      // Best effort.
    }
    try {
      if (typeof disposeTab === 'function') disposeTab()
    } catch {
      // Best effort.
    }
  })
}

const pendingDisposers = []

function openListPage() {
  const right = service('sidebarRight')
  if (right === null || typeof right.openTab !== 'function') return false
  try {
    right.openTab(TAB_KIND)
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- *
 * Shortcuts
 * -------------------------------------------------------------------------- */

function shortcutDefaults(code) {
  const one = { code, modifiers: ['alt'] }
  return {
    'desktop:macos': one,
    'desktop:windows': one,
    'desktop:linux': one,
    'web:macos': one,
    'web:windows': one
  }
}

function registerShortcuts(ctx) {
  const shortcuts = service('shortcuts')
  if (shortcuts === null || typeof shortcuts.register !== 'function') return () => {}
  const disposers = []
  const add = (name, code, textKey, run) => {
    try {
      disposers.push(
        shortcuts.register({
          id: 'selection-quote.' + name,
          label: () => label(textKey),
          aliases: ['selection-quote', name],
          defaults: shortcutDefaults(code),
          regions: ['page', 'editable'],
          modals: [],
          resolve: () => {
            if (name === 'list') {
              return openListPage() ? { status: 'handled', run: () => {} } : { status: 'pass' }
            }
            const found = readSelection()
            if (found === null) return { status: 'pass' }
            showBar(found)
            return { status: 'handled', run: () => commitSelection(run) }
          }
        })
      )
    } catch {
      // A refused shortcut costs only the key.
    }
  }
  add('quote', 'KeyQ', 'quote', 'quote')
  add('comment', 'KeyC', 'comment', 'comment')
  add('side', 'KeyB', 'sideChat', 'side')
  add('list', 'KeyL', 'panelTitle', 'list')
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // Best effort.
      }
    }
  }
}

/* -------------------------------------------------------------------------- *
 * The overlay slot: one entry per mounted session, publishing its actions
 * -------------------------------------------------------------------------- */

function rangeForNote(note) {
  const cached = noteRanges.get(note.id)
  if (cached?.startContainer?.parentElement?.isConnected) return cached
  if (!note.source || !REF_ATTRS.includes(note.source.attr)) return null
  const host = Array.from(document.querySelectorAll('[data-conversation-content]'))
    .find(node => node.getAttribute('data-conversation-session') === note.sessionId)
  const row = host && Array.from(host.querySelectorAll('[' + note.source.attr + ']'))
    .find(node => node.getAttribute(note.source.attr) === note.source.key)
  if (!row) return null
  const walker = document.createTreeWalker(row, 4)
  const nodes = []
  let node, text = ''
  while ((node = walker.nextNode())) { nodes.push({ node, offset: text.length }); text += node.textContent }
  const start = text.indexOf(note.text)
  if (start < 0) return null
  const end = start + note.text.length
  const first = nodes.find(item => item.offset + item.node.textContent.length > start)
  const last = nodes.find(item => item.offset + item.node.textContent.length >= end)
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, start - first.offset)
  range.setEnd(last.node, end - last.offset)
  noteRanges.set(note.id, range)
  return range
}

function NoteIcon() {
  return react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
    react.createElement('path', { d: 'M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4l-4 3v-3H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z' }),
    react.createElement('path', { d: 'M8 9h8M8 13h5' }))
}

function OverlaySlot(props) {
  const latest = react.useRef(props)
  latest.current = props
  const sessionId = props?.sessionId ?? ''
  const [notes, setNotes] = react.useState([])
  const [expanded, setExpanded] = react.useState(false)
  const [locked, setLocked] = react.useState(false)
  const root = react.useRef(null)
  const previousIds = react.useRef(new Set())
  react.useEffect(() => {
    const shell = inputShellFor(sessionId)
    if (!shell) return undefined
    const refresh = () => {
      const next = draftNotes(shell)
      const ids = new Set(next.map(({ note }) => note.id))
      for (const id of previousIds.current) if (!ids.has(id)) noteRanges.delete(id)
      previousIds.current = ids
      setNotes(previous => previous.length === next.length && previous.every((entry, index) =>
        entry.reference.ref === next[index].reference.ref) ? previous : next)
      setLocked(!['plain', 'claimed'].includes(shell.snapshot?.phase))
    }
    refresh()
    const dispose = shell.state?.subscribe(refresh)
    return () => { dispose?.(); for (const id of previousIds.current) noteRanges.delete(id); previousIds.current = new Set() }
  }, [sessionId])

  react.useEffect(() => {
    const markers = []
    const highlights = []
    notes.forEach(({ note }, index) => {
      const range = rangeForNote(note)
      const anchor = range?.startContainer?.parentElement
      if (!anchor?.isConnected) return
      const host = anchor.closest('[data-conversation-content]')
      const marker = button('annotation', String(index + 1))
      marker.className = 'dsq-marker'
      marker.setAttribute('aria-label', label('edit') + ' ' + (index + 1))
      marker.addEventListener('click', () => { setExpanded(true); root.current?.scrollIntoView({ block: 'nearest' }) })
      document.body.appendChild(marker)
      const placeMarker = () => {
        const rect = range.getBoundingClientRect(), bounds = host?.getBoundingClientRect()
        marker.hidden = !bounds || rect.bottom < bounds.top || rect.top > bounds.bottom || !anchor.isConnected
        marker.style.top = Math.round(Math.max(bounds?.top ?? 0, rect.top) - 3) + 'px'
        marker.style.left = Math.round(Math.min(window.innerWidth - 36, (bounds?.right ?? rect.right) - 34)) + 'px'
      }
      placeMarker()
      window.addEventListener('scroll', placeMarker, true)
      window.addEventListener('resize', placeMarker)
      markers.push(() => { marker.remove(); window.removeEventListener('scroll', placeMarker, true); window.removeEventListener('resize', placeMarker) })
      highlights.push(range)
    })
    const highlightKey = 'dsq-' + sessionId.replace(/[^a-z0-9-]/giu, '')
    const highlightsApi = globalThis.CSS?.highlights
    let highlightStyle = null
    if (highlightsApi && globalThis.Highlight && highlights.length) {
      // Highlight names are per composer: simultaneous side threads cannot clear each other.
      highlightsApi.set(highlightKey, new globalThis.Highlight(...highlights))
      highlightStyle = document.createElement('style')
      highlightStyle.dataset.plugin = 'dsh-asuta-selection-quote'
      highlightStyle.textContent = '::highlight(' + highlightKey + '){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.24));}'
      document.head.appendChild(highlightStyle)
    }
    return () => { markers.forEach(dispose => dispose()); highlightsApi?.delete(highlightKey); highlightStyle?.remove() }
  }, [notes, sessionId])
  react.useEffect(() => {
    const sessionId = props === null || props === undefined ? '' : props.sessionId
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    const entry = {
      actions: () => {
        const current = latest.current
        return current === null || current === undefined ? null : current.inputActions ?? null
      }
    }
    sessions.set(sessionId, entry)
    return () => {
      if (sessions.get(sessionId) === entry) sessions.delete(sessionId)
    }
  }, [props === null || props === undefined ? '' : props.sessionId])
  if (notes.length === 0) return null
  const h = react.createElement
  const count = notes.length + ' ' + label('notes')
  return h('div', { className: 'dsq-draft', ref: root },
    h('div', { className: 'dsq-summary' },
      h('button', { type: 'button', className: 'dsq-summary-toggle', 'aria-expanded': expanded,
        onClick: () => setExpanded(!expanded) }, h(NoteIcon), count),
      h('button', { type: 'button', className: 'dsq-clear', 'aria-label': label('clear'), disabled: locked,
        onClick: () => { for (const { note } of notes.slice().reverse()) changeNote(sessionId, note.id, null) } }, '×')),
    expanded && h('div', { className: 'dsq-notes', role: 'dialog', 'aria-label': count,
      onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false) } } },
      h('button', { type: 'button', className: 'dsq-notes-close', 'aria-label': label('close'), onClick: () => setExpanded(false) }, '×'),
      notes.map(({ note }, index) => h('div', { className: 'dsq-note', key: note.id },
        h('span', { className: 'dsq-note-number' }, (index + 1) + '.'),
        h('div', { className: 'dsq-note-content' },
          h('div', { className: 'dsq-note-caption' }, label('selectedText') + ':'),
          h('div', { className: 'dsq-note-text' }, note.text),
          h('div', { className: 'dsq-note-caption' }, label('userComment') + ':'),
          h('div', { className: 'dsq-note-text' }, note.comment || '—')),
        h('div', { className: 'dsq-note-actions' },
          h('button', { type: 'button', disabled: locked, 'aria-label': label('edit'),
            onClick: event => { lastRect = event.currentTarget.getBoundingClientRect(); showComment({ sessionId, note }) } }, '✎'),
          h('button', { type: 'button', disabled: locked, 'aria-label': label('remove'),
            onClick: () => changeNote(sessionId, note.id, null) }, '⌫'))))))
}

/* -------------------------------------------------------------------------- *
 * Entry
 * -------------------------------------------------------------------------- */

const inject = ['slots', 'locale', 'inputTriggers']

function apply(ctx) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  pluginCtx = ctx

  ctx.effect(() => {
    try {
      ctx.locale.register(NS, { zh, en })
    } catch {
      // The bar carries its own dictionary either way.
    }
    return () => {}
  }, 'selection-quote: dictionaries')

  ctx.effect(() => installStyles(), 'selection-quote: styles')
  ctx.effect(() => holdSource(), 'selection-quote: reference source')
  ctx.effect(() => installRuntime(), 'selection-quote: runtime')
  ctx.effect(() => registerShortcuts(ctx), 'selection-quote: shortcuts')

  const installPage = (hostCtx) => {
    try {
      installListPage(hostCtx)
    } catch {
      // A host without the sidebar loses only the page.
    }
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['sidebarRightTabs', 'sidebarRight'], (tabCtx) => installPage(tabCtx))
  } else {
    installPage(ctx)
  }

  ctx.slots.inject('conversation.input.overlay', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.overlay',
        id: 'selection-quote.selection',
        order: 5,
        locale: NS,
        inject: () => ({})
      },
      OverlaySlot
    )
  )

  ctx.effect(() => {
    const api = {
      version: 1,
      config,
      setConfig,
      openList: () => openListPage(),
      readSelection,
      commit: (mode) => commitSelection(String(mode || 'quote')),
      rows: (sessionId) => readRows(String(sessionId)),
      notes: (sessionId) => draftNotes(inputShellFor(sessionId)).map(({ note }) => note),
      insert: (sessionId, text, comment) => insertQuote(String(sessionId), String(text || ''), String(comment || ''), null),
      sessions: () => Array.from(sessions.keys())
    }
    window.__selectionQuote = api
    return () => {
      if (window.__selectionQuote === api) delete window.__selectionQuote
    }
  }, 'selection-quote: public api')
}

return { inject, apply }
