---
"@osdlc/typed-git": minor
---

`diffText` takes `context` (`--unified=<n>`, default 3) and `findRenames` (`-M`, off by default, so `diff.renames` still applies); `diffAddedFile` takes `context`. A negative or non-integer `context` throws a `TypeError`.
