---
"@osdlc/pr-update": minor
---

git's rerere is now on in `update --apply` in a managed clone, as the docs
said it was, for one run at a time. There, its merges and rebases, and the
commits that finish them, run with `rerere.enabled=true` and
`rerere.autoUpdate=false` for those commands only. A resolution a resolver or
a repair made is recorded, and the same conflict met later in the same run, at
a later rebase stop or in a sibling PR, is replayed instead of resolved again.
So sibling PRs that meet one conflict need one resolution, and a repair is
called once, not once per PR. A replayed path a resolver claims is still
rebuilt by it; any other is listed in the result's new `replayed` field, the
text report and the merge commit's message, and `verify` is its only check. A
path counts as replayed only where git says it used a recorded resolution; a
binary or `-merge` conflict, which rerere never tracks, is a plain conflict.

The clone's `rr-cache/` lives for one run. It is emptied under the clone's
lock before the run integrates anything, which also clears what a killed run
left; whenever a PR ends without being pushed (failed, conflict, a declined
push, a rejected repair, an abandoned rebase or a throw); and at the end of the
run. So any resolution replayed was made in this run by a PR that was pushed,
or by the PR in flight. While another live run has a worktree in the same
clone, rerere stays off for this run's PRs, so one run never replays another's
unpushed resolution. A rehearsal does not use rerere.

Everywhere else, the project root and a located checkout included, every git
command pr-update runs passes `rerere.enabled=false`: your own `rr-cache/` and
rerere config are never used, and no `rr-cache/` is made there. The new
`pr_update.rerere: false` turns it off in clones too.
