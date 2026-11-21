---
'@osdlc/pr-update': minor
'@osdlc/typed-git': minor
---

`update` rebases with `--fork-point` when it does not know the parent's old head. A child of a PR rebased in an earlier run, without `--restack`, now leaves the parent's old commits behind when the clone's reflog still holds them, instead of replaying them onto their new versions. A fresh clone has no such reflog and rebases as before. `git.rebase(onto, { forkPoint: true })` in typed-git passes `--fork-point`.
