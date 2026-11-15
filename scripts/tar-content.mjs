import { createRequire } from 'node:module';
import path from 'node:path';

// Reuse the parser shipped with the workflow's pinned npm CLI. No extraction.
async function contents(buffer) {
  if (!process.env.npm_execpath) throw Error('Run via npm run publish:ci.');
  const { Parser } = createRequire(process.env.npm_execpath)('tar');
  const files = new Map();
  await new Promise((resolve, reject) => {
    const parser = new Parser({ strict: true, onReadEntry(entry) {
      if (entry.type === 'Directory') { entry.resume(); return; }
      if (entry.type !== 'File' || !entry.path.startsWith('package/') || files.has(entry.path)) {
        reject(Error('Unexpected tarball entry: ' + entry.path));
        entry.resume();
        return;
      }
      const chunks = [];
      const file = { executable: Boolean(entry.mode & 0o111), data: null };
      files.set(entry.path, file);
      entry.on('data', chunk => chunks.push(chunk));
      entry.on('end', () => { file.data = Buffer.concat(chunks); });
      entry.on('error', reject);
    } });
    parser.on('error', reject);
    parser.on('end', resolve);
    parser.end(buffer);
  });
  return files;
}
function normalizedText(name, data) {
  if (!/[.](?:js|mjs|json|md|txt|yml|yaml|css|svg|html|ts|tsx)$/.test(name) && !/^(?:LICENSE|NOTICE)(?:[.].*)?$/.test(path.posix.basename(name))) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
  } catch { return null; }
}
export async function equivalentTarballs(local, remote) {
  const [a, b] = await Promise.all([contents(local), contents(remote)]);
  if (!a.size || a.size !== b.size) return false;
  for (const [name, file] of a) {
    const other = b.get(name);
    if (!other || file.executable !== other.executable || !file.data || !other.data) return false;
    if (file.data.equals(other.data)) continue;
    const normalized = normalizedText(name, file.data);
    if (normalized === null || normalized !== normalizedText(name, other.data)) return false;
  }
  return true;
}
