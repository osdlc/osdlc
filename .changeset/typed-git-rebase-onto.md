---
"@osdlc/typed-git": minor
---

`rebase` takes an `upstream` option: `git.rebase(onto, { upstream })` runs `git rebase --onto <onto> <upstream>`, replaying only the commits after `upstream`. Restacking a branch whose base was rewritten needs it, so the base's old commits are left behind instead of replayed onto its new ones.
