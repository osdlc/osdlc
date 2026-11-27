---
"@osdlc/host-cleaner": minor
---

Add the config's `agentFolders`: folders where coding agents keep their own worktrees. The core refuses (`agent-worktree`) every candidate in or holding one, for every plugin, and the list adds to a built-in one that always applies: Cursor's `~/.cursor/worktrees` and the Codex app's `~/.codex/worktrees`. Cursor's agent worktrees are refused by the core, as `host-cleaner`, not by the `cursor` plugin.
