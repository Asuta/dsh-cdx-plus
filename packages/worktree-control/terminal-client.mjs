// Runs inside DSH's ordinary native terminal. Credentials stay in a short-lived
// local file; neither the shell command nor the terminal history contains them.
import { readFile } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import { once } from 'node:events'
import { terminalInputDecoder } from './terminal-input.js'

let connection, inputTimer, ended = false, stopping = false, queue = Promise.resolve()
const inputDecoder = new StringDecoder('utf8')
const decodeInput = terminalInputDecoder()
const request = async body => {
  const response = await fetch(connection.url, { method: 'POST', headers: { 'content-type': 'application/json',
    'x-worktree-terminal': connection.secret }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error('终端连接失败：' + response.status)
  return response
}
async function stop() {
  if (stopping || ended || !connection) return
  stopping = true
  clearTimeout(inputTimer)
  try { await request({ action: 'stop' }) } catch { /* The host may already be gone. */ }
}
const resize = () => {
  if (!ended) void request({ action: 'resize', cols: Math.min(500, process.stdout.columns || 100), rows: Math.min(200, process.stdout.rows || 28) }).catch(() => {})
}
const forwardInput = decoded => {
  if (ended || stopping) return
  if (decoded.stop) { void stop(); return }
  const text = decoded.data
  if (!text) return
  queue = queue.then(() => request({ action: 'input', data: text })).catch(error => {
    if (!ended && !stopping) { process.stderr.write('\r\n' + error.message + '\r\n'); void stop() }
  })
}
const input = data => {
  clearTimeout(inputTimer)
  forwardInput(decodeInput(inputDecoder.write(data)))
  // Allow fragmented CSI/ConPTY records to finish, but do not hold a lone Esc
  // until another key arrives. Use the same queue to preserve input ordering.
  if (decodeInput.pending && !ended && !stopping) inputTimer = setTimeout(() => forwardInput(decodeInput.flush()), 40)
}
try {
  connection = JSON.parse(await readFile(process.argv[2], 'utf8'))
  const response = await request({ action: 'run' })
  // Each run owns a fresh terminal. Show the user's command, not the bridge launcher.
  process.stdout.write(String.fromCharCode(27) + '[2J' + String.fromCharCode(27) + '[H')
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.on('data', input)
  process.stdin.resume()
  process.stdout.on('resize', resize)
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  resize()
  let buffer = '', completed = false
  const decoder = new TextDecoder()
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const frame = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1)
      if (frame.ready) resize()
      if (frame.data && !process.stdout.write(frame.data)) await once(process.stdout, 'drain')
      if (frame.status) {
        completed = true
        process.exitCode = frame.status === 'succeeded' ? 0 : 1
        process.stdout.write('\r\n' + (frame.status === 'succeeded' ? '✓ 执行完成' : '✕ ' + (frame.error || '执行失败')) + '\r\n')
      }
    }
  }
  if (!completed) throw new Error('执行连接中断，请检查环境命令状态。')
} catch (error) {
  process.stderr.write('\r\n' + error.message + '\r\n')
  process.exitCode = 1
  await stop()
} finally {
  ended = true
  clearTimeout(inputTimer)
  process.stdin.off('data', input)
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.stdin.pause()
  process.stdout.off('resize', resize)
  process.off('SIGINT', stop)
  process.off('SIGTERM', stop)
}
