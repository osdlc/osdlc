---
"@osdlc/host-cleaner": patch
---

The `cargo` and `node` plugins now measure an artifact with repo-cleaner's `sizeOf`, so sizes are disk usage from `du` rather than the sum of file sizes, and a size `du` cannot read is left out.
