function objectAt(text, start) {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char.charCodeAt(0) === 92) escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return undefined
}

function decode(text) {
  const value = JSON.parse(text)
  if (!value || !Array.isArray(value.findings) || !['patch is correct', 'patch is incorrect'].includes(value.overall_correctness)
    || typeof value.overall_explanation !== 'string' || !Number.isFinite(value.overall_confidence_score)
    || value.overall_confidence_score < 0 || value.overall_confidence_score > 1) throw new Error('审查结果不符合 Codex 格式。')
  for (const finding of value.findings) {
    const location = finding?.code_location
    const range = location?.line_range
    if (typeof finding?.title !== 'string' || typeof finding?.body !== 'string'
      || !Number.isFinite(finding.confidence_score) || finding.confidence_score < 0 || finding.confidence_score > 1
      || (finding.priority !== undefined && finding.priority !== null && ![0, 1, 2, 3].includes(finding.priority))
      || typeof location?.absolute_file_path !== 'string' || !location.absolute_file_path
      || !Number.isInteger(range?.start) || !Number.isInteger(range?.end)
      || range.start < 1 || range.end < range.start) throw new Error('审查发现的字段无效。')
  }
  return { format: 'structured', ...value }
}

export function parseReport(raw) {
  try { return decode(raw.trim()) } catch { /* The model may wrap JSON in prose or fences. */ }
  const candidates = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue
    const candidate = objectAt(raw, i)
    if (candidate) { candidates.push(candidate); i += candidate.length - 1 }
  }
  for (const candidate of candidates.reverse()) {
    try { return decode(candidate) } catch { /* Keep looking for an actual report. */ }
  }
  return { format: 'text', text: raw.trim() }
}

function locationLink(location) {
  const path = location.absolute_file_path
  const { start, end } = location.line_range
  const label = path + ':' + start + (end === start ? '' : '-' + end)
  const target = encodeURI(path.replaceAll(String.fromCharCode(92), '/'))
    .replaceAll('?', '%3F').replaceAll('#', '%23').replaceAll(')', '%29')
  return '[' + label.replaceAll(']', String.fromCharCode(92) + ']') + '](' + target + '#L' + start + (end === start ? '' : '-L' + end) + ')'
}

export function renderReport(report) {
  if (report.format === 'text') return '## 代码审查 · 非结构化结果' + String.fromCharCode(10, 10)
    + '审查代理未按 Codex JSON 格式返回。以下是原始回复，不能据此断言没有发现问题。'
    + String.fromCharCode(10, 10) + report.text
  const verdict = report.overall_correctness === 'patch is correct' ? '补丁正确' : '补丁存在问题'
  const lines = ['## 代码审查 · ' + verdict,
    '整体置信度：' + Math.round(report.overall_confidence_score * 100) + '%',
    report.overall_explanation || '审查代理未提供整体说明。']
  if (report.findings.length === 0) lines.push('未发现符合报告标准的可行动问题。')
  for (const finding of report.findings) {
    const priority = finding.priority ?? Number((finding.title.match(/^\[P([0-3])\]/) || [])[1])
    const title = /^\[P[0-3]\]/.test(finding.title) || !Number.isInteger(priority)
      ? finding.title : '[P' + priority + '] ' + finding.title
    lines.push('### ' + title, locationLink(finding.code_location),
      finding.body, '置信度：' + Math.round(finding.confidence_score * 100) + '%')
  }
  return lines.join(String.fromCharCode(10, 10))
}
