---
'@osdlc/code-host': patch
---

The GitHub adapter reads `Gh` through `gh.soft`, so its port still answers `null` for a failed query after `@osdlc/typed-gh`'s queries began to throw.
