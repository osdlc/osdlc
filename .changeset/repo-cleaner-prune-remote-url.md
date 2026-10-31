---
'@osdlc/repo-cleaner': minor
---

A worktree row whose directory is gone, or is no longer a checkout, now reads `prune` instead of `delete` in the report, and `summary` counts those rows in a `prune` column (and a `prune` count in each JSON bucket, a part of `safe-to-delete`). The row's `action` is `prune`.

New `--remote-url <url>` on every sweeping command: sweep a remote's branches with no checkout of your own. The URL is cloned once (`--no-checkout`) under the cache directory and reused; deletes are pushed from that clone, so a plan written with `--remote-url` can be applied later from anywhere.
