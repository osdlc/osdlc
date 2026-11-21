---
'@osdlc/repo-cleaner': minor
---

`repo-cleaner status --sizes` (`sizes` in the library's sweep options) reads each on-disk worktree's size with `du -sk` into `evidence.sizeBytes` (`null` when `du` fails or times out), lists rows largest first within each verdict, and reports `reclaimableBytes` for the `delete` and `review` rows in the totals line and in JSON. `--sizes` is a `status` flag: `plan` and `clean` refuse it (exit 2). Sizes are not part of a plan fingerprint.

`clean` reports the disk space it freed, with no flag: each worktree a `remove-worktree` step removes is measured with `du` just before, into the step's new optional `freedBytes` in the receipt (`null` when the measurement failed or timed out; set only once the removal succeeded). The run summary adds `freed: 4.2 GB (2 worktrees)`, or `freed: at least 4.2 GB (2 worktrees, 1 not measured)`, and `RunSummary` (the JSON `summary`) gains `freedBytes` and `unmeasured`. A dry run measures nothing. `RunOptions.sizeTimeoutMs` caps each measurement.

New exports: `sizeOf`, `formatBytes`. `repo-cleaner cache` now reports disk usage through `sizeOf` rather than apparent size.
