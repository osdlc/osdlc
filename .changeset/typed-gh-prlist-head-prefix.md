---
'@osdlc/typed-gh': minor
---

`prList({ headPrefix })` lists every pull request whose head branch starts with a prefix such as `task/`. It sends a `head:<prefix>` search term, groups any `search` after it in parentheses so an `OR` there cannot escape the prefix, asks for `headRefName`, and filters the rows with `startsWith`. Callers no longer write that filter themselves. Because it goes through GitHub search, which returns at most 1000 results, a `limit` over 999 throws `RangeError`. It also throws when combined with `head`, and for an empty prefix or one holding whitespace, `"`, `(` or `)`.
