---
'@osdlc/repo-cleaner': minor
---

New `repo-cleaner summary`: a table per repository counting local branches, worktrees and remote branches, with how many are merged into the default branch and how many the sweep would delete, review or keep. `--output json` gives the counts without the rows.

Each row now records `facts.merged`: true when its work is on the default branch by ancestry, an exact-head merged PR or a patch match. A branch checked out in a worktree, or at HEAD, is judged by ancestry or PR alone. The default branch and the primary or current worktree carry none. `SummaryBucket` gains `merged`, so the JSON report's `summary` counts it too.
