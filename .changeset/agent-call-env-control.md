---
"@osdlc/agent-call": minor
---

The spec can now control what the agent process inherits. `unsetEnv` names variables the child must
not get, such as `GH_TOKEN` and `GITHUB_TOKEN`. `inheritEnv` (default `'all'`) can be a list, so the
child inherits only those parent variables. `BASELINE_ENV` is a new export listing the names a CLI
usually needs; it is never added for you, so spread it into the list. A bare binary name with no
`PATH` in the child fails with `spawn-failed`. The two fields are library-only for now: the CLI spec
file does not accept them yet. Existing calls are unchanged.
