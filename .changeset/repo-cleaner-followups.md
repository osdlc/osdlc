---
'@osdlc/repo-cleaner': patch
---

`apply` fixes:

- The run a confirmation approves keeps the safe-to-delete guard: a row that turned into a review row between the preview and the yes is dropped as `needs-review`, not run.
- Two clones of one remote no longer delete its branches twice. The second row is dropped as the new reason `duplicate`, naming the clone that deletes it; before, the second push was rejected and the run stopped with exit 11. Remotes are compared by the push URLs git uses (`url.*.insteadOf` applied), a network URL in any form (`git@host:o/r`, `ssh://`, `https://`) as `host/path`, and a local path as written.
- A swept `apply` re-checks once before asking, from the sweep it just ran, instead of sweeping again; the run that deletes still sweeps afresh.
- A run that deletes without a receipt file says so on stderr.
- Every run ends with a summary: `deleted: 1 worktree, 3 local branches, 2 remote branches`, the dropped rows by reason, and how many rows a failed run did not reach. A preview says `would delete:`. `--output json` adds a `summary` object.
- The prompt's `Delete N items?` counts rows, not steps: a stale-locked worktree is one item, not two.
- `--repo-root` naming no repository in the plan exits 1 instead of reporting nothing to delete.
- An empty plan's JSON receipt says `complete`, not `dry-run`, unless the run was `--dry-run`.

Library: `ApplyOptions.safeOnly` and `ApplyOptions.swept`, the `duplicate` drop reason, `RECEIPT_VERSION`, and `summarizeReceipt`, `renderApplySummary` and `ApplySummary`.
