---
'@osdlc/cli-tool': minor
'@osdlc/wayfinder': patch
---

`runMain` no longer crashes on an unhandled `EPIPE` when the reader of stdout or stderr goes away (`tool --json | head -1`): the rest of the output is dropped, `main` runs to its end, and the exit code is `main`'s, so a tool is never stopped between two steps. The guard is exported as `quietOnBrokenPipe(stream, exit)`, where an exit function ends a read-only run at once; wayfinder now uses it in place of its own copy.
