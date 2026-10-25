---
'@osdlc/cli-tool': patch
---

A hyphenated flag key (`'project-local'`) is read back under its own key, not commander's camelCased one. `--output json` before the command word routes like `--json`. `captureContext` passes the abort `signal` through. `failWith` strips terminal control characters from what it prints. A command that is both a file and a directory in the command tree is an error.
devlink (experimental): a relative `--bin-dir` resolves against the given cwd. `validateSpec` is stricter: `marker`, `entry` and `launcher` may not hold `.` or empty segments (so `./bin/x` and a trailing slash are refused), and each alias must be a single path segment. `CliIo` from the devlink entry is now the package's stable `CliIo`.
