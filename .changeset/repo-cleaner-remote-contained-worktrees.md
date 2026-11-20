---
'@osdlc/repo-cleaner': minor
---

A clean worktree whose HEAD is on a branch of the fetched remote is now `delete`, whatever its PR state short of an open PR, once its branch shows a sign of use. Nothing is lost: the remote holds the commits. The row carries no `abandon-unmerged`, and `evidence.recoverableFrom` names the remote branches (it is part of the plan fingerprint). A run that also deletes every one of those remote branches drops the worktree unless `abandon-unmerged` is allowed. A sweep that did not fetch keeps its verdict and notes that `--remote` would check.
