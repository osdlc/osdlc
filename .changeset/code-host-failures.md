---
'@osdlc/code-host': minor
---

The port's queries return a `Result<T, CodeHostFailure>` instead of `null` for a failure. `listPrs`, `listPrDetails`, `getPr`, `listComments`, `reviewThreads` and `prForBranch` now say why they failed, with a `kind` (`not-installed`, `not-authenticated`, `network`, `not-found`, `rate-limited`, `timeout`, `http`, `unreadable`, `unsupported`, ...), a `message`, a `hint` and the `host`, the same for GitHub and Forgejo. `getPr` of a missing PR and `prForBranch` of a branch with no PR are still a success with `null`. `selectCodeHost` returns a `Result` and reports `no-remote`, `bad-remote` and `missing-token` as failures instead of throwing. Mutations still throw, now a `FailureError` carrying the same failure. New exports: `CodeHostFailure`, `CodeHostFailureKind`, `missingToolFailure` (the `not-installed` failure for a host's tool, worded as the adapters word it) and `badRemoteFailure`. `@osdlc/result` is a new dependency.
