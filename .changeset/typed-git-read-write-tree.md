---
"@osdlc/typed-git": minor
---

`readTree(rev)` and `writeTree()` on `Git` and `AsyncGit` (and the verbs) run `git read-tree <rev>` and `git write-tree`. With `env: { GIT_INDEX_FILE }` on the call, they seed and read a temporary index, so a commit can be built from a working tree without touching the repository's own index.
