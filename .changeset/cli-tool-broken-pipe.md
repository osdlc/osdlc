---
'@osdlc/cli-tool': minor
'@osdlc/wayfinder': patch
---

`runMain` no longer crashes on an unhandled `EPIPE`: when the reader of stdout goes away (`tool --json | head -1`) the run ends quietly with exit 0, and a closed stderr is ignored, so the exit code is still the run's own. The guard is exported as `quietOnBrokenPipe(stream, exit)`; wayfinder now uses it in place of its own copy.
