		// Keep the same status precedence as WorkspaceBrowser's sessionStatuses.
		function recentCardStatuses(row, t) {
			const subagents = row.runningSubagentCount > 0 ? {
				state: "ongoing",
				label: t(row.runningSubagentCount === 1 ? "status.subagentsRunning.one" : "status.subagentsRunning.other", { n: row.runningSubagentCount })
			} : void 0;
			if (row.pending !== void 0) {
				const pending = { state: "warning", label: t(PENDING[row.pending].label) };
				return subagents === void 0 ? [pending] : [pending, subagents];
			}
			if (row.running) {
				const running = { state: "ongoing", label: t("status.running") };
				return subagents === void 0 ? [running] : [running, subagents];
			}
			if (subagents !== void 0) return [subagents];
			return [row.completed
				? { state: "done", label: t("status.completed") }
				: { state: "idle", label: t("status.idle") }];
		}
		function RecentRowCard({ row, t, now }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: RecentSessions_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: RecentSessions_module_css_default.cardTitle, children: row.title }),
					row.cwd && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: RecentSessions_module_css_default.cardPath, children: row.cwd }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: RecentSessions_module_css_default.cardTime, children: hoverTimeLabel(t, row.updatedAt, now) }),
					renderRecentHoverSlot(row.id),
					...recentCardStatuses(row, t).map(({ state, label }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: RecentSessions_module_css_default.cardStatus,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })
						]
					}, label))
				]
			});
		}
