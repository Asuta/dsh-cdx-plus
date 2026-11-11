import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { createZstdDecompress } from 'node:zlib'
import { Readable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { setImmediate as yieldToLoop } from 'node:timers/promises'

// Search never migrates historical logs or attempts unknown future formats.
export function isUnsupportedSearchFormat(snapshot) {
  return snapshot != null && ((snapshot.formatStatus !== undefined && snapshot.formatStatus !== 'current')
    || (Number.isInteger(snapshot.header?.version) && snapshot.header.version !== 4))
}

// Only the installed v4 physical JSONL format has been verified.
export function canStream(snapshot) {
  return snapshot?.formatStatus === 'current' && snapshot.header?.version === 4
    && snapshot.location?.kind === 'jsonl' && typeof snapshot.location.path === 'string'
    && isAbsolute(snapshot.location.path) && /\.jsonl(?:\.zstd)?$/i.test(snapshot.location.path)
}

async function bytes(file, size, offset, length, signal) {
  signal?.throwIfAborted()
  if (offset + length > size) throw new Error('Incomplete Zstandard frame')
  const buffer = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const result = await file.read(buffer, read, length - read, offset + read)
    signal?.throwIfAborted()
    if (!result.bytesRead) throw new Error('Session log changed while reading')
    read += result.bytesRead
  }
  return buffer
}

// Node 24's decoder stops at the first frame. Locate each frame with bounded
// header reads, then stream just that region. Never materialize a whole frame.
async function* frameRanges(file, size, signal) {
  for (let offset = 0; offset < size;) {
    const start = offset
    const magic = (await bytes(file, size, offset, 4, signal)).readUInt32LE()
    offset += 4
    if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
      const length = (await bytes(file, size, offset, 4, signal)).readUInt32LE()
      offset += 4 + length
      if (offset > size) throw new Error('Incomplete Zstandard skippable frame')
      continue
    }
    if (magic !== 0xfd2fb528) throw new Error('Invalid Zstandard frame')
    const descriptor = (await bytes(file, size, offset++, 1, signal))[0]
    if (descriptor & 0x18) throw new Error('Unsupported Zstandard frame header')
    const single = Boolean(descriptor & 0x20), contentFlag = descriptor >>> 6, dictFlag = descriptor & 3
    offset += (single ? 0 : 1) + (dictFlag === 3 ? 4 : dictFlag)
      + (contentFlag === 0 ? (single ? 1 : 0) : 1 << contentFlag)
    for (;;) {
      const block = (await bytes(file, size, offset, 3, signal)).readUIntLE(0, 3)
      offset += 3
      const type = (block >>> 1) & 3, length = block >>> 3
      if (type === 3 || length > 128 * 1024) throw new Error('Invalid Zstandard block')
      offset += type === 1 ? 1 : length
      if (offset > size) throw new Error('Incomplete Zstandard block')
      if (block & 1) break
    }
    if (descriptor & 4) offset += 4
    if (offset > size) throw new Error('Incomplete Zstandard checksum')
    yield { start, end: offset - 1 }
  }
}

async function* regionChunks(file, size, { start, end }, signal) {
  for (let offset = start; offset <= end;) {
    const chunk = await bytes(file, size, offset, Math.min(64 * 1024, end - offset + 1), signal)
    offset += chunk.length
    yield chunk
  }
}

async function* logChunks(file, size, compressed, signal) {
  const ranges = compressed ? frameRanges(file, size, signal) : [{ start: 0, end: size - 1 }]
  for await (const range of ranges) {
    signal?.throwIfAborted()
    const source = Readable.from(regionChunks(file, size, range, signal), { objectMode: false, highWaterMark: 64 * 1024 })
    const decoded = compressed ? createZstdDecompress({ chunkSize: 64 * 1024 }) : source
    const completion = (compressed ? pipeline(source, decoded, { signal }) : finished(source, { cleanup: true }))
      .then(() => null, error => error)
    try {
      for await (const chunk of decoded) {
        signal?.throwIfAborted()
        yield chunk
      }
      const error = await completion
      if (error) throw error
    } finally {
      // Also runs when the caller finds a match or cancels mid-frame.
      source.destroy()
      decoded.destroy()
      await completion
    }
  }
}

export async function scanLog(snapshot, matchMessage, signal) {
  signal?.throwIfAborted()
  const file = await open(snapshot.location.path, 'r')
  try {
    const before = await file.stat()
    if (!before.size) throw new Error('Empty session log')
    let headerSeen = false, expectedSeq = 0, parts = [], length = 0, lines = 0
    for await (const chunk of logChunks(file, before.size, /\.zstd$/i.test(snapshot.location.path), signal)) {
      let start = 0
      for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
        signal?.throwIfAborted()
        const part = chunk.subarray(start, end)
        const line = parts.length ? Buffer.concat([...parts, part], length + part.length) : part
        parts = []; length = 0
        if (++lines % 256 === 0) await yieldToLoop(undefined, { signal })
        const row = JSON.parse(line.toString('utf8'))
        if (!headerSeen) {
          if (row?.type === 'session' && row.version !== 4) throw Object.assign(new Error('Search does not support this session format'), { code: 'SEARCH_UNSUPPORTED_FORMAT' })
          if (row?.type !== 'session' || row.version !== 4 || row.id !== snapshot.header.id) throw new Error('Session log header changed')
          headerSeen = true
        } else {
          if (!row || typeof row.type !== 'string' || row.seq !== expectedSeq++ || !row.data || typeof row.data !== 'object') throw new Error('Invalid session event')
          const snippet = matchMessage(row)
          if (snippet !== null) return snippet
        }
        start = end + 1
      }
      if (start < chunk.length) {
        const part = chunk.subarray(start)
        parts.push(part); length += part.length
      }
    }
    if (!headerSeen || length) throw new Error('Incomplete JSONL record')
    const after = await file.stat()
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Session log changed while reading')
    return null
  } finally {
    await file.close()
  }
}
