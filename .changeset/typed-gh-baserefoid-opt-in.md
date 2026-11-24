---
"@osdlc/typed-gh": minor
---

**Breaking:** `PR_LIST_FIELDS` and `PR_VIEW_FIELDS` no longer request `baseRefOid`, so default `prList`, `prView`, `prFind` and `prViewSettled` calls work again on gh older than v2.63.0, the first release that knows the field (an older gh fails the whole call with "Unknown JSON field"). `PullRequest.baseRefOid` is `null` unless you ask for it: pass `fields: [...PR_VIEW_FIELDS, 'baseRefOid']`. `baseRefOid` stays a required key on `PullRequest`, as it has been since 0.19.0, so code that builds a `PullRequest` by hand (a test fixture, say) sets it, usually to `null`, as it does `headRepositoryOwner`.

`NO_COLOUR_ENV` is exported. `raw` and `rawChecked`, as verbs and as `Gh` and `AsyncGh` methods, keep the caller's colour settings, and their docs now say so; a caller that parses their output can run them with `withDefaults(runner, { env: NO_COLOUR_ENV })`. The colour change in 0.19.0 covers `runVerbAsync` too, as well as `runVerb`, `Gh` and `AsyncGh`.
