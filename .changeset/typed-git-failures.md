---
"@osdlc/typed-git": minor
---

**Breaking:** `git.try.*` returns `Result<T, GitFailure>` from `@osdlc/result`. `GitOutcome` is removed. The error is a classified `GitFailure` (`kind`, `message`, `hint`, `detail`, `argv`, `exitCode`) and its `cause` is the `CommandFailed`; read the raw result at `error.cause.result`. `kind` is a `GitFailureKind`: every `@osdlc/command-seam` failure kind (`not-installed` carries the hint `Install git from https://git-scm.com.`), plus `not-a-repo`, `no-remote`, `remote-unreachable` and `not-authenticated`, read from git's stderr. `classifyGitFailure(commandFailed)` is exported. The plain verb (throws `CommandFailed`) and `git.soft.*` are unchanged. `@osdlc/result` is now a dependency.
