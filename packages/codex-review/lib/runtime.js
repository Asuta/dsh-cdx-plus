import { randomUUID } from 'node:crypto'
import { reviewPrompt } from './request.js'
import { parseReport } from './report.js'
import { reviewerPersona } from './prompt.js'

const EXCLUDED_TOOLS = [
  'codex_review', 'dsh_code_review', 'summon_expert', 'summon_experts',
  'list_experts', 'list_expert_teams', 'get_expert_team', 'summon_expert_team',
  'web_search', 'search_web', 'browser_search',
]

function isExcluded(name) {
  const lower = name.toLowerCase()
  return EXCLUDED_TOOLS.includes(name) || lower === 'web' || lower.startsWith('web_')
    || lower.startsWith('mcp__web') || lower.includes('web_search')
    || lower.includes('browser') || lower.startsWith('summon_') || lower.startsWith('spawn_agent')
}

async function awaitResult(activation, signal) {
  if (signal.aborted) {
    void activation.dispose().catch(() => {})
    signal.throwIfAborted()
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      void activation.dispose().catch(() => {})
      reject(signal.reason instanceof Error ? signal.reason : new Error('审查已取消。'))
    }
    signal.addEventListener('abort', abort, { once: true })
    activation.result.then(
      value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) },
    )
  })
}

export async function runReview(ctx, parent, target, signal, options = {}) {
  const id = randomUUID()
  let activation
  let aborted = false
  try {
    const cwd = ctx.workingDirectory.get(parent.session)
    if (!cwd) throw new Error('当前对话没有工作目录。')
    const provider = ctx.subagents.getProvider('spawn')
    if (!provider || provider.inheritsParentContext !== false) throw new Error('独立上下文的原生 spawn 子代理不可用。')
    const prompt = await reviewPrompt(target, cwd, signal)
    const childId = randomUUID()
    const deny = EXCLUDED_TOOLS.filter(name => ctx.tools.get(name, parent) !== undefined)
    const stop = ctx.on('agent/created', ({ agent }) => {
      if (agent.id !== childId) return
      agent.ctx.systemPrompt.section({
        name: 'LOCAL_CODEX_REVIEW_RUBRIC',
        order: agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
        text: reviewerPersona(options.language),
      })
      if (deny.length) agent.ctx.tools.restrict({ deny })
      agent.ctx.tools.guard(execution => isExcluded(execution.name) ? '审查代理不能使用联网搜索或创建其他审查代理。' : undefined)
    })
    try {
      activation = await ctx.subagents.startActivation({
        provider: 'spawn', childId, label: '代码审查', delivery: 'caller', signal,
        parent, cwd,
        prompt: [{ type: 'text', text: prompt }],
        ...(options.model ? { agentOptions: { model: options.model } } : {}),
      })
    } finally { stop() }
    const result = await awaitResult(activation, signal)
    signal.throwIfAborted()
    if (result.stopReason !== 'completed') throw new Error('审查代理未完成：' + result.stopReason + (result.diagnostic ? ' ' + result.diagnostic : ''))
    const raw = result.output.filter(block => block.type === 'text').map(block => block.text).join('')
    if (!raw.trim()) throw new Error('审查代理没有返回报告。')
    return { id, status: 'completed', target, report: parseReport(raw), createdAt: new Date().toISOString() }
  } catch (error) {
    aborted = signal.aborted
    return { id, status: aborted ? 'interrupted' : 'failed', target,
      error: error instanceof Error ? error.message : String(error), createdAt: new Date().toISOString() }
  } finally {
    if (activation) {
      try {
        if (aborted) await Promise.race([
          activation.dispose(), new Promise(resolve => setTimeout(resolve, 2000)),
        ])
        else await activation.dispose()
      } catch (error) { ctx.logger.warn('codex-review: child cleanup failed: ' + String(error)) }
    }
  }
}
