---
'@osdlc/wayfinder': patch
---

`way clean` no longer removes a store that holds the home directory under a directory whose name starts with `..` (such as `..x`). `way --cached --no-exec` now re-probes a runner whose stored rows were taken with exec allowed, instead of reporting it as fresh with no tasks.
