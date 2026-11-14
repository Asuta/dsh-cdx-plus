# DSH CDX Plus — Codex-inspired plugins for DeepSeek Harness

为 DeepSeek Harness（DSH）补齐 Codex 风格交互与开发工作流：选中引用、侧边对话、Git 工作树环境、代码审查等 18 项功能，独立开启或关闭。

Bring familiar Codex-style interactions to DSH with selection quotes, side chats, Git worktree environments and code review. Each of the 18 features has its own switch.

部分功能的逻辑参考了对 Codex 桌面版反编译代码的分析，并针对 DSH 插件机制做适配。开发结合聚焦测试与真实界面验收，关注操作细节、流畅性和稳定性；验证范围以发布状态为准，不承诺与 Codex 等同的性能。

Some feature logic draws on analysis of decompiled Codex desktop code and is adapted to DSH's plugin mechanisms. Development combines focused tests and real UI checks, with attention to interaction details, responsiveness and stability. See release status for verification coverage; performance parity with Codex is not claimed.

[功能展示 / Screenshots](https://github.com/Asuta/dsh-cdx-plus#readme) · [English guide](https://github.com/Asuta/dsh-cdx-plus/blob/main/README_EN.md) · [发布状态 / Release status](https://github.com/Asuta/dsh-cdx-plus/blob/main/RELEASE_STATUS.md) · [反馈 / Issues](https://github.com/Asuta/dsh-cdx-plus/issues)

## 安装 / Installation

版本 0.1.4，适配 DSH 0.2.2-rc.3。以下命令安装 npm 最新正式版；各版本进度见发行仓库的 RELEASE_STATUS.md。

Version 0.1.4 targets DSH 0.2.2-rc.3. Install the latest published npm version with the command below. See RELEASE_STATUS.md in the release repository for version-specific status.

0.1.4 合集及全部 18 个子插件已发布到 npm，同时支持 rc.2 和 rc.3。旧版 0.1.3 仅支持 rc.2，rc.3 用户请更新到 0.1.4。

The 0.1.4 suite and all 18 plugins are published on npm and support both rc.2 and rc.3. Version 0.1.3 supports rc.2 only; rc.3 users should update to 0.1.4.

    dsh plugin --profile desktop add dsh-asuta-cdx-plus

安装后打开「插件 → DSH CDX Plus」，按需控制 18 项功能。合集提供状态概览、引用与侧边对话的联动提示，以及内置浏览器配置入口；其他参数仍在各功能原有的设置页。

Open Plugins → DSH CDX Plus to toggle components. The suite provides status, integration hints and an embedded-browser settings entry; other settings stay in each feature's own UI.

## 主要功能 / Highlights

- **引用与侧边对话 / Quotes and side chats**：选中文字批注，继承上下文讨论支线；隐藏历史仅影响显示。
- **工作树与环境 / Worktrees and environments**：Git 工作树、.worktreeinclude、多份环境、setup 脚本与可见终端命令。
- **代码审查 / Code review**：/review 范围选择、独立子代理、带优先级和文件位置的报告。
- **对话与界面 / Conversations and UI**：Git diff、历史编辑、会话移动、归档管理、侧栏整理、Mermaid 与内置浏览器等。

开关作用于当前 profile；部分组合功能需要相关组件同时启用。避免重复启用开发版和发行版的同一功能；DSH 提示需要重启时按提示操作。

Switches apply to the current profile. Some integrations require both components enabled. Avoid duplicate development and release copies of the same feature, and follow any restart prompt from DSH.

本合集本身不要求 Codex 账号；模型使用 DSH 的配置，服务凭据和费用由相应提供商决定。

The suite itself does not require a Codex account. Models use your DSH configuration and the relevant provider's credentials and billing.

独立社区项目，部分交互设计受 Codex 启发，与 OpenAI、DeepSeek 无官方隶属或背书关系。各子包保留自身许可证和第三方声明。

Independent community project, inspired in part by Codex interactions; not affiliated with or endorsed by OpenAI or DeepSeek. Each feature retains its own license and third-party notices.
