---
"@osdlc/typed-git": patch
---

On Windows, `topLevel()`, `gitCommonDir()`, `gitDir()`, `mainCheckout()` and
each `worktrees()` path now come back in Node's form, `C:\x`, rather than the
`C:/x` git prints, so they compare equal to the paths `node:path` makes.
Elsewhere nothing changes. On Windows, `mktree` also refuses a symbolic link
named `.gitmodules\x`, which Git for Windows reads as `.gitmodules`.
