---
'@osdlc/pr-update': minor
---

Behaviour change: `--remote` (and the `remote` input) is now the remote measured against, not only the one fetched. Drift, conflict prediction and the unpushed-work guard read `<remote>/<branch>`; before, they always read `origin/*`. With the default `origin` nothing changes. The code host is still chosen from `origin`.
A fork PR is no longer measured against a same-named branch of this remote, and is never taken as another PR's stack parent. A PR in a base/head cycle is now reported in `skipped` instead of disappearing. With `--repo`, each repository's PRs are updated in that repository's own checkout. A verify verb's untracked output left by one PR is no longer committed into the next PR's update.
