---
"@osdlc/agent-call": minor
---

The spec can now control what the agent process inherits. `unsetEnv` names variables the child must
not get, such as `GH_TOKEN` and `GITHUB_TOKEN`. `inheritEnv` (default `'all'`) can be a list, so the
child inherits only those parent variables. `BASELINE_ENV` is a new export listing the names a CLI
usually needs (`PATH`, `HOME`, locale, temp directory); it is never added for you, so spread it into
the list. The environment is built in one place for every adapter: parent, `inheritEnv`, `unsetEnv`,
the adapter's variables, then `spec.env`, so an explicit `env` value wins over a removal. A bare
binary name with no `PATH` in the child fails with `spawn-failed`. `--explain` and `--dry-run` print
the names. Existing calls are unchanged.
