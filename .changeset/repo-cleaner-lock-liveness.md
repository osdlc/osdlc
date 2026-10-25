---
'@osdlc/repo-cleaner': minor
---

A worktree lock held by a dead process no longer blocks removal, and a live process inside a worktree now does.

- A lock reason with a `pid <N>` token (optionally `start <time>`) is read as an owner claim. When that process is dead, or its start time (a timestamp precise to the second) differs from the lock's, the lock is stale: the worktree gets `facts.stale_lock`, no `locked-worktree` blocker, and `apply` runs a new `unlock-worktree` step before the remove. It checks the owner and the directory again just before the unlock and the remove, and `stale_lock` is part of the worktree fingerprint. A lock with no `pid` token, or a live owner, still blocks.
- A new `live-process` blocker covers any process other than an idle shell (`sh`, `bash`, `zsh`, `fish` with no child processes) whose working directory is inside the worktree. Idle shells are listed in `facts.idle_shells`. When the process table cannot be read, the worktree gets a `process-probe-failed` blocker instead.
- New `ProcessProbe` port (`alive`, `holders`; `probe` is required on `gatherWorktrees` and `classifyWorktree`) with a default over `ps` and `lsof` run through `@osdlc/command-seam`. Pass `probe` to `sweepRepo`, `sweepRepos`, `applyPlan`, `gatherWorktrees` or `classifyWorktree` to replace it. Exports: `defaultProcessProbe`, `parseLockOwner`, `parseLsofCwd`, `isIdleShell`, `worktreeUnlockCommand` and the types.
- The receipt's step `action` gains `unlock-worktree`. Uses `worktreeUnlock` from `@osdlc/typed-git`.
