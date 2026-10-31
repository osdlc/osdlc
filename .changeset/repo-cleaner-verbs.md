---
'@osdlc/repo-cleaner': minor
---

**Breaking:** the CLI is three commands over one set of sweep options, and `apply` asks before it deletes.

- `repo-cleaner [status]` is the report, as before.
- `repo-cleaner plan` writes the plan to stdout, or to a file with `-o <file>`. It replaces `--write-plan` and `--plan-out`. Plans no longer go to a hidden directory by default.
- `repo-cleaner apply` sweeps and plans in memory, or reads `--plan <file>` (`-` reads stdin). With no `--row` it applies every row the re-check judges `safe-to-delete`, and drops a row to review with the new reason `needs-review`; name a review row with `--row` to apply it. It re-checks each row, prints the steps and asks `Delete N items? [y/N]`. `--yes` (`-y`) skips the question. With no terminal and no `--yes` it refuses with exit 2. `--plan -` needs `--yes` or `--dry-run`. On yes it runs only the steps it showed.
- `--only worktrees,branches,remotes` replaces `--scope local-branches,worktrees,remote-branches`, and works on every command.
- `--allow <risk>[=<category>:<id>]` replaces `--authorize`.
- Receipts go beside a `--plan` file as `<plan>.receipt-<timestamp>.json`, or to `--receipt <file>`. `--receipt-dir` and the default receipts directory are removed. A run that swept, or read stdin, writes a receipt only with `--receipt`.

Library: `applyPlan` with an empty row list selects every row of the plan and drops each one not judged `safe-to-delete` (`needs-review`), and `receiptPath` may be `null` to write no receipt. New `parsePlan(text, source)`. `stampedPath` is removed; use `fileStamp`.
