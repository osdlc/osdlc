---
'@osdlc/pr-update': patch
---

`remoteSlug` now reads a remote through `@osdlc/typed-git`'s `parseRemoteRepo`, the one remote parser typed-gh and code-host share, instead of its own composition of `parseGitUrl` and `parseRemoteUrl`. It answers the same for every remote.
