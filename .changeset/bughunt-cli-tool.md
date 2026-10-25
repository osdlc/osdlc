---
'@osdlc/cli-tool': minor
---

A hyphenated flag key (`'project-local'`) is read back under its own key, not commander's camelCased one. `--output json` before the command word routes like `--json`. `captureContext` passes the abort `signal` through. `failWith` strips terminal control characters from what it prints. A command that is both a file and a directory in the command tree is an error.
devlink (experimental): a relative `--bin-dir` resolves against the given cwd. `validateSpec` is stricter: `marker`, `entry` and `launcher` may not hold `.` or empty segments (so `./bin/x` and a trailing slash are refused), and each alias must be a single path segment. `CliIo` from the devlink entry is now the package's stable `CliIo`.
Exit code change: through `@osdlc/command-seam`, a working directory that cannot be entered is now `bad-cwd` rather than `not-executable`, so a CLI built on cli-tool exits with the `repository` code there instead of `missingTool`.
devlink (experimental), stricter: `findOnPath`, and so `dev status`, now reports only an executable file on an absolute `PATH` entry, through `@osdlc/command-seam`'s `which`. A relative entry, a file without the execute bit and a dangling symlink are no longer reported. `dev status`'s "move it" line quotes paths with `@osdlc/command-seam`'s `shellQuote`, so a path of plain characters is printed bare and a `\` is quoted so the line also pastes into fish.
