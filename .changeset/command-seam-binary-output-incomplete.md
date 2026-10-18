---
"@osdlc/command-seam": minor
---

`CommandFailed` now names the program that failed, and the sync runner flags output it stopped reading early.

- `CommandFailed.message` includes the binary: `command failed (exit 1): git nope` instead of `command failed (exit 1): nope`. The new `binary` field holds it, and the constructor takes it as an optional third argument. `runChecked` and `runCheckedAsync` read it from the runner's new optional `binary` property. `spawnRunner`, `spawnRunnerAsync`, `asAsync` and `withDefaults` runners have it. A fake runner without `binary` keeps the old argv-only message. ([#231](https://github.com/osdlc/osdlc/issues/231))
- `CommandResult` has a new `outputIncomplete` flag. The sync runner sets it when the child exited but a process it started still held stdout or stderr open at `timeoutMs`. That run used to look like a success with a stray `ETIMEDOUT` in `error`. Under Bun, a child that exits right at the output cap gets the flag too. `exitCode` stays the child's own and `reason` stays absent, so `ran` and `runChecked` still count the run as a success. Check `outputIncomplete` when the output must be whole. ([#232](https://github.com/osdlc/osdlc/issues/232))
