---
'@osdlc/typed-git': minor
---

Add `hashObject`, `mktree` and `updateRef` to `Git`, `AsyncGit` and the backend seam, so a commit can be written and a ref pointed at it without the index or a checkout.

- `hashObject(content, { write })` runs `git hash-object [-w] --stdin` and returns the blob sha. `content` goes on stdin as UTF-8, with no `.gitattributes` filters. Binary content is not supported yet.
- `mktree(entries)` runs `git mktree -z` and returns the tree sha. Each entry is `{ mode, type?, sha, path }`, and a non-recursive `lsTree` row fits. A mode git does not write, a type that does not match the mode, a sha that is not full, and a name that is empty, `.`, `..`, `.git`, has `/` or NUL, or appears twice throw a `TypeError` before git runs.
- `updateRef(ref, sha, { oldSha, reason })` runs `git update-ref [-m <reason>] <ref> <sha> <oldSha>`: it moves `ref` only while it holds `oldSha`, or with `oldSha: null` only while it does not exist. `oldSha` is required and must be a full sha. `ref` must be `HEAD` or start with `refs/`. A lost race throws.
- A new example, `examples/orphan-commit.ts`, keeps data on an orphan branch with all four plumbing verbs.
