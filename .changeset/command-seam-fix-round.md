---
'@osdlc/command-seam': minor
---

Windows hardening, a process-tree kill, and a safer PowerShell line.

- New `killTree` option on the async runners (`spawnRunnerAsync`, `spawnRunnerBytesAsync`, and the shell runners built on them). With `killTree: true`, a timeout, an abort or the output cap kills the child's whole process tree, not only the child. On POSIX it is `processGroup: true`. On Windows the runner runs `taskkill /pid <pid> /t /f`, found on absolute `PATH` entries only, then kills the child.

**Breaking changes**

- On Windows, every `.cmd` and `.bat` target now gets the double `cmd.exe` escape, not only shims in `node_modules/.bin`. Global npm, pnpm and yarn shims and `gradlew.bat` pass `%*` on too, and with one escape a `"` in an argument could end the quoted text and run what followed. A batch file that uses an argument without parsing it again now sees extra `^` characters in it. What to do: nothing for shims and wrappers that pass `%*` on. For a batch file that reads its arguments directly, run the program it wraps instead.
- On Windows, `cmd.exe` now starts with `/v:off`, so `!VAR!` never expands, even when the registry turns delayed expansion on. What to do: nothing, unless a batch file relied on delayed expansion without `setlocal enabledelayedexpansion`; add that line to it.
- On Windows, a binary `which` cannot find is no longer spawned by its bare name, which made Windows search the current folder first. The run fails at once with `spawn <binary> ENOENT`, which `classifyFailure` still reads as `not-installed`. What to do: nothing, unless you relied on a program in the current folder being found without a path; pass its path instead.
- `commandString` with `shell: 'powershell'` and `cwd` now writes `if (Set-Location -LiteralPath <dir> -PassThru) { <line> }`. The old `Set-Location ...; <line>` ran the command in the wrong folder when the change failed. What to do: update any test that compares the exact string.
