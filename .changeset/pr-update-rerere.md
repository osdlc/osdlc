---
"@osdlc/pr-update": minor
---

git's rerere is now on in `update --apply` in a managed clone, as the docs
said it was. There, its merges and rebases, and the commits that finish them,
run with `rerere.enabled=true` and `rerere.autoUpdate=false` for those
commands only. A resolution a resolver or an accepted repair made is recorded,
and the same conflict in a later PR, in this run or a later one, is replayed
instead of resolved again. So sibling PRs that meet one conflict need one
resolution, and a repair is called once, not once per PR. A replayed path a
resolver claims is still rebuilt by it; any other is listed in the result's
new `replayed` field, the text report and the merge commit's message, and
`verify` is its only check. A path counts as replayed only where git says it
used a recorded resolution; a binary or `-merge` conflict, which rerere never
tracks, is a plain conflict.

A resolution is kept only when its PR is pushed: a rejected repair, a rebase
abandoned after it continued past a resolved stop, and a PR that conflicts or
is not pushed after its resolution was committed (`verify` rejected it, or the
person declined the push, say) leave no recorded resolution behind, nor its
preimage, so the next PR with that conflict is resolved again. A run killed
before its PR was pushed leaves a list of what it recorded in the clone, and
the next run there removes it before it integrates anything. A rehearsal does
not use rerere: it records nothing and replays nothing.

In the project root and in a located checkout, pr-update's merges, rebases and
commits always run with `rerere.enabled=false`: your own `rr-cache/` and
rerere config are never used, and no `rr-cache/` is made there. The new
`pr_update.rerere: false` turns it off in clones too.
