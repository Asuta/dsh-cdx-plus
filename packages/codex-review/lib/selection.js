import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export async function git(cwd, args, signal) {
  const { stdout } = await exec('git', ['--no-optional-locks', ...args], {
    cwd, signal, encoding: 'utf8', windowsHide: true, timeout: 20000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  })
  return stdout.trim()
}

export async function selectTarget(ctx, agent, input, signal) {
  if (input.trim()) return { mode: 'custom', instructions: input.trim() }

  async function ask(id, question, options = []) {
    signal.throwIfAborted()
    const result = await ctx.userQuestions.ask({
      agent, signal,
      questions: [{ id, header: '代码审查', question, options: options.map(label => ({ label })) }],
    })
    signal.throwIfAborted()
    const answer = result.answers.find(item => item.id === id)
    if (!answer || answer.selected.length > 1) throw new Error('审查范围选择已取消。')
    const value = answer.custom?.trim() || answer.selected[0]
    if (!value) throw new Error('审查范围选择已取消。')
    return value
  }

  const choice = await ask('codex-review-scope', '选择审查范围', [
    '未提交改动（暂存、未暂存、未跟踪）', '对比基准分支', '指定提交', '自定义要求',
  ])
  if (choice === '未提交改动（暂存、未暂存、未跟踪）') return { mode: 'worktree' }
  if (choice === '自定义要求') {
    return { mode: 'custom', instructions: await ask('codex-review-custom', '输入本次审查要求') }
  }
  const cwd = ctx.workingDirectory.get(agent.session)
  if (!cwd) throw new Error('当前对话没有工作目录。')
  await git(cwd, ['rev-parse', '--show-toplevel'], signal)
  if (choice === '对比基准分支') {
    const branches = (await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], signal)).split(String.fromCharCode(10)).filter(Boolean)
    return { mode: 'base', ref: await ask('codex-review-base', '选择基准分支，也可输入其他 Git 引用', branches) }
  }
  if (choice === '指定提交') {
    const commits = (await git(cwd, ['log', '-n', '80', '--format=%H%x09%s'], signal)).split(String.fromCharCode(10)).filter(Boolean)
    const choices = commits.map(line => {
      const [sha, ...subject] = line.split(String.fromCharCode(9))
      return { label: sha.slice(0, 10) + ' ' + subject.join(' '), sha }
    })
    const selected = await ask('codex-review-commit', '选择提交，也可输入 SHA 或其他 Git 引用', choices.map(item => item.label))
    return { mode: 'commit', ref: choices.find(item => item.label === selected)?.sha || selected }
  }
  throw new Error('未知审查范围。')
}
