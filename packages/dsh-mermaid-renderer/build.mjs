import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const result = await build({
  entryPoints: [resolve(root, 'src/client-entry.mjs')], bundle: true,
  platform: 'browser', format: 'cjs', target: ['es2020'], minify: true,
  write: false, legalComments: 'inline',
})
const bundle = result.outputFiles[0].text
const client = [
  "window.__ModuleLoader__.load({",
  "  id: 'dsh-asuta-mermaid-renderer',",
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  bundle,
  '    return module.exports;',
  '  }',
  '});',
  ''
].join('\n')
const output = resolve(root, 'lib/client.js')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, client)
console.log('Built offline browser bundle:', output, Math.round(Buffer.byteLength(client) / 1024) + ' KiB')
