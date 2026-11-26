---
"@osdlc/pr-update": minor
---

git's rerere is now on in `update --apply`, as the docs said it was. Its
merges and rebases, and the commits that finish them, run with
`rerere.enabled=true` and `rerere.autoUpdate=true` for those commands only;
your git config is not changed, and its `rerere.enabled=false` is overridden.
A resolution a resolver or an accepted repair made is recorded, and the same
conflict in a later PR, in this run or a later one, is replayed and staged
instead of resolved again. So sibling PRs that meet one conflict need one
resolution, and a repair is called once, not once per PR. A replayed
resolution still goes through `verify`.

A rejected repair, or a rebase abandoned after it continued past a resolved
stop, leaves no recorded resolution behind. A rehearsal does not use rerere:
it records nothing and replays nothing.

The resolutions are kept in the repository's `rr-cache/`: your own checkout
for the project root and a located checkout, the clone for a cloned target.
Once that folder exists, git uses rerere for your own merges there too, unless
your config says `rerere.enabled=false`. The new `pr_update.rerere: false`
turns it off for pr-update.
