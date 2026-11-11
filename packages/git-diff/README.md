# Git Diff Sidebar

Read-only Git changes panel in the right sidebar. The button appears at the right end of the conversation view tabs when multiple views are open, or in the conversation header for a single view. It opens four comparison ranges: uncommitted (HEAD to working tree, including untracked files), unstaged (index to working tree), staged (HEAD to index), and branch (merge base of a selected local/remote branch to HEAD). Branch comparison does not include working tree changes. Refresh updates the file list and line diff. No Git state is changed.

Install with `dsh plugin --profile desktop add <plugin-directory>`. The conversation must have a Git working directory.

The Changes toolbar provides an optional `data-git-diff-actions` mount keyed by session ID. Worktree Control uses it to place its environment commands immediately to the right of Changes; neither plugin requires the other to be enabled.
