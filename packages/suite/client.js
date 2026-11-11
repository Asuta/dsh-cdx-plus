window.__ModuleLoader__.load({
  id: "dsh-asuta-cdx-plus",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const features = [
  {
    "directory": "archived-sessions",
    "name": "dsh-asuta-archived-sessions",
    "version": "0.1.0",
    "title": "归档会话管理",
    "rowId": "archived-sessions",
    "bundleConfig": false
  },
  {
    "directory": "codex-review",
    "name": "dsh-asuta-codex-review",
    "version": "0.1.0",
    "title": "代码审查",
    "rowId": "local-codex-review",
    "bundleConfig": false
  },
  {
    "directory": "conversation-workbench",
    "name": "dsh-asuta-conversation-workbench",
    "version": "0.1.0",
    "title": "对话管理工具",
    "rowId": "conversation-workbench",
    "bundleConfig": false
  },
  {
    "directory": "desktop-navigation",
    "name": "dsh-asuta-desktop-navigation",
    "version": "0.1.0",
    "title": "桌面导航",
    "rowId": "desktop-enhancements",
    "bundleConfig": false
  },
  {
    "directory": "dsh-mermaid-renderer",
    "name": "dsh-asuta-mermaid-renderer",
    "version": "0.1.0",
    "title": "Mermaid 图表",
    "rowId": "dsh-asuta-mermaid-renderer",
    "bundleConfig": false
  },
  {
    "directory": "dsh-sidebrowser",
    "name": "dsh-asuta-sidebrowser",
    "version": "0.1.0",
    "title": "内置浏览器",
    "rowId": "dsh-asuta-sidebrowser",
    "bundleConfig": true
  },
  {
    "directory": "git-diff",
    "name": "dsh-asuta-git-diff",
    "version": "0.1.0",
    "title": "Git 变更",
    "rowId": "local-git-diff",
    "bundleConfig": false
  },
  {
    "directory": "hide-new-session",
    "name": "dsh-asuta-hide-new-session",
    "version": "0.1.0",
    "title": "隐藏新会话按钮",
    "rowId": "hide-new-session",
    "bundleConfig": false
  },
  {
    "directory": "history-edit",
    "name": "dsh-asuta-history-edit",
    "version": "0.1.0",
    "title": "历史消息编辑",
    "rowId": "local-history-edit",
    "bundleConfig": false
  },
  {
    "directory": "project-activity",
    "name": "dsh-asuta-project-activity",
    "version": "0.1.0",
    "title": "项目活动状态",
    "rowId": "project-activity",
    "bundleConfig": false
  },
  {
    "directory": "projectless-chat",
    "name": "dsh-asuta-projectless-chat",
    "version": "0.1.0",
    "title": "无工作区对话",
    "rowId": "projectless-chat",
    "bundleConfig": false
  },
  {
    "directory": "reasoning-effort-memory",
    "name": "dsh-asuta-reasoning-effort-memory",
    "version": "0.1.0",
    "title": "记忆思考强度",
    "rowId": "reasoning-effort-memory",
    "bundleConfig": false
  },
  {
    "directory": "selection-quote",
    "name": "dsh-asuta-selection-quote",
    "version": "0.1.0",
    "title": "选中引用",
    "rowId": "selection-quote",
    "bundleConfig": false
  },
  {
    "directory": "session-mover",
    "name": "dsh-asuta-session-mover",
    "version": "0.1.0",
    "title": "移动对话",
    "rowId": "session-mover",
    "bundleConfig": false
  },
  {
    "directory": "sidebar-chat",
    "name": "dsh-asuta-sidebar-chat",
    "version": "0.1.0",
    "title": "侧边对话",
    "rowId": "sidebar-chat",
    "bundleConfig": false
  },
  {
    "directory": "sidebar-more",
    "name": "dsh-asuta-sidebar-more",
    "version": "0.1.0",
    "title": "侧栏整理",
    "rowId": "sidebar-more",
    "bundleConfig": false
  },
  {
    "directory": "user-agent-settings",
    "name": "dsh-asuta-user-agent-settings",
    "version": "0.1.0",
    "title": "Agent 设置",
    "rowId": "user-agent-settings",
    "bundleConfig": false
  },
  {
    "directory": "worktree-control",
    "name": "dsh-asuta-worktree-control",
    "version": "0.1.0",
    "title": "工作树控制",
    "rowId": "worktree-control",
    "bundleConfig": false
  }
];
    const suiteName = "dsh-asuta-cdx-plus";

    function Overview({ subject }) {
      if (subject.kind !== "bundle" || subject.pkg.name !== suiteName) return null;
      const zh = (document.documentElement.lang || navigator.language || "en").startsWith("zh");
      const rows = new Map(subject.pkg.rows.map(row => [row.moduleName, row]));
      const enabled = features.filter(feature => rows.get(feature.name)?.enabled).length;
      const missing = features.filter(feature => !rows.has(feature.name));
      const quote = features.find(feature => feature.directory === "selection-quote");
      const side = features.find(feature => feature.directory === "sidebar-chat");
      const sideHint = rows.get(quote.name)?.enabled && !rows.get(side.name)?.enabled;
      return h("section", { "data-dsh-cdx-plus": "overview", style: { font: "inherit", lineHeight: 1.6 } },
        h("strong", null, "DSH CDX Plus"),
        h("p", { role: "status" }, zh
          ? `${enabled} / ${features.length} 项功能已启用。下方组件开关分别控制每个功能。`
          : `${enabled} / ${features.length} features enabled. Use the component switches below to control each feature.`),
        missing.length ? h("p", { role: "alert" }, (zh ? "未找到组件：" : "Missing components: ") + missing.map(item => item.title).join(", ")) : null,
        sideHint ? h("p", null, zh
          ? "侧边对话已关闭：引用和批注仍可使用，从引用打开侧边对话需要开启该组件。"
          : "Side chat is disabled. Quotes and annotations still work; opening a side chat from a quote requires that component.") : null,
        h("p", null, zh
          ? "功能参数保留在各自的设置入口。开关作用于当前 profile；是否需要重启以 DSH 的提示为准。"
          : "Feature options remain in their own settings. Switches affect this profile; follow DSH if a restart is required.")
      );
    }

    function apply(ctx) {
      ctx.slots.inject("plugins.detail.section", () => ctx.slots.register({
        name: "plugins.detail.section", id: `${suiteName}:overview`, order: 10,
      }, Overview));
    }
    return { inject: ["slots"], apply };
  },
});
