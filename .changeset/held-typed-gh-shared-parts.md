---
'@osdlc/typed-gh': minor
---

`parseOwnerRepo` is now `@osdlc/typed-git`'s `parseRemoteRepo` without the host. Behaviour change: a remote that `parseGitUrl` recognises but names no owner and repository for is read host-agnostically (`host/owner/repo`) instead of answering null; every other remote reads as before.
`settle`, `runCheckedGh`, `runCheckedGhAsync`, `gh.try`, `gh.soft`, `classifyGhFailure` and the leading-dash guard now use `@osdlc/command-seam`'s `runFailed`, `tryMethods`, `methodFacade`, `classifyFailed` and `notAnOption`, with no change a caller sees: the same failures, and the same `RangeError` and message for an argument that starts with `-`. `repoView` and every `--repo` verb build `[host/]owner/name` through one helper.
