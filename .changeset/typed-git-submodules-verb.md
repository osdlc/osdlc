---
"@osdlc/typed-git": minor
---

`submodules()` is a new read verb: the submodules the index records, as `{ path, commit }` rows (`git ls-files --stage -z`, the mode `160000` gitlink entries). It reads the index, not `.gitmodules`, and says nothing of whether a submodule is checked out; its directory holds a `.git` when it is. A path in conflict appears once. `git.soft.submodules()` answers `[]` on failure.
