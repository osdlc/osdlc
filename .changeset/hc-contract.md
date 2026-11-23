---
"@osdlc/host-cleaner": minor
---

The plugin contract for the first version: every hook may return a promise and runs under a time limit with its own `ctx.signal`, so `survey`, `recheck`, `clean` and the command line's `main` now return promises.
