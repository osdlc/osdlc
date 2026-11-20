---
'@osdlc/typed-git': minor
---

`fetchMany(remotes, { prune, quiet, noWriteFetchHead, noTags, jobs })`: `git fetch --multiple`, every remote in one call, up to `jobs` at once. Git fetches each remote it can and exits non-zero naming any that failed.
