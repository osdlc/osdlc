---
'@osdlc/etag-write': patch
---

The README points to `@osdlc/file-lock` for files that several processes rewrite: take the lock, then `writeCas` or `atomicWrite` inside it. The code does not change.
