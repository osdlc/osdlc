---
"@osdlc/host-cleaner": minor
---

Add the `vscode` plugin, which removes VS Code's storage for workspaces that no longer exist (holding for review, as `lost`, storage that keeps chat or agent history) and refuses to delete a worktree a VS Code window has open. `kit.running` also returns each process as `{ pid, command }`.
