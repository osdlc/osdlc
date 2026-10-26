---
'@osdlc/typed-git': minor
---

New: `parseRemoteRepo(url)` reads a git remote into `{ host, owner, repo }` (type `RemoteRepo`), or null when it names no project. It reads a known host through `parseGitUrl` first (so shorthand reads as GitHub and a GitLab nested group stays whole in `owner`), then any other host through `parseRemoteUrl`, so a GitHub Enterprise or self-hosted Forgejo remote answers too. `host` is lower-cased and has no port. It is on the root entry, not `./client`.
The result gate, the `try` proxy, the start of `classifyGitFailure` and the leading-dash guard now use `@osdlc/command-seam`'s `runFailed`, `tryMethods`, `methodFacade`, `classifyFailed` and `notAnOption`. Nothing a caller sees changes: the same failures, the same `TypeError` and message for a positional that starts with `-`.
