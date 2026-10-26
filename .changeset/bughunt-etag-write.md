---
'@osdlc/etag-write': minor
---

Behaviour change: when `atomicWrite` or `atomicWriteAsync` cannot create its temp file because the name is already taken, the write still fails but no longer deletes that file, which belongs to another writer.
