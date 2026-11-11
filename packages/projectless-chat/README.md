# 独立对话

在“最近”标题栏悬停或键盘聚焦时显示“新建独立对话”。每次创建全新的原生主会话，不继承历史，也不加入已有工作区。没有最近列表时，在侧栏底部提供备用入口。

点击新建后，独立对话的输入框上方显示原生模式选择。可在发送首条消息前切换模式，不影响现有会话。

- 默认工作目录：用户主目录下的 Documents/DSH/<日期>/new-chat-<唯一后缀>。
- 设置 → 通用 → 独立对话默认目录：输入绝对路径或浏览主机文件夹，保存或恢复默认。仅影响以后创建的对话，不迁移既有文件。
- 聊天记录仍由 DSH 原生会话存储管理；归档不会删除工作文件。
- 插件设置保存到 DSH_HOME/plugin-data/projectless-chat/settings.json；不修改 profile 文件。
- 使用 sessions.create({ cwd }) 和 uiWorkspace.openSession，完整复用原生聊天视图和模式选择。
- 未绑定工作区的空白 hero 原本会禁用输入框；插件仅在独立对话的渲染范围内提供“未分组”显示标签，使原生 hero 输入框和模式选择可用，不修改真实工作区数据。
- 文件夹选择器通过本地受 DSH 身份验证的接口逐级读取目录，不依赖桌面原生 picker，因此网页版也可用。
- 最近标题栏挂载使用现有侧栏增强插件的 data-slot=sidebar.recent.section 标记，不依赖构建哈希类名。

本地开发安装：在仓库根目录执行 dsh plugin --profile desktop add ./plugins/projectless-chat。运行 node --test test/*.test.mjs 验证目录与配置逻辑。
