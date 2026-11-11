# Codex 式代码审查

这是全新实现的 DSH 插件。输入 `/review` 后选择未提交改动、基准分支、某次提交或自定义要求；也可直接输入 `/review 你的要求`。命令会在当前对话排入一条普通用户消息作为审查请求；消息可由已安装的历史消息编辑插件再次编辑。DSH 仍会保留一条命令执行记录。插件随后启动独立的原生 spawn 子代理，不继承主对话历史。代理自行读取 Git、diff、相关代码，必要时在宿主权限范围内运行测试，不提前把整个仓库快照塞进提示词。

审查代理使用随包附带的 Codex rubric。报告包含 P0–P3 问题、文件行号、逐项置信度、整体正确性判断和整体置信度。输出不符合结构化格式时保留原文并明确标记，不能把解析失败冒充零问题。主对话会被要求完整呈现工具报告；由于 DSH 尚未提供 Codex 的原生 review turn / review item，最终表述仍经过主模型，不能保证与 Codex Desktop 的评论卡完全一样。

## 命令

- `/review`：先显示范围选项，完成选择后才发送审查请求；跳过或取消不会发送。分支和提交会在发送前解析为明确的审查要求，不再依赖模型弹出选项。`/review <要求>`：直接发送自定义审查请求。
- `/review-status`：查看当前对话最近一次报告；`/review-cancel`：取消正在选择范围或运行的审查。
- 模型也可直接调用 `codex_review` 工具。

可选配置：`reviewModel` 指定子代理模型；`language` 为 `zh`（默认）或 `en`；`reportDirectory` 为报告目录的绝对路径。默认报告目录是 `$DSH_HOME/codex-review`。旧版插件的 `$DSH_HOME/code-review` 数据不迁移，也不删除。

代理不应修改代码或生成修复，但工具层保留宿主授予的 Git、命令和测试能力，实际命令权限仍由 DSH 控制。网页搜索与递归召唤代理被阻止。当前实现没有原生 Codex 审查事件、桌面侧栏评论卡、自动应用修复，也不自动获取远程分支。

在本仓库开发：`dsh plugin --profile desktop add ./plugins/codex-review`。用 `node --test plugins/codex-review/test/*.test.mjs` 运行聚焦测试。安装与卸载只使用 DSH 插件命令；桌面版最终验收由用户完成。
