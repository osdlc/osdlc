---
'@osdlc/cli-tool': minor
---

`runMain` answers a first argument of `--where`: the running file, the checkout or install it belongs to, and, with devlink, which layer chose it. `--where --json` prints the same facts as one object. `devlinkHook` now keeps the `<NAME>_LAUNCH_LAYER` it reads and reports it through a new optional `DevlinkHook.describe()`; a plain-function hook still works and gets no `chosen by` line. New `script` and `execPath` options stand in for `process.argv[1]` and `process.execPath`.
