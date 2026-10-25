---
'@osdlc/command-seam': minor
---

Windows hardening, a process-tree kill, and a safer PowerShell line.

- New `killTree` option on the async runners (`spawnRunnerAsync`, `spawnRunnerBytesAsync`, and the shell runners built on them). With `killTree: true`, a timeout, an abort or the output cap kills the child's whole process tree, not only the child. On POSIX it is `processGroup: true`. On Windows the runner runs `taskkill /pid <pid> /t /f` from `%SystemRoot%\System32`, by absolute path, then kills the child.
- `commandString` with `shell: 'powershell'` and `cwd` writes `if (Set-Location -LiteralPath <dir> -PassThru) { <line> }`, so the command does not run in the wrong folder when the change of folder fails.

**Breaking changes**

- On Windows, a binary `which` cannot find is no longer spawned by its bare name, which made Windows search the current folder first. The run fails at once with `spawn <binary> ENOENT`, which `classifyFailure` still reads as `not-installed`. What to do: nothing, unless you relied on a program in the current folder being found without a path; pass its path instead.
