# Codex-style Code Review for DSH

Run `/review` in the current conversation to choose uncommitted changes, a base branch, a commit, or custom instructions. `/review <instructions>` starts a custom review directly. The command queues an ordinary user chat message for the review request, which the installed history-edit plugin can edit later. DSH also retains the command execution record. An isolated native spawn agent inspects Git, source, and necessary tests under the host permission policy. It does not inherit the parent conversation or receive a preloaded repository snapshot.

The bundled Codex rubric asks for prioritized findings, file locations, per-finding confidence, an overall correctness verdict, and overall confidence. Invalid JSON is preserved as a labelled text fallback rather than misreported as zero findings. DSH presents the tool report through the parent conversation; it does not expose Codex's native review turn events or Desktop comment card.

An empty `/review` opens the scope picker before sending any review request. Skipping or cancelling sends nothing. Branch and commit choices are resolved into explicit review instructions before sending, without relying on the model to open the picker. `/review <instructions>` still sends custom instructions directly.

Use `/review-status` for the latest report and `/review-cancel` to cancel scope selection or an active review. Optional config: `reviewModel`, `language` (`zh` or `en`), and an absolute `reportDirectory`. Reports default to `$DSH_HOME/codex-review`. Older reports in `$DSH_HOME/code-review` remain untouched.

The reviewer is instructed not to modify code or produce a fix. Its actual command permissions come from DSH; web search and recursive agent delegation are blocked. The plugin does not fetch remote branches or apply fixes.
