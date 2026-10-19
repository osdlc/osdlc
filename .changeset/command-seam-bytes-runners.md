---
"@osdlc/command-seam": minor
---

Add bytes runners for output that is not text: `spawnBytesRunner` and
`spawnBytesRunnerAsync` return stdout and stderr as a `Buffer` each, exactly
as the child wrote them, typed `CommandResult<Buffer>` (`BytesCommandRunner`,
`AsyncBytesCommandRunner`). The cap cuts at `maxOutputBytes` exactly rather
than on a character boundary. `CommandResult` and `CommandFailed` take the
output type as a parameter, `string` by default, and `CommandOutput` names
`string | Buffer`. `runChecked`, `runCheckedAsync`, `asAsync`, `failureText`,
`stderrOrError` and `CommandFailed` take bytes results and decode stderr for
their messages. `input` now takes a `Uint8Array` too, on every capture runner.
`@osdlc/command-seam/testing` adds `fakeBytesRunner` (and `FakeBytesRunner`),
and `fakeNeverExited` serves its tables.
