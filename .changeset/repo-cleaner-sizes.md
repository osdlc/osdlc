---
'@osdlc/repo-cleaner': minor
---

`--sizes` (and the `sizes` sweep option) reads each on-disk worktree's size with `du -sk` into `evidence.sizeBytes` (`null` when `du` fails or times out), lists rows largest first within each verdict, and reports `reclaimableBytes` for the `delete` and `review` rows in the totals line and in JSON. Sizes are not part of a plan fingerprint. New exports: `sizeOf`, `formatBytes`. `repo-cleaner cache` now reports disk usage through `sizeOf` rather than apparent size.
