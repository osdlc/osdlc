---
'@osdlc/pr-update': patch
---

A survey that cannot list the worktrees no longer reads that as "no checkout holds the branch". It used `git.soft.worktrees()`, whose `[]` on a failure cleared the unpushed-local guard and could plan a force-push over local commits. It now uses `git.try.worktrees()`, and a failed listing counts as unsafe, like refs that cannot be read: the PR gets the `guard:unpushed-local` strategy. This matters on a git older than 2.34, where typed-git's `worktrees()` now fails as `unsupported-git`. `unpushedLocalWork` and `surveyRows` take `null` for worktrees that could not be listed.
