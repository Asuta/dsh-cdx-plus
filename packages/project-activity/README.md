# 项目运行状态

项目折叠时，只要里面还有对话运行，标题右侧就显示 DSH 原生转圈。展开项目后隐藏这个圈，保留具体对话自己的状态。

- 多个对话仍只显示一个圈，悬停提示运行中的对话数量。
- 读取宿主状态订阅，不依赖展开的子列表，不使用轮询。
- 支持未分组、置顶会话和仍有后台子代理运行的会话；归档会话不计入。
- 全部结束、停止或失败后自动消失，卸载时清理订阅和界面标记。
- 不改变展开、菜单、新建和拖动操作，不修改会话数据。

## 安装与验证

在本仓库开发时：

```powershell
dsh plugin --profile desktop add ./plugins/project-activity
node --test plugins/project-activity/test/*.test.mjs
```

桌面实例未加载新增插件时，完全退出后重新打开。

针对 DSH 0.2.1-rc.3，使用 `workspaces.list`、`sessions.list`、`uiSession.sessionStatus` 与原生 `StateDot`。当前版本没有项目标题专用插槽，通过 `data-row-key=workspace:<id>` 和 `aria-expanded` 添加装饰；DSH 升级后需复核这些契约。

## English

Show one native spinner on collapsed project headers while conversations are running. Expanding a project removes its aggregate indicator. Hover for the count. Uses host subscriptions, not polling or rendered child rows. Targets DSH 0.2.1-rc.3; workspace row attributes are a version-dependent DOM seam.
