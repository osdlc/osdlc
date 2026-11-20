---
'@osdlc/pr-update': minor
---

`on_rebase_conflict: repair` calls `repair` at a rebase stop the resolvers cannot clear, then continues the rebase, for at most `repair.max_rebase_stops` stops (default 3). Past the cap, or on a failed repair, the rebase is aborted and the PR is reported as a conflict; it never falls back to a merge. The request carries `replaying` (the commit being replayed and the base), and the prompt asks to keep that commit's intent.
