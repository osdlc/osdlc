---
'@osdlc/pr-update': minor
---

`pr_update.verify: detect` is an opt-in tier that runs a well-known test command found in the repository: the configured `test_command`, else a `test` recipe or target of a justfile or Makefile, else `scripts.test` of `package.json` (run with the package manager its lockfile names), else `cargo test`, `go test ./...` or `sbt test`. The run prints which rung it used for each repository on stderr, and fails before touching any PR when none matches. `verify: detect` in the project file is trust-gated like `test_command`. `VerifyWhich` gains `'detect'`, and `detectVerifyCommand` is exported for a host's own `resolveVerifyVerbs`.
