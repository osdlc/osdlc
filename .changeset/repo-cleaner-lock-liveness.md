---
'@osdlc/repo-cleaner': minor
---

A worktree lock held by a dead process no longer blocks removal, and a live process inside a worktree now does.

- A lock reason with a `pid <N>` token (optionally `start <time>`) is read as an owner claim. When that process is dead, or its start time differs from the lock's, the lock is stale: the worktree gets `facts.stale_lock`, no `locked-worktree` blocker, and `apply` runs a new `unlock-worktree` step before the remove. It checks the owner again just before the unlock, and `stale_lock` is part of the worktree fingerprint. A lock with no `pid` token, or a live owner, still blocks.
- A new `live-process` blocker covers any process other than an idle shell (`sh`, `bash`, `zsh`, `fish`) whose working directory is inside the worktree. Shells are listed in `facts.idle_shells`.
- New `ProcessProbe` port (`alive`, `holders`) with a default over `ps` and `lsof` run through `@osdlc/command-seam`. Pass `probe` to `sweepRepo`, `sweepRepos`, `applyPlan`, `gatherWorktrees` or `classifyWorktree` to replace it. Exports: `defaultProcessProbe`, `parseLockOwner`, `parseLsofCwd`, `isIdleShell`, `worktreeUnlockCommand` and the types.
- The receipt's step `action` gains `unlock-worktree`. Uses `worktreeUnlock` from `@osdlc/typed-git`.
