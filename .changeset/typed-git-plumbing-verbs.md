---
"@osdlc/typed-git": minor
---

Add `hashObject`, `mktree` and `updateRef` to `Git`, `AsyncGit` and the backend seam, so a commit can be written and a ref pointed at it without the index or a checkout.

- `hashObject(content, { write })` runs `git hash-object [-w] --stdin` and returns the blob sha. `content` goes on stdin as UTF-8, with no `.gitattributes` filters. Binary content is not supported.
- `mktree(entries)` runs `git mktree -z` and returns the tree sha. Each entry is `{ mode, type?, sha, path }`, and a non-recursive `lsTree` row fits. A mode git does not write, a type that does not match the mode, a sha that is not full, a name that is empty, `.`, `..`, has `/` or NUL, or appears twice, a name git reads as `.git` (any letter case, also after a backslash, and the NTFS and HFS+ spellings such as `git~1`, `.git.` and `.git` with a zero-width character inside), and a `.gitmodules` (or `gitmod~1`) that is not a file throw a `TypeError` before git runs. git does not check a submodule (`160000`) entry's sha.
- `updateRef(ref, sha, { oldSha, reason })` runs `git update-ref [-m <reason>] <ref> <sha> <oldSha>`: it moves `ref` only while it holds `oldSha`, or with `oldSha: null` only while it does not exist. `oldSha` is required and must be a full sha. `ref` must be `HEAD` or start with `refs/`. A lost race throws.
- A new example, `examples/orphan-commit.ts`, keeps data on an orphan branch with all four plumbing verbs.
