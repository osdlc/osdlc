---
'@osdlc/command-seam': patch
---

A working directory that cannot be entered (no search permission) is now classified `bad-cwd`, with a "cannot be entered" message, instead of `not-executable`. An argument list over the OS limit (E2BIG) is now a `spawn` failure instead of a throw.
A `kill()` that fails (such as EPERM) is no longer reported as a spawn failure: a timeout, abort or `maxOutputBytes` stop keeps its own result, and a managed process stays running until it exits.
`commandString` writes `cd ./-` for a folder named `-`. On Windows, `which()` handles quoted PATH entries and an `env` override replaces the parent's variable whatever its case.
