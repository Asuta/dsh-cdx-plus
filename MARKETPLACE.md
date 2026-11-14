# DSH CDX Plus — 插件市场介绍草稿

此文档供正式上架时使用，不代表已经被插件市场收录。当前发行状态见 [RELEASE_STATUS.md](RELEASE_STATUS.md)。

## 名称

DSH CDX Plus — Codex 风格体验增强

## 简介

为 DeepSeek Harness（DSH）补齐 Codex 风格交互与开发工作流。选中引用、侧边对话、Git 工作树环境、代码审查等 18 项功能，一个合集，按需启停。

Codex-inspired plugin suite for DeepSeek Harness (DSH): selection quotes, side chats, Git worktree environments and code review, with 18 independently switchable features.

## 详细介绍

习惯 Codex 的操作方式，希望在 DSH 中快速配置类似的开发工作流？DSH CDX Plus 提供：

- 选中文字引用和批注，将支线问题放进继承上下文的侧边对话。
- 为对话创建 Git 工作树，通过 .worktreeinclude 带入所需文件，保存多份环境及 setup 脚本。
- 从快捷菜单执行环境命令，在内置终端中查看输出；多行命令默认失败即停止。
- 使用 /review 选择范围，由独立子代理输出带优先级和文件位置的审查报告。
- 整理侧栏、移动和归档会话、查看 Git diff，以及 Mermaid、历史编辑、内置浏览器等增强。

组件可以分别关闭，部分组合能力需同时启用相关组件。当前适配 DSH 0.2.2-rc.3。内置浏览器控制需要桌面宿主；工作树要求可用 Git 仓库。

独立社区项目，部分交互设计受 Codex 启发，无 OpenAI 或 DeepSeek 官方隶属、背书关系。

## 上架素材

- 发行仓库：https://github.com/Asuta/dsh-cdx-plus
- 合集包名：dsh-asuta-cdx-plus
- 当前发布版本：0.1.4
- [中文介绍](README.md)、[English](README_EN.md)
- [选中引用](docs/images/selection-quotes.png)、[工作树环境](docs/images/worktree-environments.png)、[代码审查](docs/images/review-scope.png)
- 关键词：DSH、DeepSeek Harness、Codex、Codex-inspired、插件合集、Git worktree、代码审查、侧边对话

0.1.2 已完成全部依赖下载校验与隔离全新安装。合集收录申请已提交至 awesome-dsh-plugins：[PR #236](https://github.com/dshworks/awesome-dsh-plugins/pull/236)，等待审核；尚未确认被任何市场收录。
