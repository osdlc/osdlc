---
"@osdlc/command-seam": minor
---

Failures carry a classified `kind`. New `classifyFailure(result, { binary, argv, okExitCodes })` returns a `CommandFailure` (a `Failure` from `@osdlc/result`) with `kind` `not-installed`, `not-executable`, `bad-cwd`, `timeout`, `output-cap`, `signal`, `aborted`, `spawn` or `exit`, a one-line `message` and the full `detail`, or `null` when the run succeeded. It reads any runner's result.

**Breaking:** `CommandFailed` now extends `FailureError` and gains `failure`, the classified `CommandFailure`. Its `message` is unchanged. `runJson`, `runJsonAsync` and `parseJsonResult` return a `Result` with the run alongside: `{ ok: false, error, result }` where `error` is a `JsonFailure` (`error.kind` is a `CommandFailureKind`, `'unparseable'` or `'invalid'`). The `reason` and `message` fields and `reason: 'failed'` are removed; read `error.kind` and `error.message`. `@osdlc/result` is now a dependency.
