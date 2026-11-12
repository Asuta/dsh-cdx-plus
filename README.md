# DSH CDX Plus

**DSH 体验增强套件**

熟悉的交互，更顺手的 DSH。一次安装，18 项功能独立启停。

本仓库包含发行插件、构建源码、运行时资源与发布验证脚本。开发技能、现场笔记、临时文件和本机配置不进入此仓库。

## 安装

**当前发行候选 0.1.2 尚未发布到 npm。旧版 0.1.0 曾发布 10 个子插件，其余受 registry 限流影响；合集尚未发布。以下命令暂不可用于完整安装，进度见 RELEASE_STATUS.md。**

    dsh plugin --profile desktop add dsh-asuta-cdx-plus

在「插件 → DSH CDX Plus」里分别开启或关闭各个组件。也可以单独安装下列任意插件。开关作用于当前 profile；是否需要重启以 DSH 提示为准。

| 功能 | 独立包名 |
| --- | --- |
| 归档会话管理 | dsh-asuta-archived-sessions |
| 代码审查 | dsh-asuta-codex-review |
| 对话管理工具 | dsh-asuta-conversation-workbench |
| 桌面导航 | dsh-asuta-desktop-navigation |
| Mermaid 图表 | dsh-asuta-mermaid-renderer |
| 内置浏览器 | dsh-asuta-sidebrowser |
| Git 变更 | dsh-asuta-git-diff |
| 隐藏新会话按钮 | dsh-asuta-hide-new-session |
| 历史消息编辑 | dsh-asuta-history-edit |
| 项目活动状态 | dsh-asuta-project-activity |
| 无工作区对话 | dsh-asuta-projectless-chat |
| 记忆思考强度 | dsh-asuta-reasoning-effort-memory |
| 选中引用 | dsh-asuta-selection-quote |
| 移动对话 | dsh-asuta-session-mover |
| 侧边对话 | dsh-asuta-sidebar-chat |
| 侧栏整理 | dsh-asuta-sidebar-more |
| Agent 设置 | dsh-asuta-user-agent-settings |
| 工作树控制 | dsh-asuta-worktree-control |

## 维护与验证

    node scripts/verify.mjs
    node scripts/pack.mjs
    node scripts/pack.mjs --local-preview

最后一条会额外生成仅供本机验收的合集：子包改用本地 tarball，并放在新的目录避免旧包缓存。试装前显式设置独立的 DSH_HOME；不要装进正在使用的 desktop profile。临时合集标为 private，不可发布；正式产物仍使用 npm 精确版本依赖。

包内已有构建产物；各子包保留可重建的源码。npm 安装包通过各自的 files 白名单控制内容。此仓库由开发仓库自动导出，功能改动应先进入开发源再同步。同步器拒绝覆盖此仓库中手工修改的文件。

本次兼容基线：DSH 0.2.2-rc.2。当前限制和发布步骤见 [RELEASE_STATUS.md](RELEASE_STATUS.md)。

此前未声明许可的自有代码及合集采用 MIT；各子包既有的 MIT、Apache-2.0 和第三方声明保持原样。[English documentation](README_EN.md)。
