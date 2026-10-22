---
"@osdlc/typed-gh": minor
---

`Gh` and `AsyncGh` get `typed-git`'s three doors. **Breaking:** a query no longer answers `null` for a failure. The plain method returns its value or throws `CommandFailed` (a `FailureError` carrying a `GhFailure` of kind `unreadable` when `gh` exited 0 but its output could not be read). A query for one thing (`prView`, `issueView`, `repoView`, and `prFind`, `openPrFor`, `prViewSettled` over them) still answers `null` when GitHub says there is no such thing. `prList`, `prBody`, `graphql`, `labelList`, `issueList`, `repoList`, `searchPrs` and `prReviewThreads` now return a non-null value and throw. `installed`, `authenticated`, `authStatus`, `ready` and `api` are unchanged: their failure is part of their value.

New: `gh.try.*` returns `Result<T, GhFailure>` from `@osdlc/result`; `gh.soft.*` returns `null` for a failed query, which is the old query behaviour, now opt-in (`TriedSync`, `TriedAsync`, `Soft`). `GhFailure` carries a `kind`, a one-line `message`, a `hint` for a person, `detail`, `argv`, `exitCode` and the `CommandFailed` as `cause`. `GhFailureKind` is every `@osdlc/command-seam` kind plus `not-authenticated`, `network`, `not-found`, `rate-limited` and `unreadable`, read from `gh`'s stderr. `classifyGhFailure(commandFailed)` is exported. `@osdlc/result` is now a dependency.
