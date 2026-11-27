---
"@osdlc/workstation-cleaner": minor
---

Add the `cursor` plugin, which removes Cursor's storage for workspaces that no longer exist only when picked and `discard-user-data` is allowed, since that storage holds chat history, and refuses any `git` worktree in Cursor's agent worktrees (`~/.cursor/worktrees`) and any `git` worktree a busy process works in, since the `cursor-agent` CLI runs as `node`.
