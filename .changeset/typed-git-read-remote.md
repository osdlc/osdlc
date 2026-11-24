---
"@osdlc/typed-git": minor
---

`readRemote` reads a git remote into `{ host, owner, repo }` and resolves an SSH config alias first: `git@github-work:acme/widgets.git` reads as the host `ssh -G` gives for `github-work`. `sshAliasResolver(runner?)` builds the resolver it uses; it runs `ssh -G -- <alias>` from the home directory with a 5 s limit, caches each answer, and takes a runner so tests need no ssh. `isSshRemote` says whether a URL is an SSH remote. `sameRepo` says whether two `RepoCoordinate`s name one repository: owner and repo in any letter case, and the host when both carry one. All four are on the package entry, not on `@osdlc/typed-git/client`.
