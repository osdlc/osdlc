---
"@osdlc/pr-update": minor
---

`pr_update.verify: detect` is an opt-in tier that runs a well-known test command found in each PR's update worktree: the configured `test_command`, else a `test` recipe or target of a justfile or Makefile, else `scripts.test` of `package.json` (run with the package manager its lockfile names), else `cargo test`, `go test ./...` or `sbt test`. The run prints which rung it used for each PR on stderr, and fails that PR's verify, not the run, when none matches. `verify: detect` in the project file is trust-gated like `test_command`. `VerifyWhich` gains `'detect'`, resolved per PR with the update worktree as `checkout`, and `detectVerifyCommand` is exported for a host's own `resolveVerifyVerbs`.
