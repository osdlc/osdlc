---
'@osdlc/typed-gh': patch
---

Document that a `Repository`'s `owner` and `name`, and a `PrSearchHit`'s `repository`, come back in GitHub's casing, not as the caller wrote them. The `Repository` and `PrSearchHit` type docs, the `repoList` and `repoView` doc comments and the README say so.
