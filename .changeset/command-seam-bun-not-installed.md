---
"@osdlc/command-seam": patch
---

`classifyFailure` reports `not-installed` for Bun's `Executable not found in $PATH` text, which Bun uses where Node says `ENOENT`. A program that is not installed no longer comes out as kind `spawn` under Bun.
