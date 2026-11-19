---
'@osdlc/typed-git': minor
---

`submoduleUpdate()` on `Git` and `AsyncGit` (and the `submoduleUpdate` verb) runs `git submodule update --init --recursive --checkout` with the `file` and `ext` transports refused (a pull request's `.gitmodules` is not trusted): it checks out every submodule, nested ones included, at the commit the checked-out tree pins, and clones those not yet initialised.
