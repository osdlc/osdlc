---
"@osdlc/repo-cleaner": minor
---

**Breaking:** remote branches are no longer swept by default. Every sweeping command now reads worktrees and local branches only, which is much faster; pass `--remotes` (or `--only remotes`, or `--remote-url`) to include remote branches. A text report that left them out ends with a line saying so. `--branch` follows the same rule: its remote branch is included only with `--remotes`.

`apply` re-checks only the categories its selected rows are in, so applying local rows from a plan no longer compares every remote branch again.

On a terminal, the report, the counts and the apply preview are colored: red for delete, blue for prune, yellow for review and skipped rows, green for keep. `NO_COLOR` turns it off; a pipe or file gets none unless `FORCE_COLOR` asks for it. The preview shown before `Delete N items?` now lists, per repository, each row to delete or prune with its command beneath, each skipped row with its reason, and the counts, with terminal controls stripped from paths, names and commands.
