---
'@osdlc/typed-git': minor
---

`submoduleUpdate()` on `Git` and `AsyncGit` (and the `submoduleUpdate` verb) runs `git submodule update --init --recursive`: it checks out every submodule, nested ones included, at the commit the checked-out tree pins, and clones those not yet initialised.
