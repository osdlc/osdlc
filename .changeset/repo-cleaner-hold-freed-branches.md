---
"@osdlc/repo-cleaner": minor
---

`holdFreedBranches(items)` keeps a branch freed for its worktree's removal when that worktree no longer goes, such as when a host's `annotate` holds the worktree back. `applyPlan` runs it after `annotate`. A host should run it on its own annotated rows too, so the counts and the plan match what `apply` will do.
