---
'@osdlc/cli-tool': minor
'@osdlc/wayfinder': patch
---

`runMain` now ends a run quietly with exit 0 when the reader of stdout or stderr goes away (`tool --json | head -1`), instead of crashing on an unhandled `EPIPE`. The guard is exported as `quietOnBrokenPipe(stream)`; wayfinder now uses it in place of its own copy.
