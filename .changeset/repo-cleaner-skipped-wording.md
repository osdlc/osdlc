---
'@osdlc/repo-cleaner': patch
---

`apply` says `skipped`, not `dropped`, for rows it leaves alone, matching the `skip` label on each row: `skipped 12, not deleted: 8 needs-review (name with --row), 4 not-authorized (--allow abandon-unmerged)`. The counts name how to include each kind. The closing prune step reads `prune   worktree records`, with the repository on the progress board, instead of a bare `prune`. The JSON receipt and summary keep their `dropped` field.
