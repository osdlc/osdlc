---
"@osdlc/typed-gh": minor
---

`PullRequest` has `baseRefOid` (the base commit sha, `null` when not requested), and `PR_LIST_FIELDS` and `PR_VIEW_FIELDS` request it. `runVerb`, `Gh` and `AsyncGh` now set `NO_COLOR=1` and remove `CLICOLOR_FORCE` and `GH_FORCE_TTY` on every verb except `raw` and `rawChecked`, so a forced-colour environment cannot break the JSON and diff they parse. A verb's own `env` (`GH_HOST`) is kept. New `GhVerb` field `leaveColour`, true for `raw` and `rawChecked`.
