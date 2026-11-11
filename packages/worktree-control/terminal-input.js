/** Preserve VT input while recognizing Ctrl+C, including Windows ConPTY key records. */
export function terminalInputDecoder() {
  let pending = ''
  const decode = text => {
    pending += text
    // CSI Vk;Sc;UnicodeChar;KeyDown;ControlKeyState;RepeatCount _
    const stop = pending.includes(String.fromCharCode(3)) || /\x1b\[\d+;\d+;3;1;\d+;\d+_/.test(pending)
    if (stop) { pending = ''; return { stop: true, data: '' } }
    const start = pending.lastIndexOf(String.fromCharCode(27))
    const incomplete = start >= 0 && /^\x1b(?:\[[\d;]*)?$/.test(pending.slice(start))
    const data = incomplete ? pending.slice(0, start) : pending
    pending = incomplete ? pending.slice(start) : ''
    // Bound malformed or hostile unterminated input sequences.
    if (pending.length > 128) { const rest = pending; pending = ''; return { stop: false, data: data + rest } }
    return { stop: false, data }
  }
  Object.defineProperty(decode, 'pending', { get: () => pending })
  decode.flush = () => {
    const data = pending
    pending = ''
    return { stop: false, data }
  }
  return decode
}
