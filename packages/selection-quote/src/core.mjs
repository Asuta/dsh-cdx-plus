/**
 * selection-quote — the pure half.
 *
 * The wire format is byte-compatible with dsh-client-ui-quote (MIT), so a
 * quote written by either plugin reads back in the other: "> ❝ …" opens the
 * quote, "> ❞ …" the comment, and "> ※ │q1:<base64url>" carries the
 * coordinate that lets a capsule jump back to the row it came from.
 *
 * Nothing here touches the DOM or the host, so node --test drives it directly.
 */

export const QUOTE_MARK = '\u275D'
export const COMMENT_MARK = '\u275E'
export const REPLY_MARK = '\u203B'
export const REF_PREFIX = '\u2502q1:'
export const REF_LINE = /^\s*\u203B\s*[^\u2502\n]*?\u2502q1:([A-Za-z0-9_-]+)\s*$/u
export const REPLY_INSTRUCTION =
  '指令：请把本条消息里的引用块按出现顺序记为「引用1」「引用2」…，回复时逐条对应回应，每条回应前标注「引用N」。'

export const REF_VERSION = 1
export const REF_ATTRS = ['data-chat-anchor-key', 'data-chat-node-key']
export const ROLE_CODES = ['a', 'u', 't']
export const CONFIG_KEY = 'selection-quote:v1:config'
export const NOTE_SOURCE = 'selectionQuoteNotes'

/** Notes live inside the host semantic draft, including persistence and failed-send restoration. */
export function decodeNote(ref) {
  try {
    const note = JSON.parse(ref)
    return note?.v === 1 && typeof note.id === 'string' && typeof note.text === 'string'
      && typeof note.comment === 'string' && typeof note.sessionId === 'string' ? note : null
  } catch { return null }
}

/** Replace exactly one reference while preserving prose, command and all other references. */
export function editDraftReference(draft, target, replacement) {
  const start = target.offset, end = start + target.length
  const text = replacement?.clipboardText ?? ''
  const delta = text.length - target.length
  return {
    ...draft,
    text: draft.text.slice(0, start) + text + draft.text.slice(end),
    references: draft.references.flatMap(ref => {
      if (ref === target) return replacement ? [{ ...replacement, offset: start, length: text.length }] : []
      return [{ ...ref, offset: ref.offset >= end ? ref.offset + delta : ref.offset }]
    }),
  }
}

export const CONFIG_DEFAULTS = {
  minChars: 1,
  maxQuoteChars: 4000,
  replyByDefault: false,
  attribution: true,
  highlight: true
}

/** A stored patch, whitelisted: unknown keys and out-of-range numbers drop out. */
export function sanitizeConfig(raw) {
  const next = { ...CONFIG_DEFAULTS }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return next
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    const value = raw[key]
    if (typeof value !== typeof CONFIG_DEFAULTS[key]) continue
    if (key === 'minChars' || key === 'maxQuoteChars') {
      const number = Math.round(Number(value))
      if (!Number.isFinite(number)) continue
      if (key === 'minChars' && (number < 1 || number > 50)) continue
      if (key === 'maxQuoteChars' && (number < 0 || number > 20000)) continue
      next[key] = number
      continue
    }
    next[key] = value
  }
  return next
}

/** The lines that carry text, with the blank edges trimmed. */
export function blockLines(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const lines = text.split(/\r?\n/u).map((line) => line.replace(/\s+$/u, ''))
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  return lines
}

/**
 * A line whose first non-space character is one of the wire marks would be
 * read back as structure, so one backslash in front makes it content.
 */
export function escapeLine(line) {
  const match = /^(\s*)([\\\u275E\u203B])/u.exec(line)
  if (match === null) return line
  return match[1] + '\\' + line.slice(match[1].length)
}

export function unescapeLine(line) {
  const match = /^(\s*)\\([\\\u275E\u203B])/u.exec(line)
  if (match === null) return line
  return match[1] + line.slice(match[1].length + 1)
}

export function flat(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/gu, ' ').trim()
}

export function clip(text, max) {
  const value = String(text === null || text === undefined ? '' : text)
  if (!Number.isFinite(max) || max <= 0 || value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}

/** The chip's visible label: the quote, plus the comment when there is one. */
export function chipLabel(quoteText, commentText) {
  const quote = flat(quoteText)
  const comment = flat(commentText)
  if (comment === '') return clip(quote, 48)
  return clip(quote, 30) + ' · ' + clip(comment, 22)
}

/** The quote without the Markdown marks this plugin adds, for text matching. */
export function plainOf(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[`]+/gu, '')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/\*([^*]+)\*/gu, '$1')
}

/* base64url over UTF-8, spelled out so a Chinese session id survives and the
 * harness needs neither btoa nor Buffer. */

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function utf8Bytes(text) {
  const bytes = []
  for (const char of String(text)) {
    const code = char.codePointAt(0)
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
  }
  return bytes
}

function utf8String(bytes) {
  let out = ''
  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index]
    const width =
      first < 0x80 ? 1 : (first & 0xe0) === 0xc0 ? 2 : (first & 0xf0) === 0xe0 ? 3 : (first & 0xf8) === 0xf0 ? 4 : 0
    if (width === 0 || index + width > bytes.length) return null
    let code = first < 0x80 ? first : first & (0xff >> (width + 1))
    for (let step = 1; step < width; step += 1) {
      const next = bytes[index + step]
      if ((next & 0xc0) !== 0x80) return null
      code = (code << 6) | (next & 0x3f)
    }
    if ((width === 2 && code < 0x80) || (width === 3 && code < 0x800) || (width === 4 && code < 0x10000)) return null
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null
    out += String.fromCodePoint(code)
    index += width
  }
  return out
}

export function base64UrlEncode(text) {
  const bytes = utf8Bytes(text)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]
    const b = index + 1 < bytes.length ? bytes[index + 1] : null
    const c = index + 2 < bytes.length ? bytes[index + 2] : null
    out += B64URL.charAt(a >> 2)
    out += B64URL.charAt(((a & 0x03) << 4) | ((b === null ? 0 : b) >> 4))
    if (b === null) break
    out += B64URL.charAt(((b & 0x0f) << 2) | ((c === null ? 0 : c) >> 6))
    if (c === null) break
    out += B64URL.charAt(c & 0x3f)
  }
  return out
}

export function base64UrlDecode(value) {
  const text = String(value === null || value === undefined ? '' : value)
  if (text.length === 0 || text.length % 4 === 1) return null
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const char of text) {
    const digit = B64URL.indexOf(char)
    if (digit === -1) return null
    buffer = (buffer << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return bytes
}

/** A coordinate as the body of a ref line; "" when it cannot be one. */
export function encodeRef(ref) {
  if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) return ''
  const sessionId = ref.s !== undefined ? ref.s : ref.sessionId
  const attr = ref.a !== undefined ? ref.a : ref.attr
  const key = ref.k !== undefined ? ref.k : ref.key
  const rawTurn = ref.t !== undefined ? ref.t : ref.turn
  if (typeof sessionId !== 'string' || sessionId === '') return ''
  if (!REF_ATTRS.includes(attr)) return ''
  if (typeof key !== 'string' || key === '') return ''
  const turn =
    typeof rawTurn === 'string' ? rawTurn : typeof rawTurn === 'number' && Number.isFinite(rawTurn) ? String(rawTurn) : ''
  const ordinal = Number.isSafeInteger(ref.n) && ref.n >= 0 ? ref.n : 0
  const role = ROLE_CODES.includes(ref.r) ? ref.r : ''
  const data = { v: REF_VERSION, s: sessionId, a: attr, k: key, t: turn, n: ordinal }
  if (role !== '') data.r = role
  return base64UrlEncode(JSON.stringify(data))
}

/** A ref line's payload back to a coordinate, or null on any kind of damage. */
export function decodeRef(value) {
  const bytes = base64UrlDecode(value)
  if (bytes === null || bytes.length === 0) return null
  const json = utf8String(bytes)
  if (json === null) return null
  let data
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.v !== REF_VERSION) return null
  if (typeof data.s !== 'string' || data.s === '') return null
  if (!REF_ATTRS.includes(data.a)) return null
  if (typeof data.k !== 'string' || data.k === '') return null
  if (typeof data.t !== 'string') return null
  if (!Number.isSafeInteger(data.n) || data.n < 0) return null
  const ref = { v: REF_VERSION, s: data.s, a: data.a, k: data.k, t: data.t, n: data.n }
  if (ROLE_CODES.includes(data.r)) ref.r = data.r
  return ref
}

/** The readable half of a ref line — wire copy, not UI copy. */
export function wireSourceLabel(ref) {
  if (ref === null || typeof ref !== 'object') return ''
  const rawTurn = ref.t === undefined || ref.t === null ? '' : String(ref.t)
  const turn = rawTurn.trim()
  const role = ref.r === 'a' ? '助手' : ref.r === 'u' ? '我' : ref.r === 't' ? '工具' : ''
  if (turn === '' && role === '') return ''
  if (turn === '') return '引自' + role + '的消息'
  return '引自第 ' + turn + ' 轮' + (role === '' ? '' : ' · ' + role)
}

export function sanitizePath(value) {
  const path = String(value === null || value === undefined ? '' : value).trim()
  if (path === '' || path.length > 200 || /\s|[~]/u.test(path) || path.includes('```')) return null
  return path
}

export function sanitizeLang(value) {
  const lang = String(value === null || value === undefined ? '' : value).trim()
  if (lang === '' || lang.length > 24 || !/^[\w+#.-]+$/u.test(lang)) return null
  return lang
}

export function withLineRange(path, start, end) {
  const clean = sanitizePath(path)
  if (clean === null) return null
  const from = Number.isSafeInteger(start) && start >= 1 ? start : null
  const to = Number.isSafeInteger(end) && end >= 1 ? end : null
  if (from === null || to === null) return clean
  if (from === to) return clean + '#L' + from
  return clean + '#L' + Math.min(from, to) + '-L' + Math.max(from, to)
}

/** "src/app.ts#L12-L48" back to a file and a 1-based range. */
export function parseCodeSource(value) {
  if (typeof value !== 'string' || value === '') return null
  const match = /^(.*?)(?:#L(\d+)(?:-L?(\d+))?)?$/u.exec(value)
  if (match === null || match[1] === '' || !/[\\/.]/u.test(match[1])) return null
  const line = match[2] === undefined ? null : Number(match[2])
  const end = match[3] === undefined ? line : Number(match[3])
  if (line !== null && (!Number.isSafeInteger(line) || line < 1)) return null
  if (end !== null && (!Number.isSafeInteger(end) || end < line)) return null
  return { path: match[1], line, end }
}

export function formatCodeSource(source) {
  if (source === null || source === undefined) return ''
  const range =
    !source.line ? '' : ' · L' + source.line + (source.end !== null && source.end !== source.line ? '-L' + source.end : '')
  return source.path + range
}

export function fileAddress(sessionId, path) {
  if (typeof sessionId !== 'string' || sessionId === '' || typeof path !== 'string' || path === '') return null
  const normalized = path.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '')
  const encode = (segment) => encodeURIComponent(segment).replace(/%3A/giu, ':')
  return 'dsh-resource://file/session/' + encode(sessionId) + '/' + normalized.split('/').map(encode).join('/')
}

/**
 * A selection, plus the comment typed on it, as the block the model reads.
 * A selection from a code block travels as a real fenced block ("code ===
 * true"), its file riding in the fence's info string.
 */
export function quoteBlock(text, comment, code, meta) {
  const options = meta === null || typeof meta !== 'object' ? {} : meta
  const path = sanitizePath(options.path) || ''
  const lang = code === true ? sanitizeLang(options.lang) || '' : ''
  const label = typeof options.label === 'string' ? options.label.trim() : ''
  const halves = [
    { mark: QUOTE_MARK, lines: blockLines(text) },
    { mark: COMMENT_MARK, lines: blockLines(comment) }
  ]
  const block = []
  for (const half of halves) {
    if (code === true && half.mark === QUOTE_MARK && half.lines.length > 0) {
      const fence = half.lines.some((line) => /^\s*[`]{3}/u.test(line)) ? '~~~' : '```'
      const info = path !== '' ? path : lang
      block.push('> ' + half.mark + ' ' + fence + (info === '' ? '' : ' ' + info))
      for (const line of half.lines) block.push(line.trim() === '' ? '>' : '> ' + escapeLine(line))
      block.push('> ' + fence)
      continue
    }
    for (let index = 0; index < half.lines.length; index += 1) {
      const line = half.lines[index]
      const body = escapeLine(line)
      if (index === 0) block.push(line.trim() === '' ? '> ' + half.mark : '> ' + half.mark + ' ' + body)
      else block.push(line.trim() === '' ? '>' : '> ' + body)
    }
  }
  if (options.reply === true) {
    const instruction =
      typeof options.replyInstruction === 'string' && options.replyInstruction !== ''
        ? options.replyInstruction
        : REPLY_INSTRUCTION
    block.push('> ' + REPLY_MARK + ' ' + instruction)
  }
  const wire = encodeRef(options.ref)
  if (wire !== '') block.push('> ' + REPLY_MARK + ' ' + (label === '' ? '' : label + ' ') + REF_PREFIX + wire)
  return block.join('\n')
}

/** The same block as a draft chip: the leading newline gives it its own paragraph. */
export function chipRef(text, comment, code, meta) {
  return '\n' + quoteBlock(text, comment, code, meta) + '\n\n'
}

/** Read every serialized quote back out of a run of text. */
export function splitQuoteRuns(text) {
  const value = String(text === null || text === undefined ? '' : text)
  if (!value.includes(QUOTE_MARK)) return null
  const lines = value.split('\n')
  const segments = []
  let loose = ''
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const mark = line.indexOf(QUOTE_MARK)
    const head = mark === -1 ? '' : line.slice(0, mark)
    const bare = head.replace(/[>\s]/gu, '') === ''
    const glued = bare === false && /[>][ \t]*$/u.test(head)
    if (mark === -1 || (bare === false && glued === false)) {
      loose += (loose === '' ? '' : '\n') + line
      index += 1
      continue
    }
    if (glued) {
      const prefix = head.replace(/>[ \t]*$/u, '')
      if (prefix.trim() !== '') loose += (loose === '' ? '' : '\n') + prefix
    }
    const body = [line.slice(mark + QUOTE_MARK.length).replace(/^\s/u, '')]
    index += 1
    while (index < lines.length && lines[index].startsWith('>')) {
      body.push(lines[index].replace(/^>\s?/u, ''))
      index += 1
    }
    const before = loose.trim()
    if (before !== '') segments.push({ type: 'text', text: before })
    loose = ''
    const carried = []
    let wireRef = null
    for (const entry of body) {
      if (/^\s*\u203B\s*(?:\u6307\u4ee4|Instruction)(?:\s|[:：]|$)/u.test(entry)) continue
      const wire = REF_LINE.exec(entry)
      if (wire !== null) {
        if (wireRef === null) wireRef = decodeRef(wire[1])
        continue
      }
      carried.push(entry)
    }
    const cut = carried.findIndex((entry) => entry.replace(/^\s+/u, '').startsWith(COMMENT_MARK))
    let quoteLines = cut === -1 ? carried : carried.slice(0, cut)
    const commentLines = cut === -1 ? [] : carried.slice(cut)
    if (commentLines.length > 0) {
      commentLines[0] = commentLines[0].replace(/^\s+/u, '').slice(COMMENT_MARK.length).replace(/^\s/u, '')
    }
    let code = null
    const fence = quoteLines.length > 0 ? quoteLines[0].match(/^\s*([`]{3,}|~~~+)\s*(\S*)\s*$/u) : null
    if (fence !== null) {
      const token = fence[1].charAt(0) === '`' ? '```' : '~~~'
      code = fence[2] === undefined ? '' : fence[2]
      quoteLines = quoteLines.slice(1)
      if (quoteLines.length > 0 && quoteLines[quoteLines.length - 1].trim() === token) quoteLines = quoteLines.slice(0, -1)
    }
    const quote = quoteLines.map(unescapeLine).join('\n').replace(/\s+$/u, '')
    const comment = commentLines.map(unescapeLine).join('\n').replace(/\s+$/u, '')
    if (quote.trim() !== '' || comment.trim() !== '') {
      const segment = { type: 'quote', quote, comment, code }
      if (wireRef !== null) segment.ref = wireRef
      segments.push(segment)
    }
  }
  const tail = loose.trim()
  if (tail !== '') segments.push({ type: 'text', text: tail })
  return segments.length === 0 ? null : segments
}

/** Parse the text rendered inside one Markdown blockquote, restoring its Markdown quote prefix. */
export function parseRenderedQuote(text) {
  const value = String(text === null || text === undefined ? '' : text)
  if (!value.includes(REF_PREFIX)) return null
  const markdown = value.split(/\r?\n/u).map((line) => '> ' + line).join('\n')
  const segments = splitQuoteRuns(markdown)
  return segments === null ? null : segments.find((segment) => segment.type === 'quote' && segment.ref !== undefined) || null
}

/** Locate complete serialized quote blocks in a raw user-message string. */
export function findSerializedQuotes(text) {
  const value = String(text === null || text === undefined ? '' : text)
  if (!value.includes(REF_PREFIX) || !value.includes(QUOTE_MARK)) return []
  const lines = value.split(/\r?\n/u)
  const offsets = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    const tail = value.slice(offset + line.length)
    offset += line.length + (tail.startsWith('\r\n') ? 2 : tail.startsWith('\n') ? 1 : 0)
  }
  const found = []
  for (let index = 0; index < lines.length; index += 1) {
    const first = lines[index].replace(/^>\s?/u, '')
    if (!/^\s*\u275D/u.test(first)) continue
    let endLine = -1
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor].replace(/^>\s?/u, '')
      if (REF_LINE.test(candidate)) { endLine = cursor; break }
      if (cursor > index && (candidate.trim() === '' || /^\s*\u275D/u.test(candidate))) break
    }
    if (endLine === -1) continue
    const start = offsets[index]
    const end = offsets[endLine] + lines[endLine].length
    const rawBlock = lines.slice(index, endLine + 1).map((line) => '> ' + line.replace(/^>\s?/u, '')).join('\n')
    const segment = splitQuoteRuns(rawBlock)?.find((item) => item.type === 'quote' && item.ref !== undefined)
    if (segment !== undefined) found.push({ start, end, quote: segment })
    index = endLine
  }
  return found
}

/** The text between the quotes, which is what the reader actually wrote. */
export function looseText(segments) {
  if (!Array.isArray(segments)) return ''
  return segments
    .filter((segment) => segment.type === 'text')
    .map((segment) => segment.text)
    .join('\n\n')
}

/** A quote as the opener of a side thread: a blockquote, or a fenced block. */
export function sideQuestion(text, code, path) {
  const lines = blockLines(text)
  if (code === true && lines.length > 0) {
    const fence = lines.some((line) => /^\s*[`]{3}/u.test(line)) ? '~~~' : '```'
    const clean = sanitizePath(path) || ''
    return [fence + (clean === '' ? '' : ' ' + clean)].concat(lines, [fence]).join('\n')
  }
  return lines.map((line) => (line.trim() === '' ? '>' : '> ' + line)).join('\n')
}

function textOf(record) {
  if (record === null || typeof record !== 'object' || !Array.isArray(record.content)) return ''
  return record.content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/** Every message of a session, oldest first. */
export function messagesFromEntries(entries) {
  const messages = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
    const event = entry.event
    if (event === null || typeof event !== 'object') continue
    const kind = event.type
    if (kind !== 'user/message' && kind !== 'assistant/message') continue
    const record =
      kind === 'user/message' ? event.data : event.data === null || event.data === undefined ? null : event.data.message
    const text = textOf(record)
    if (text.trim() === '') continue
    messages.push({
      seq: Number.isSafeInteger(Number(event.seq)) ? Number(event.seq) : 0,
      time: typeof event.time === 'string' ? event.time : '',
      role: kind === 'user/message' ? 'user' : 'assistant',
      text
    })
  }
  return messages
}

/** Every quote a session has sent, newest first. */
export function quoteRowsFromEntries(entries) {
  const rows = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
    const event = entry.event
    if (event === null || typeof event !== 'object' || event.type !== 'user/message') continue
    const data = event.data
    const segments = splitQuoteRuns(textOf(data))
    if (segments === null) continue
    for (const segment of segments) {
      if (segment.type !== 'quote') continue
      const row = {
        id: data !== null && typeof data === 'object' && typeof data.id === 'string' ? data.id : '',
        seq: Number.isSafeInteger(Number(event.seq)) ? Number(event.seq) : 0,
        time: typeof event.time === 'string' ? event.time : '',
        quote: segment.quote,
        comment: typeof segment.comment === 'string' ? segment.comment : '',
        code: segment.code !== null && segment.code !== undefined,
        fence: typeof segment.code === 'string' ? segment.code : ''
      }
      if (segment.ref !== undefined) row.ref = segment.ref
      rows.push(row)
    }
  }
  rows.reverse()
  return rows
}

/** The text of one turn, by role. */
export function turnTexts(entries, turn, role) {
  const all = messagesFromEntries(entries).filter((message) => String(message.seq) === String(turn))
  const picked = role === undefined || role === null || role === '' ? all : all.filter((message) => message.role === role)
  return picked.map((message) => message.text)
}

export function firstLineOf(text, limit) {
  const line = String(text === null || text === undefined ? '' : text).split('\n')[0].trim()
  const cap = typeof limit === 'number' && limit > 0 ? limit : 60
  return line.length <= cap ? line : line.slice(0, cap - 1) + '…'
}

export function formatQuoteTime(value) {
  if (typeof value !== 'string' || value === '') return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return (
    parsed.getFullYear() +
    '-' +
    pad(parsed.getMonth() + 1) +
    '-' +
    pad(parsed.getDate()) +
    ' ' +
    pad(parsed.getHours()) +
    ':' +
    pad(parsed.getMinutes())
  )
}

export function filterRows(rows, query) {
  const needle = String(query === null || query === undefined ? '' : query).trim().toLowerCase()
  const list = Array.isArray(rows) ? rows : []
  if (needle === '') return list.slice()
  return list.filter((row) => (String(row.quote) + '\n' + String(row.comment)).toLowerCase().includes(needle))
}

/** A stable identity for one list row. */
export function rowKey(row) {
  return String(row.id) + '|' + String(row.seq) + '|' + String(row.quote).slice(0, 40)
}

export function listMarkdown(rows, header) {
  const list = Array.isArray(rows) ? rows : []
  const title = String(header === null || header === undefined || header === '' ? '引用清单' : header)
  const lines = ['# ' + title, '']
  if (list.length === 0) {
    lines.push('_（还没有引用）_', '')
    return lines.join('\n')
  }
  list.forEach((row, index) => {
    lines.push('## ' + (index + 1) + '. ' + firstLineOf(row.quote, 80), '')
    if (row.code === true) {
      const info = typeof row.fence === 'string' && row.fence !== '' ? ' ' + row.fence : ''
      lines.push('```' + info, String(row.quote), '```', '')
    } else {
      for (const line of String(row.quote).split('\n')) lines.push('> ' + line)
      lines.push('')
    }
    if (row.comment !== '') lines.push('**评论**：' + row.comment, '')
    const when = formatQuoteTime(row.time)
    lines.push('_第 ' + (row.seq === 0 ? '?' : row.seq) + ' 条事件' + (when === '' ? '' : ' · ' + when) + '_', '')
  })
  return lines.join('\n')
}

export function listJson(rows, sessionId, header) {
  const list = Array.isArray(rows) ? rows : []
  return JSON.stringify(
    {
      kind: 'dsh-selection-quote/list',
      version: 1,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      title: typeof header === 'string' ? header : '',
      exportedAt: new Date().toISOString(),
      count: list.length,
      quotes: list.map((row, index) => {
        const ref = row.ref === undefined || row.ref === null ? null : row.ref
        return {
          index: index + 1,
          quote: row.quote,
          comment: typeof row.comment === 'string' ? row.comment : '',
          code: row.code === true,
          path: typeof row.fence === 'string' && row.fence !== '' ? row.fence : null,
          source:
            ref === null
              ? null
              : {
                  sessionId: typeof ref.s === 'string' ? ref.s : null,
                  anchorAttr: typeof ref.a === 'string' ? ref.a : null,
                  anchorKey: typeof ref.k === 'string' ? ref.k : null,
                  turn: ref.t === undefined ? null : ref.t,
                  role: typeof ref.r === 'string' ? ref.r : null
                },
          time: typeof row.time === 'string' ? row.time : ''
        }
      })
    },
    null,
    2
  )
}

/** The exchange a thread ends on: last question, and the answer after it. */
export function threadConclusion(messages, limit) {
  const list = Array.isArray(messages) ? messages : []
  const cap = typeof limit === 'number' && limit > 0 ? limit : 4000
  let questionIndex = -1
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].role === 'user') {
      questionIndex = index
      break
    }
  }
  let answer = ''
  for (let index = list.length - 1; index > questionIndex; index -= 1) {
    if (list[index].role === 'assistant') {
      answer = list[index].text
      break
    }
  }
  const question = questionIndex === -1 ? '' : list[questionIndex].text
  let text = question === '' ? '' : '> ' + question.split('\n').join('\n> ') + '\n\n'
  text = (text + answer).trim()
  if (text.length > cap) text = text.slice(0, cap) + '\n…（截断）'
  return { question, answer, text }
}

export function threadMarkdown(messages, header) {
  const list = Array.isArray(messages) ? messages : []
  const title = String(header === null || header === undefined || header === '' ? '侧边线程' : header)
  const lines = ['# ' + title, '']
  if (list.length === 0) {
    lines.push('_（还没有内容）_', '')
    return lines.join('\n')
  }
  list.forEach((message, index) => {
    lines.push('## ' + (index + 1) + '. ' + (message.role === 'user' ? '我' : '助手'), '')
    lines.push(message.text, '')
    const when = formatQuoteTime(message.time)
    if (when !== '') lines.push('_' + when + '_', '')
  })
  return lines.join('\n')
}
