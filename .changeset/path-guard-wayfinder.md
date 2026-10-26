---
'@osdlc/wayfinder': minor
---

`way clean` now compares real paths, through `@osdlc/path-guard` (a new runtime dependency), when it checks a store against the home directory, against another store, and when it prunes empty directories above a removed store. A store that holds the home directory only through a symbolic link above it (a store under `~/alias/...` where `alias` links to a directory that holds the home) is no longer removed. Two stores that overlap only through a symbolic link now need `--yes`, and an old pre-release path that reaches a current store through a link is no longer listed as old.
