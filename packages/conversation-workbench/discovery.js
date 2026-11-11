// Search metadata stays in the host process; only matched tool definitions are
// registered in the calling agent's scope and reach its next model request.
export const discoveryDescription = 'Discover conversation, native workspace/project, artifact and PR-check tools. Use search_threads for message history and list_threads for titles. Search by task or tool name to load only matching definitions into this conversation.'
const priorDiscoveryDescriptions = new Set([
  'Discover conversation, project, artifact and PR-check tools. Use search_threads for conversation message history and list_threads for titles. Search by task or tool name to load only the matching definitions into this conversation.',
  'Discover conversation, project, sidebar section, artifact and PR-check tools. Use search_threads for conversation message history and list_threads for titles. Search by task or tool name to load only the matching definitions into this conversation.',
  'Discover conversation, project, sidebar section, artifact and PR-check tools. Search by task or tool name to load only the matching definitions into this conversation.',
])
const legacyImmediateTools = new Set(['list_threads', 'read_thread', 'create_thread', 'list_projects'])

const keywords = {
  list_threads: 'list find conversation thread metadata title directory id 对话 列表 标题 目录 编号 查找',
  list_archived_threads: 'list find archive archived conversation title 归档 已归档 对话 列表 标题',
  search_threads: 'search find full text message content conversation history archived 搜索 检索 历史 全文 正文 内容 消息 对话 归档',
  read_thread: 'read conversation history messages pages 读取 查看 对话 历史 分页',
  list_projects: 'list projects workspaces 项目 工作区 列表',
  create_project: 'create register workspace project existing directory new empty folder 新建 创建 注册 工作区 项目 目录',
  rename_project: 'rename workspace project display title 重命名 改名 工作区 项目',
  remove_project: 'remove workspace registration keep directory conversations 移除 删除 工作区 项目 保留目录对话',
  reorder_project: 'reorder sort move workspace project 顺序 排序 移动 工作区 项目',
  reorder_project_thread: 'reorder sort conversation within workspace project 对话 工作区 内 排序 顺序',
  set_thread_pinned: 'pin unpin conversation sidebar 置顶 取消置顶 对话',
  archive_project_threads: 'archive all idle conversations in workspace project 批量 归档 工作区 对话',
  create_thread: 'create new conversation with initial prompt 新建 创建 对话 首条任务',
  fork_thread: 'fork branch conversation 分支 复制 对话',
  navigate_to_codex_page: 'open navigate switch conversation page 打开 跳转 切换 对话',
  set_thread_title: 'rename change conversation title 重命名 改名 标题 对话',
  set_thread_archived: 'archive restore unarchive conversation 归档 恢复 取消归档 对话',
  send_message_to_thread: 'send prompt message to another conversation 发送 消息 任务 其他对话',
  wait_threads: 'wait follow progress completion conversations 等待 跟踪 完成 进度 对话',
  move_thread_to_project: 'move conversation to project workspace 移动 搬移 对话 项目 工作区',
  list_artifacts: 'list associated pull requests worktrees artifacts 查看 列出 产物 关联 PR 工作树',
  attach_artifact: 'attach link pull request worktree artifact 关联 添加 产物 PR 工作树',
  remove_artifact: 'remove unlink pull request worktree artifact 解除 移除 关联 产物 PR 工作树',
  read_pull_request_check_diagnostics: 'github pull request checks CI failure logs diagnostics 检查 诊断 失败 日志 PR',
}

export function createDiscovery(catalog) {
  const active = new Map()

  function activate(agent, definition) {
    if (!agent?.ctx?.tools) throw new Error('Tool discovery requires an agent-bound conversation')
    let entries = active.get(agent)
    if (!entries) { entries = new Map(); active.set(agent, entries) }
    if (entries.has(definition.name)) return false
    entries.set(definition.name, agent.ctx.tools.register(definition))
    return true
  }

  function restore(agent) {
    const tools = agent.session.requestHeader()?.tools ?? []
    // Older sessions had the entire catalog in their request header. Shrink
    // those on their first step under this version instead of restoring all 23.
    const searchTool = tools.find(tool => tool.name === 'search_conversation_tools')
    if (!searchTool) return
    // The four formerly global tools appear in every old session header, even
    // when they were never discovered. Only a header bearing the new search
    // description can prove that they were selected in this version.
    const legacyHeader = searchTool.description !== discoveryDescription && !priorDiscoveryDescriptions.has(searchTool.description)
    for (const { name } of tools) {
      const definition = catalog.get(name)
      if (definition && !(legacyHeader && legacyImmediateTools.has(name))) activate(agent, definition)
    }
  }

  function search({ query, limit = 5 }, exec) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('query must be 1 to 200 characters')
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('limit must be between 1 and 8')
    const needle = query.trim().toLocaleLowerCase()
    const terms = needle.split(/[\s,，。/]+/).filter(term => term.length > 1)
    const matches = [...catalog.values()].map(definition => {
      const name = definition.name.toLocaleLowerCase()
      const haystack = [name, definition.description, keywords[definition.name] ?? ''].join(' ').toLocaleLowerCase()
      const direct = name === needle ? 100 : name.includes(needle) ? 40 : haystack.includes(needle) ? 20 : 0
      const strong = terms.some(term => !['conversation', 'conversations', 'thread', 'threads', 'tool', 'tools'].includes(term) && haystack.includes(term))
      const score = (!direct && terms.length > 1 && !strong) ? 0 : direct
        + terms.reduce((sum, term) => sum + (name.includes(term) ? 5 : haystack.includes(term) ? 2 : 0), 0)
        + (keywords[definition.name] ?? '').split(/\s+/).reduce((sum, term) => sum + (/[^\x00-\x7f]/.test(term) && needle.includes(term) ? 3 : 0), 0)
      return { definition, score }
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.definition.name.localeCompare(b.definition.name)).slice(0, limit)
    const tools = matches.map(({ definition }) => {
      const newlyEnabled = activate(exec?.agent, definition)
      return { name: definition.name, description: definition.description, available: true, newlyEnabled }
    })
    return { tools, ...(tools.length ? {} : { hint: 'Try a tool name or a narrower task, such as archive, artifact, or PR checks.' }) }
  }

  function forget(agent) { active.delete(agent) }
  function dispose() {
    for (const entries of active.values()) for (const unregister of entries.values()) unregister()
    active.clear()
  }
  return { search, restore, forget, dispose }
}
