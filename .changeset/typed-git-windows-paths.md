---
"@osdlc/typed-git": minor
---

**Breaking:** on Windows, `topLevel()`, `gitCommonDir()`, `gitDir()`,
`mainCheckout()` and `worktrees()` paths now come back as `C:\x`, not git's
`C:/x`. Compare them with `node:path` paths, or `path.normalize` both sides,
instead of matching git's own output.

On Windows, `topLevel()`, `gitCommonDir()`, `gitDir()`, `mainCheckout()` and
each `worktrees()` path now come back in Node's form, `C:\x`, rather than the
`C:/x` git prints, so they compare equal to the paths `node:path` makes.
Elsewhere nothing changes. A Windows caller that compared these answers with
git's own output, or stored them, now has `C:\x` where it had `C:/x`;
`path.normalize` gives the same form for either.

`mktree` refuses the names git's fsck reads as `.gitmodules` behind a
backslash, such as `x\.gitmodules` and `x\gitmod~1`, when they are not a
file. On Windows it also refuses `.gitmodules\x` that is not a file, and
`.git` with an ignorable code point inside followed by `\x`, which Git for
Windows reads as `.gitmodules` and `.git`.
