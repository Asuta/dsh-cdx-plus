import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export class ReviewJournal {
  constructor(directory) { this.directory = directory }

  filename(parentId) {
    const key = createHash('sha256').update(String(parentId)).digest('hex')
    return join(this.directory, key + '.json')
  }

  async write(parentId, record) {
    await mkdir(this.directory, { recursive: true })
    const target = this.filename(parentId)
    const temporary = target + '.' + randomUUID() + '.tmp'
    await writeFile(temporary, JSON.stringify({ version: 1, ...record }), 'utf8')
    await rename(temporary, target)
  }

  async read(parentId) {
    try { return JSON.parse(await readFile(this.filename(parentId), 'utf8')) }
    catch (error) { if (error?.code === 'ENOENT') return undefined; throw error }
  }
}
