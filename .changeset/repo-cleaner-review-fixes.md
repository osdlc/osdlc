---
'@osdlc/repo-cleaner': patch
---

`apply` fixes: a branch name two repositories share applies in both instead of failing as ambiguous; a repository the sweep could not read (such as a failed fetch) is named on stderr and exits 1 instead of reading as "nothing to delete", and `plan` does the same; the receipt file records the rows the preview dropped; a worktree's fingerprint includes `on_disk`, so a prune row whose directory came back is dropped rather than removed. The status line strips terminal controls from paths and fits wide characters to the terminal's width. A worktree's `facts.merged` counts a patch match the same way a branch's does.

Library: `applyPlan` takes `RowSelection` rows (a row with an optional `repo`) and `ApplyOptions.dropped`.
