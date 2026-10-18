---
"@osdlc/command-seam": minor
---

Add a `maxOutputBytes` option to the capture runners: the most bytes to keep from each of stdout and stderr. A child that writes more to either stream is killed with `SIGKILL`, or its whole group with `processGroup`. The result has `neverExited: true`, `reason: 'output'`, and that stream cut to the cap on a character boundary. A child that exits before the kill lands keeps its exit code and gets `outputIncomplete: true`. The async runners have no default cap; on the sync runners the option replaces the default 256 MB. Over the cap, the sync runner now also cuts each stream back to the cap on a character boundary, since `spawnSync` can return more than its limit. The `bun test` capture path ignores the option. `StreamRunOptions` leaves it out, since a streaming run captures nothing. ([#233](https://github.com/osdlc/osdlc/issues/233))

The sync runner, `streamRunner` and the README now point runs that may start background work at `spawnRunnerAsync` or `managedProcessRunner` with `processGroup: true`, since the sync and streaming runners kill only the direct child on timeout. ([#247](https://github.com/osdlc/osdlc/issues/247))
