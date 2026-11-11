import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'

const execute = promisify(execFile)
const LIMIT = 8 * 1024 * 1024
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const splitPaths = value => value.split('\0').filter(Boolean)

export async function git(cwd, args) {
  const { stdout } = await execute('git', ['--no-pager', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], {
    cwd, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: LIMIT,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout
}

export async function catalog(cwd) {
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD']).catch(() => '')).trim()
  const branch = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim()
  const branches = (await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'])).trim().split('\n').filter(Boolean).filter(value => !value.endsWith('/HEAD'))
  const upstream = (await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim()
  return { root, head, branch, branches, upstream }
}

function syntheticPatch(path, data) {
  if (data.includes(0)) return { patch: '', skipped: '二进制文件' }
  const text = data.toString('utf8')
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const header = ['diff --git a/' + path + ' b/' + path, 'new file mode 100644', '--- /dev/null', '+++ b/' + path]
  const patch = [...header, ...(lines.length ? ['@@ -0,0 +1,' + lines.length + ' @@', ...lines.map(line => '+' + line), ...(text.endsWith('\n') ? [] : ['\\ No newline at end of file'])] : [])].join('\n') + '\n'
  return { patch }
}

function counts(patch) {
  let additions = 0, deletions = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

export async function summary(cwd) {
  const repo = await catalog(cwd)
  const base = repo.head || EMPTY_TREE
  const numbers = splitPaths(await git(repo.root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', base, '--']))
  const untracked = splitPaths(await git(repo.root, ['ls-files', '--others', '--exclude-standard', '-z']))
  let additions = 0, deletions = 0
  for (const entry of numbers) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(entry)
    if (match) { additions += Number(match[1]) || 0; deletions += Number(match[2]) || 0 }
  }
  for (const path of untracked) {
    const file = resolve(repo.root, path)
    const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!info?.isFile() || info.isSymbolicLink() || info.size > LIMIT) continue
    const data = await readFile(file)
    if (!data.includes(0) && data.length) {
      let lines = 1
      for (const byte of data) if (byte === 10) lines++
      additions += lines - (data.at(-1) === 10 ? 1 : 0)
    }
  }
  return { files: numbers.length + untracked.length, additions, deletions }
}

export async function inspect(cwd, scope = 'uncommitted', ref = '') {
  if (!['uncommitted', 'unstaged', 'staged', 'branch'].includes(scope)) throw new Error('未知的比较范围。')
  const repo = await catalog(cwd)
  const base = repo.head || EMPTY_TREE
  let args
  if (scope === 'branch') {
    if (!repo.head) throw new Error('当前仓库尚无提交，不能比较分支。')
    if (!repo.branches.includes(ref)) throw new Error('请选择列表中的分支。')
    const commit = (await git(repo.root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'])).trim()
    const ancestor = (await git(repo.root, ['merge-base', repo.head, commit])).trim()
    args = [ancestor, repo.head]
  } else if (scope === 'staged') args = ['--cached', base]
  else if (scope === 'uncommitted') args = [base]
  else args = []

  const flags = ['--no-ext-diff', '--no-textconv', '--no-renames']
  const tracked = splitPaths(await git(repo.root, ['diff', ...flags, '--name-only', '-z', ...args, '--']))
  const untracked = scope === 'uncommitted' ? splitPaths(await git(repo.root, ['ls-files', '--others', '--exclude-standard', '-z'])) : []
  const files = []
  let totalBytes = 0, additions = 0, deletions = 0
  for (const path of [...new Set([...tracked, ...untracked])]) {
    let item
    if (untracked.includes(path)) {
      const info = await lstat(resolve(repo.root, path)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (!info) continue
      if (!info.isFile() || info.isSymbolicLink()) item = { patch: '', skipped: '非普通文件' }
      else if (info.size > LIMIT) item = { patch: '', skipped: '文件超过 8 MiB' }
      else item = syntheticPatch(path, await readFile(resolve(repo.root, path)))
    } else item = { patch: await git(repo.root, ['diff', ...flags, '--unified=3', ...args, '--', path]) }
    totalBytes += Buffer.byteLength(item.patch) + Buffer.byteLength(path)
    if (totalBytes > LIMIT) throw new Error('差异超过 8 MiB，请缩小比较范围。')
    const count = counts(item.patch)
    additions += count.additions; deletions += count.deletions
    files.push({ path, ...item, ...count, untracked: untracked.includes(path) })
  }
  return { root: repo.root, branch: repo.branch, head: repo.head, scope, ref: scope === 'branch' ? ref : '', files, additions, deletions }
}
