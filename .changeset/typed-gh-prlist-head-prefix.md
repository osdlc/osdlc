---
'@osdlc/typed-gh': minor
---

`prList({ headPrefix })` lists every pull request whose head branch starts with a prefix such as `task/`. It sends a `head:<prefix>` search term ahead of any `search`, asks for `headRefName`, and filters the rows with `startsWith`, so callers no longer write that filter themselves. It cannot be combined with `head`, and an empty prefix or one with whitespace throws `RangeError`.
