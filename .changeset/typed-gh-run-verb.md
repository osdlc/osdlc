---
"@osdlc/typed-gh": minor
---

Added `runVerb` and `runVerbAsync`, with `RunVerbOptions` and `RunVerbAsyncOptions`. They run one verb through a runner the caller owns and apply what the verb carries: `env` (the target host, as `GH_HOST`, for `repoList` and `searchPrs`), `input` (the payload `createReview` sends on stdin), `timeoutMs` and the checked contract. Running `verb.parse(await run(verb.argv))` yourself dropped `env` and `input` without an error. `Gh` and `AsyncGh` now call them, so there is one copy of that logic.
