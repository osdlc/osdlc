---
"@osdlc/repo-cleaner": minor
---

A `removeWorktree` option on `check` and `run` lets a host remove the worktrees it manages in place of `git worktree remove`. The live-process and forced-remove checks still run first, the preview shows the command it returns, and the step fails unless the directory is gone and git no longer lists the worktree. `fingerprint`, `sameFingerprint`, `PlanSchema` and `writeJsonAtomic` are now exported, so a host judges its own rows by the same rule.
