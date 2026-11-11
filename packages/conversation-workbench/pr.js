import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const gh = async (args, cwd) => {
  const { stdout } = await run('gh', args, { cwd, timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
  return stdout
}
const json = async (args, cwd) => JSON.parse(await gh(args, cwd))
const tailGh = (args, cwd, maxChars = 12000) => new Promise((resolve, reject) => {
  const child = spawn('gh', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let text = '', originalChars = 0, stderr = ''
  const timer = setTimeout(() => child.kill(), 20000)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { originalChars += chunk.length; text = (text + chunk).slice(-maxChars) })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000) })
  child.on('error', error => { clearTimeout(timer); reject(error) })
  child.on('close', code => {
    clearTimeout(timer)
    if (code !== 0) reject(new Error(stderr || 'gh exited with code ' + code))
    else resolve({ text, originalChars, truncated: originalChars > maxChars })
  })
})
const safeError = error => String(error.stderr || error.message || error).slice(0, 1000)
const positiveId = (value, name) => {
  if (!/^[1-9][0-9]*$/.test(String(value ?? ''))) throw new Error(name + ' must be a positive ID')
  return String(value)
}
const pageNumber = cursor => {
  if (cursor === undefined) return 1
  const value = Number(cursor)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid PR diagnostics cursor')
  return value
}
const pageResult = (items, page, limit) => ({ items: items.slice(0, limit), nextCursor: items.length > limit ? String(page + 1) : null })
const remotePage = (items, page, limit) => ({ items, nextCursor: items.length === limit ? String(page + 1) : null })

export async function diagnosePr({ pr, cwd, stage = 'checks', headRevision, checkRunId, runId, jobId, cursor, limit = 20 }, transport = { json, gh }) {
  if (typeof pr !== 'string' || !/^(?:\d+|https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/?$)/.test(pr)) throw new Error('Provide a PR number or GitHub pull-request URL')
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim())) throw new Error('Invalid cwd')
  if (!['checks', 'check_runs', 'annotations', 'jobs', 'logs', 'comments'].includes(stage)) throw new Error('Unknown PR diagnostics stage')
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be between 1 and 50')
  const page = pageNumber(cursor)
  if (cursor !== undefined && headRevision === undefined) throw new Error('Pass headRevision on every next page')
  if (stage !== 'checks' && headRevision === undefined) throw new Error('Stage "' + stage + '" requires headRevision. First call stage "checks", then pass its headRevision on every detail call.')
  if (stage === 'annotations') {
    if (checkRunId === undefined) throw new Error('Stage "annotations" requires checkRunId from checkRuns[].id returned by stage "check_runs".')
    checkRunId = positiveId(checkRunId, 'checkRunId')
  }
  if (stage === 'jobs') {
    if (runId === undefined) throw new Error('Stage "jobs" requires runId, the workflow run ID in the Actions detailsUrl (/actions/runs/<runId>). To read logs with a known jobId, use stage "logs" instead.')
    runId = positiveId(runId, 'runId')
  }
  if (stage === 'logs') {
    if (jobId === undefined) throw new Error('Stage "logs" requires jobId from jobs[].id returned by stage "jobs". runId is optional and will be resolved from the job.')
    jobId = positiveId(jobId, 'jobId')
    if (runId !== undefined) runId = positiveId(runId, 'runId')
  }
  try {
    const view = await transport.json(['pr', 'view', pr, '--json', 'number,url,headRefOid,statusCheckRollup'], cwd)
    if (headRevision !== undefined && headRevision !== view.headRefOid) throw new Error('PR head changed; restart diagnostics from checks')
    const match = new URL(view.url).pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!match) throw new Error('Invalid PR URL returned by gh')
    const [, owner, repo, number] = match
    const base = 'repos/' + owner + '/' + repo + '/'
    const context = { pr: view.url, number: view.number, headRevision: view.headRefOid, stage }
    if (stage === 'checks') {
      const checks = (view.statusCheckRollup ?? []).map(check => ({ name: check.name ?? check.context ?? '', status: check.status ?? null, conclusion: check.conclusion ?? check.state ?? null, detailsUrl: check.detailsUrl ?? check.targetUrl ?? null }))
      const start = (page - 1) * limit
      const result = pageResult(checks.slice(start, start + limit + 1), page, limit)
      return { ...context, checks: result.items, failedCount: checks.filter(item => ['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'CANCELLED'].includes(item.conclusion)).length, totalChecks: checks.length, nextCursor: result.nextCursor }
    }
    if (stage === 'check_runs') {
      const data = await transport.json(['api', base + 'commits/' + view.headRefOid + '/check-runs?per_page=' + limit + '&page=' + page], cwd)
      const result = remotePage(data.check_runs ?? [], page, limit)
      if (Number.isInteger(data.total_count) && page * limit >= data.total_count) result.nextCursor = null
      return { ...context, checkRuns: result.items.map(item => ({ id: item.id, name: item.name, status: item.status, conclusion: item.conclusion, detailsUrl: item.details_url })), nextCursor: result.nextCursor }
    }
    if (stage === 'annotations') {
      const id = positiveId(checkRunId, 'checkRunId')
      const check = await transport.json(['api', base + 'check-runs/' + id], cwd)
      if (check.head_sha !== view.headRefOid) throw new Error('Check run does not belong to this PR head')
      const items = await transport.json(['api', base + 'check-runs/' + id + '/annotations?per_page=' + limit + '&page=' + page], cwd)
      const result = remotePage(items, page, limit)
      return { ...context, checkRunId: id, annotations: result.items.map(item => ({ path: item.path, startLine: item.start_line, endLine: item.end_line, message: String(item.message ?? '').slice(0, 1500) })), nextCursor: result.nextCursor }
    }
    if (stage === 'jobs' || stage === 'logs') {
      let id = runId
      if (stage === 'logs') {
        const job = await transport.json(['api', base + 'actions/jobs/' + jobId], cwd)
        id = positiveId(job.run_id, 'GitHub job.run_id')
        if (runId !== undefined && runId !== id) throw new Error('Job does not belong to this Actions run')
      }
      const action = await transport.json(['api', base + 'actions/runs/' + id], cwd)
      if (action.head_sha !== view.headRefOid) throw new Error('Actions run does not belong to this PR head')
      if (stage === 'jobs') {
        const data = await transport.json(['api', base + 'actions/runs/' + id + '/jobs?per_page=' + limit + '&page=' + page], cwd)
        const result = remotePage(data.jobs ?? [], page, limit)
        if (Number.isInteger(data.total_count) && page * limit >= data.total_count) result.nextCursor = null
        return { ...context, runId: id, jobs: result.items.map(item => ({ id: item.id, name: item.name, status: item.status, conclusion: item.conclusion })), nextCursor: result.nextCursor }
      }
      const log = await (transport.tailGh ?? tailGh)(['api', base + 'actions/jobs/' + jobId + '/logs'], cwd)
      return { ...context, runId: id, jobId, log: log.text, logTruncated: log.truncated, originalChars: log.originalChars }
    }
    const items = await transport.json(['api', base + 'pulls/' + number + '/comments?per_page=' + limit + '&page=' + page], cwd)
    const result = remotePage(items, page, limit)
    return { ...context, comments: result.items.map(item => ({ path: item.path, line: item.line, body: String(item.body ?? '').slice(0, 1500), url: item.html_url })), nextCursor: result.nextCursor }
  } catch (error) { throw new Error('GitHub PR diagnostics failed: ' + safeError(error)) }
}
