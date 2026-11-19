---
"@osdlc/repo-cleaner": minor
---

`clean --archive` (and the `archive` option of `check` and `run`) pushes the work a run would lose to an archive branch on the repository's remote, checks with `ls-remote` that it is there, and only then deletes. A new risk, `discard-archived`, takes the place of `abandon-unmerged` and `discard-changes` on a row whose work the archive holds; a file the snapshot leaves out (secret-shaped, `--archive-exclude`, over 10 MiB) keeps `discard-changes`, and a worktree's submodule work keeps both. A worktree's uncommitted files are snapshotted in a temporary index, so its own index and files are not touched. The receipt gains an `archive` step that records the ref, the sha and what each parent holds. Without `--archive`, `clean` behaves as before. Needs `@osdlc/typed-git` with `readTree` and `writeTree`.
