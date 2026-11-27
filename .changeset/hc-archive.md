---
"@osdlc/workstation-cleaner": minor
---

`workstation-cleaner clean --archive` pushes unlanded work to an archive branch on the remote before deleting it, as `repo-cleaner clean --archive` does: one archive per repository a run, made before another plugin acts on the repository's candidates or on a candidate inside one of its worktrees. `--archive-exclude` leaves matching files out of a worktree's snapshot. `Ctx.run` gives `roots`, `prepare`, `delete` and `deleted` the candidates the run deletes. A `prepare` may return a sentence, which the receipt keeps in the step's `prepared`.
