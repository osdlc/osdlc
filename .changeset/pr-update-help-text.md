---
"@osdlc/pr-update": patch
---

`update --help` now says what a run without `--apply` does: it pushes, keeps
and records nothing, but still fetches, takes clone locks, makes worktrees,
scratch branches and commits, and runs resolvers and verify. `survey`'s
description adds the `git maintenance run --auto` that follows a managed
clone's fetch. The README's exit codes now say a `survey` whose PR listing
failed exits with that failure's code, not 0.
