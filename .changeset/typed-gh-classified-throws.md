---
"@osdlc/typed-gh": minor
---

**Breaking:** the plain door throws the classified failure. A failed `gh` (a mutation, `prDiff`, `rawChecked`, a query) now throws a `FailureError` whose `failure` is the `GhFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` only had command-seam's generic `exit` kind, so a signed-out `gh` during a write exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.

**Breaking:** the single-thing queries no longer treat every `Could not resolve to a …` as absence. `prView` answers `null` only for a missing pull request, `issueView` only for a missing issue and `repoView` only for a missing repository; a mistyped `--repo` is now a `not-found` failure, and a bare `HTTP 404` is a failure. The absence test reads stderr and stdout, as the classifier does.

An `HTTP 403` is now `not-authenticated` (SAML, a missing scope), the same as Forgejo's 401 and 403, unless the text says it is a rate limit, which stays `rate-limited`. The `try` and `soft` doors recognise a thrown failure by shape, so two installed copies of `@osdlc/command-seam` or `@osdlc/result` agree.
