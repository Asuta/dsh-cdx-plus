# Git Worktree Control

A DSH right-sidebar panel for managing Git worktrees. Switching a worktree only changes the current conversation's working directory, so the conversation history stays continuous.

## Features

- Create a detached worktree from HEAD or a local/remote branch, optionally creating a new branch.
- The native branch button below an assistant reply offers a regular conversation fork in the current workspace or a fork in a newly created worktree. The worktree option immediately creates and opens the fork, copying uncommitted changes by default; it explains when Git, session state, or read-only access prevents creation.
- New conversations have a compact picker for creating a worktree, choosing its base ref, and selecting a local environment. Creation occurs on the first prompt; detailed controls remain in the sidebar.
- A fork marker identifies conversations in any Git linked worktree and follows their current directory.
- With sidebar-chat, promoting a side chat preserves its project and working directory and registers it as another conversation in the same worktree. Both conversations share files; archiving one preserves the tree while the other still uses it.
- Optionally copy staged, unstaged, and untracked changes into the new worktree without changing the source checkout.
- Copy ignored local files matched by .gitignore-style .worktreeinclude patterns, plus ignored AGENTS.override.md files. Existing destination files are preserved; symlinks and escaping paths are rejected.
- Save, edit, delete, and switch multiple local project environments, including a default and per-conversation selection. Copy .codex/environments/environment.toml into an editable environment when needed.
- Run the selected environment's setup script after creating a worktree; manually run project actions. If setup fails, the first message still proceeds in the new worktree and the details panel shows the failure. Switching an existing conversation's environment does not rerun setup.
- Switch the same conversation between the local checkout and Git worktrees, or hand off changes to the local checkout or the conversation's previous worktree.
- Inspect changes and stage, unstage, or discard files; commit staged changes, push branches, and open the GitHub CLI PR flow.
- Snapshot before archiving and restore a snapshot later.
- Archiving a loaded conversation snapshots its associated worktrees when no other unarchived conversation uses them. Pinned worktrees are preserved; old trees associated with unloaded conversations are handled later by retention cleanup.
- Configure a per-repository retention limit (default 15; 0 disables automatic cleanup). Pinned, current, and active-session worktrees are skipped.

## Environment commands

The compact run menu beside Changes lists the current environment's manual actions, with Switch environment and Manage environments entries. It is hidden outside Git working directories. Selecting another environment does not rerun setup.

Menu actions, detail-panel commands, and automatic setup for new worktrees open DSH's built-in sidebar terminal with live command output and results in the target worktree. Selecting a running action focuses its terminal instead of launching it twice. Logs remain after completion; each later run opens a fresh terminal, so close completed terminals to free slots. Ctrl+C, the menu's Stop action, and closing the execution terminal stop the command. Manual actions support long-running development servers; setup retains a ten-minute timeout.

Enable the built-in terminal and make Node.js available on the local PATH. Actual commands retain the conversation's permission restrictions. Setup starts only after the terminal connects; a 45-second launch timeout reports a failure and preserves the created worktree. While a command is active, this plugin prevents Git mutations, switching, and cleanup of that worktree.

Manual actions have separate name and multiline command fields. Enter inserts a newline; pasted scripts keep their line breaks after saving. Commands share one script scope and run in the current worktree directory.
Saving ignores actions whose name and command are both empty or whitespace-only. Incomplete actions show their row number and missing field, and focus that input. Failed saves preserve the form and the previously saved configuration.

Setup scripts and manual actions stop on errors by default. Windows uses PowerShell with explicit nonzero-exit checks for native programs such as Git; other platforms use `sh -e`. Explicit conditions, error handling, and pipelines retain their shell's control-flow semantics. Stopping does not undo commands that already succeeded.

## Install

This plugin is developed in dsh-plugin-lab and can be installed from a local directory:

~~~powershell
dsh plugin --profile desktop add <plugin-directory>
~~~

Refresh the DSH web app after installation. The user performs final desktop-app acceptance.

## Data and safety

- Worktrees default to .agents/worktrees/ in the primary checkout. A different absolute root can be configured in the panel for future worktrees.
- State and archive refs are stored in the repository's Git common directory under dsh-worktree-control/ and refs/dsh-worktree-control/archive/.
- Snapshots preserve tracked changes, non-ignored untracked files, reachable commits, and files explicitly listed in .worktreeinclude. Other ignored files are excluded.
- Worktrees with submodules or unresolved conflicts cannot be archived. Targets are checked before archive, restore, and snapshot deletion.
- Setup scripts run only after an explicit user choice. Pull request creation requires an installed and authenticated GitHub CLI (gh).
- Handoff copies changes relative to the common ancestor without modifying the source checkout or moving the target branch. The target must be clean and accept the changes without conflicts; imported changes are staged.
- Directory changes use DSH's working-directory service and preserve conversation and sidebar-tab identity. Existing processes keep their original directories.
- Snapshots do not preserve the original staged/unstaged boundary. Restoration uses a detached HEAD; create a branch in the panel before pushing.
- Automatic cleanup reports when no safe candidate is available instead of forcibly deleting a worktree.

## Development

~~~powershell
npm test
~~~
