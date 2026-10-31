---
'@osdlc/repo-cleaner': patch
---

`apply` fixes:

- The run a confirmation approves keeps the safe-to-delete guard: a row that turned into a review row between the preview and the yes is dropped as `needs-review`, not run.
- Two clones of one remote no longer delete its branches twice. The second row is dropped as the new reason `duplicate`, naming the clone that deletes it; before, the second push was rejected and the run stopped with exit 11.
- A swept `apply` re-checks once before asking, from the sweep it just ran, instead of sweeping again; the run that deletes still sweeps afresh.
- A run that deletes without a receipt file says so on stderr.
- An empty plan's JSON receipt says `complete`, not `dry-run`, unless the run was `--dry-run`.

Library: `ApplyOptions.safeOnly` and `ApplyOptions.swept`, the `duplicate` drop reason, and `RECEIPT_VERSION`.
