---
"@osdlc/typed-git": minor
---

`fetch` (and `fetchMany`) take `refmap`, which passes `--refmap=<refspec>`.
`refmap: ''` gives an empty map, so the fetch writes only the refspecs it is
given. Without it, git also applies the remote's configured fetch lines to the
refs it fetches, and a forced line into `refs/heads/` overwrites a local
branch. `prune: false` now passes `--no-prune`, which beats `fetch.prune` and
`remote.<name>.prune` in the repository's config; leaving `prune` out still
passes neither flag.

`parseRemoteRepo`, `parseRemoteUrl` and `readRemote` read an scp-style remote
with no user, such as `github-work:acme/widgets.git` or
`github.com:acme/widgets.git`, as git does; before they returned null, so
`readRemote` never resolved such an alias. With no user, a single letter
before the colon is a Windows drive (`C:/x`, `C:\x`), as git reads it on
Windows, and these read it so on every platform: such a path is not a remote,
and `isSshRemote` is now false for it.
