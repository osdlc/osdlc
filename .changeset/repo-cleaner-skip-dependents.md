---
'@osdlc/repo-cleaner': minor
---

`clean`: a failed step no longer ends the run. It skips only the steps that depend on it and the rest go on: a failed unlock skips that row's remove, a failed worktree removal skips the delete of the branch it held and a repository-wide prune, and a failed local branch delete skips the same branch's remote delete. Nothing in another repository is skipped. A failed spared-tip check still stops the run. A skipped step has the new receipt result `skipped` and names the failed step in `error`, so the receipt version is now 3. The summary counts steps run, failed and skipped, `RunSummary` gains `ran` and `skipped`, and the exit code is still `11` when any step failed.
