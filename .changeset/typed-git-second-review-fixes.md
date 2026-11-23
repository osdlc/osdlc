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
