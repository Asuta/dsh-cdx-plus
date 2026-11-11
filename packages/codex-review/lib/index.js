import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { ReviewJournal } from './journal.js'
import { selectTarget } from './selection.js'
import { reviewPrompt } from './request.js'
import { runReview } from './runtime.js'
import { renderReport } from './report.js'

export const name = 'local-codex-review'
export const inject = ['commands', 'tools', 'subagents', 'agents', 'systemPrompt', 'sessions', 'userQuestions', 'workingDirectory']

export function renderOutcome(result) {
  const header = '审查范围：' + (result.target?.mode === 'worktree' ? '未提交改动'
    : result.target?.mode === 'base' ? '对比 ' + result.target.ref
      : result.target?.mode === 'commit' ? '提交 ' + result.target.ref : '自定义要求')
  if (result.status !== 'completed') return '## 代码审查 · ' + (result.status === 'interrupted' ? '已中断' : '失败')
    + String.fromCharCode(10, 10) + header + String.fromCharCode(10, 10) + result.error
  return renderReport(result.report) + String.fromCharCode(10, 10) + header
}

export function apply(ctx, config = {}) {
  if (config.reportDirectory !== undefined && !isAbsolute(config.reportDirectory)) throw new Error('reportDirectory 必须是绝对路径。')
  if (config.reviewModel !== undefined && (typeof config.reviewModel !== 'string' || !config.reviewModel.trim())) throw new Error('reviewModel 必须是非空字符串。')
  if (config.language !== undefined && !['zh', 'en'].includes(config.language)) throw new Error('language 只能是 zh 或 en。')
  const directory = config.reportDirectory || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'codex-review')
  const journal = new ReviewJournal(directory)
  const active = new Map()
  const operations = new Set()
  const lifetime = new AbortController()
  ctx.effect(() => async () => {
    lifetime.abort()
    for (const controller of active.values()) controller.abort()
    await Promise.allSettled([...operations])
  }, 'codex-review: cleanup')

  ctx.commands.register({
    name: 'review', description: '用独立代理审查本次代码改动',
    input: { hint: '留空选择范围，或直接输入完整的自定义审查要求' },
    handler({ agent, rawInput, signal }) {
      return track(prepareRequest(agent, (rawInput || '').trim(), signal))
    },
  })

  function track(operation) {
    operations.add(operation)
    void operation.finally(() => operations.delete(operation)).catch(() => {})
    return operation
  }

  async function prepareRequest(agent, rawInput, signal) {
    if (active.has(agent.id)) return { kind: 'error', text: '当前对话已有代码审查或范围选择正在进行。' }
    const controller = new AbortController()
    active.set(agent.id, controller)
    const combined = AbortSignal.any([controller.signal, lifetime.signal, ...(signal ? [signal] : [])])
    try {
      combined.throwIfAborted()
      const target = await selectTarget(ctx, agent, rawInput, combined)
      const cwd = target.mode === 'custom' ? undefined : ctx.workingDirectory.get(agent.session)
      if (target.mode !== 'custom' && !cwd) throw new Error('当前对话没有工作目录。')
      const input = await reviewPrompt(target, cwd, combined)
      combined.throwIfAborted()
      const request = config.language === 'en'
        ? 'Please run a code review with these instructions:\n\n' + input
            + '\n\nCall codex_review once with input set to the instructions above verbatim. Present the complete tool report, including the verdict and confidence. If it fails, report the error without further investigation. Do not change files.'
        : '请按以下要求进行 Code Review：\n\n' + input
            + '\n\n请调用 codex_review 工具一次，input 参数使用上面的要求原文。完整呈现工具报告，包括整体判断和置信度；如果失败，请直接说明原因，不要继续调查。不要自行审查、修改结论或修改文件。'
      const id = randomUUID()
      agent.followup({
        id, role: 'user', source: { kind: 'user', rpcId: id },
        content: [{ type: 'text', text: request }],
      })
      return { kind: 'success', text: '已在当前对话启动代码审查请求。' }
    } catch (error) {
      return { kind: 'error', text: combined.aborted ? '审查范围选择已取消。'
        : (error instanceof Error ? error.message : String(error)) }
    } finally { active.delete(agent.id) }
  }
  ctx.commands.register({
    name: 'review-cancel', description: '取消当前代码审查',
    handler({ agent }) {
      const controller = active.get(agent.id)
      if (controller) controller.abort()
      return { kind: 'success', text: controller ? '已请求取消代码审查。' : '当前没有正在运行的审查。' }
    },
  })
  ctx.commands.register({
    name: 'review-status', description: '查看最近一次代码审查',
    async handler({ agent }) {
      try {
        if (active.has(agent.id)) return { kind: 'success', text: '代码审查或范围选择正在进行。' }
        const saved = await journal.read(agent.id)
        return { kind: 'success', text: !saved ? '当前对话没有已保存的审查报告。'
          : saved.state === 'running' ? '上次代码审查在完成前中断，请重新运行 /review。'
            : renderOutcome(saved.result) }
      } catch (error) { return { kind: 'error', text: '读取审查报告失败：' + String(error) } }
    },
  })

  async function review(agent, input, signal) {
    if (active.has(agent.id)) throw new Error('当前对话已有代码审查正在运行。')
    const controller = new AbortController()
    active.set(agent.id, controller)
    try {
      const combined = AbortSignal.any([signal, controller.signal, lifetime.signal])
      const target = await selectTarget(ctx, agent, input, combined)
      combined.throwIfAborted()
      await journal.write(agent.id, { state: 'running', startedAt: new Date().toISOString(), target })
      const result = await runReview(ctx, agent, target, combined, { model: config.reviewModel, language: config.language || 'zh' })
      let warning = ''
      try { await journal.write(agent.id, { state: 'finished', result }) }
      catch (error) { warning = '报告保存失败，重启后可能无法用 /review-status 恢复：' + String(error) }
      try { await ctx.sessions.flush(agent.session) }
      catch (error) { warning += (warning ? String.fromCharCode(10) : '') + '会话持久化失败：' + String(error) }
      const output = renderOutcome(result) + (warning ? String.fromCharCode(10, 10) + warning : '')
      if (result.status !== 'completed') throw new Error(output)
      return output
    } finally { active.delete(agent.id) }
  }

  ctx.tools.register({
    name: 'codex_review',
    description: '在当前对话启动独立的 Codex 式代码审查代理。input 为空时选择范围；非空时作为完整自定义审查要求。代理自行检查 Git、代码和必要测试，权限由宿主控制。',
    parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute(args, execution) {
      if (!execution.agent) throw new Error('代码审查必须在当前对话中执行。')
      if (typeof args.input !== 'string') throw new Error('input 必须是字符串。')
      return track(review(execution.agent, args.input, execution.signal || new AbortController().signal))
    },
  })
}
