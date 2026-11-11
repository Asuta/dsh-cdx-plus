import { git } from './selection.js'

async function resolveCommit(cwd, ref, signal) {
  return git(cwd, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], signal)
}

export async function reviewPrompt(target, cwd, signal) {
  signal.throwIfAborted()
  if (target.mode === 'custom') {
    if (!target.instructions?.trim()) throw new Error('自定义审查要求不能为空。')
    return target.instructions.trim()
  }
  await git(cwd, ['rev-parse', '--show-toplevel'], signal)
  if (target.mode === 'worktree') {
    return 'Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings.'
  }
  if (target.mode === 'commit') {
    const sha = await resolveCommit(cwd, target.ref, signal)
    const title = await git(cwd, ['show', '-s', '--format=%s', sha], signal)
    return 'Review the code changes introduced by commit ' + sha + ' ("' + title + '"). Provide prioritized, actionable findings.'
  }
  if (target.mode === 'base') {
    const head = await resolveCommit(cwd, 'HEAD', signal)
    const baseRef = await resolveCommit(cwd, target.ref, signal)
    let compareRef = baseRef
    try {
      const upstream = await resolveCommit(cwd, target.ref + '@{upstream}', signal)
      const counts = (await git(cwd, ['rev-list', '--left-right', '--count', baseRef + '...' + upstream], signal)).match(/[0-9]+/g)
      if (Number(counts?.[1]) > 0) compareRef = upstream
    } catch { /* A local or remote ref need not have an upstream. */ }
    const mergeBase = await git(cwd, ['merge-base', head, compareRef], signal)
    return 'Review the code changes against the base branch ' + JSON.stringify(target.ref) + '. The merge base commit for this comparison is ' + mergeBase + '. Run git diff ' + mergeBase + ' to inspect the changes relative to ' + target.ref + '. Provide prioritized, actionable findings.'
  }
  throw new Error('未知审查范围。')
}
