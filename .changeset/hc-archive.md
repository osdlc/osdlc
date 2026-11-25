---
"@osdlc/host-cleaner": minor
---

`host-cleaner clean --archive` pushes unlanded work to an archive branch on the remote before deleting it, as `repo-cleaner clean --archive` does: one archive per repository a run, made before another plugin acts on the repository's candidates. `--archive-exclude` leaves matching files out of a worktree's snapshot. `Ctx.run` gives `prepare`, `delete` and `deleted` the candidates the run deletes.
