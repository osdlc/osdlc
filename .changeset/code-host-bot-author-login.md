---
'@osdlc/code-host': patch
---

A bot pull request's `author.login` from the GitHub host (`listPrs`, `listPrDetails`, `getPr`) is now the bare login (`osdlc-release`), not gh's `app/osdlc-release`. It now matches the REST activity authors and the Forgejo host. This comes from `@osdlc/typed-gh`'s login normalization.
