---
"@osdlc/pr-update": patch
---

`update --help` now says what a run without `--apply` does: it pushes, keeps
and records nothing, but still fetches, takes clone locks, makes worktrees,
scratch branches and commits, and runs resolvers and verify. It said that
nothing was written. The README's exit codes now say that a `survey` whose PR
listing failed exits with that failure's code, not 0.
