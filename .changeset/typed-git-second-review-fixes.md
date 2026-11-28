---
"@osdlc/typed-git": minor
---

`fetch` takes `refmap`, which passes `--refmap=<refspec>`. `fetchMany` does
not: git ignores `--refmap` with `--multiple`.
`refmap: ''` gives an empty map, so the fetch writes only the refspecs it is
given. Without it, git also applies the remote's configured fetch lines to the
refs it fetches, and a forced line into `refs/heads/` overwrites a local
branch.

**Breaking:** `prune: false` now passes `--no-prune`, which beats `fetch.prune`
and `remote.<name>.prune` in the repository's config, where it used to pass no
flag. A caller that passes `prune: opts.prune ?? false` stops pruning where the
config said to prune. Leave `prune` out to let git config decide: that still
passes neither flag.

`parseRemoteRepo`, `parseRemoteUrl` and `readRemote` read an scp-style remote
with no user, such as `github-work:acme/widgets.git` or
`github.com:acme/widgets.git`, as git does; before they returned null, so
`readRemote` never resolved such an alias. With no user, a single letter
before the colon is a Windows drive (`C:/x`, `C:\x`), as git reads it on
Windows, and these read it so on every platform: such a path is not a remote,
and `isSshRemote` is now false for it.
