---
"@osdlc/typed-git": minor
"@osdlc/cli-tool": minor
"@osdlc/pr-update": minor
---

**Breaking:** typed-git's plain door throws the classified failure, as typed-gh's does. A failed git call (any verb, `rawChecked`) now throws a `FailureError` whose `failure` is the `GitFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` had only command-seam's generic `exit` kind, so a signed-out `git push` exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.

New `GitFailureKind` `tls`: `unable to access … SSL certificate problem` is no longer `remote-unreachable`. The host answered, so retrying cannot help until the system clock, the CA certificates or the remote's certificate is fixed. `@osdlc/cli-tool` numbers `tls` 23, with the other "fix it" failures; `@osdlc/pr-update` accounts for it in its exit-table check and reads a push failure through the `FailureError`'s cause.
