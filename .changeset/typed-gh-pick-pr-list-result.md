---
'@osdlc/typed-gh': minor
---

`pickPrForBranch` takes the `ListResult` that `openPrsForBranch` and `prList` return, as well as plain rows, so `pickPrForBranch(verb.parse(result), branch)` works without a `.rows` unwrap. It also accepts a readonly array.
