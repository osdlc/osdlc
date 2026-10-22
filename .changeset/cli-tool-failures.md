---
"@osdlc/cli-tool": minor
---

**Breaking:** a classified failure now sets the exit code of its category. A classified failure is reported the same way by every CLI. `runMain` renders a thrown `FailureError` (including `CommandFailed`, which carries command-seam's kinds only) as `<tool>: <message> <hint>` and exits with the code for its kind from one shared table: 22 for a missing tool, 23 when a service refused the caller or answered unusably, 24 when there is no repository or remote, 25 when the service could not be reached or rate-limited. Any other kind, such as the generic `exit` of a bare `CommandFailed`, exits 1, and a thrown non-failure keeps its message and exit 1. New exports: `FAILURE_EXIT`, `EXIT_FAILURE`, `exitCodeFor`, `failureOf`, `renderFailure` and `failWith` (report a `Result` failure and return its exit code without throwing). `@osdlc/result` is a new dependency.
