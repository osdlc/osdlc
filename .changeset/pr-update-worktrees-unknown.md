---
'@osdlc/pr-update': patch
---

When `git worktree list` fails, the unpushed-work guard's reason now says so (`could not list worktrees, so assuming unpushed work in another checkout`) instead of claiming the head branch is checked out elsewhere. The guard still applies, and the rule is still `guard:unpushed-local`. `StrategySignals` gains an optional `worktreesUnknown`.
