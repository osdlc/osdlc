---
"@osdlc/pr-update": patch
---

pr-update does not use git's rerere. Every git command it runs in a target (its merges,
rebases, `--continue`s, aborts and commits among them) runs with `rerere.enabled=false`,
whatever the repository's own config says. Before, with rerere on in your config, a run
worktree of your checkout replayed your own recorded resolutions into a PR's merge, with no
check but `verify`, and added the PR's resolutions to your `rr-cache/`. Now a conflict always
goes to the resolvers and the repair, and pr-update makes no `rr-cache/` anywhere. The README
no longer lists rerere as the first resolver.
