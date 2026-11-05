---
id: D-03
type: decision
state: accepted
created: 2026-11-05
---

# D-03: The object and ref plumbing verbs

## Decision

`hashObject`, `mktree` and `updateRef` join `commitTree`, so a caller can
write a commit and point a ref at it without the index or a checkout
([#382](https://github.com/osdlc/osdlc/issues/382)).

- `updateRef(ref, sha, { oldSha, reason })` requires `oldSha`. A full sha
  means "only while `ref` is here". `null` means "only while `ref` does not
  exist", passed to git as an empty old value, which git reads the same way
  for SHA-1 and SHA-256 repositories. There is no unconditional form.
- `oldSha` must be a full sha. git resolves the old value as a revision, so
  `{ oldSha: "refs/heads/data" }` would name the ref's own current value and
  the check could never fail. Refusing it keeps the compare-and-swap real.
- `ref` must be `HEAD` or start with `refs/`. `update-ref` does not expand a
  short name: `update-ref main <sha>` writes a new top-level ref called
  `main`, which then makes `main` ambiguous with `refs/heads/main`.
- A lost race throws, as `deleteRef` does. It is not a declared absence:
  git exits 128 for it, the same code as every other `update-ref` failure.
- `hashObject(content, { write })` follows git: without `write` it only
  computes the sha. The content goes on stdin, which skips `.gitattributes`
  filters, so the blob holds exactly the UTF-8 bytes of the string.
- `mktree(entries)` takes `{ mode, type?, sha, path }`. `type` is optional
  because each mode has exactly one type. A non-recursive `lsTree` row has
  this shape, so `mktree(lsTree(rev))` writes the same tree back.
- `mktree` checks each entry before git runs and throws a `TypeError` for a
  mode other than the five git writes, a type that does not match the mode,
  a sha that is not a full sha, a name that is empty, `.`, `..` or `.git` in
  any letter case, a name with `/` or NUL, and a name given twice. git's
  `mktree` refuses only the `/` (NUL cannot reach it with `-z`). It writes
  the rest, and `git fsck --strict` reports each one. A duplicate or an
  empty name fails plain `git fsck` too.
- `hashObject` and `mktree` sit with `commitTree` under Queries in the
  README: each writes an object and moves no ref. `updateRef` sits beside
  `deleteRef` under Mutations.

## Why

- A compare-and-swap that the caller can leave out is one a caller will
  leave out. `deleteRef` already requires `expected` for the same reason.
  An optional unconditional mode can be added later without breaking
  anyone; making `oldSha` required later could not.
- The point of the orphan-commit sequence is a tool writing beside a person
  or another process. A ref update that overwrites a concurrent writer
  loses their commit, and nothing reports it.
- A lost race as a thrown failure keeps `updateRef` and `deleteRef` alike,
  and needs no English stderr match on the success path. A caller that
  retries uses `try.updateRef` and re-reads the ref with `resolveRef`.
- The `mktree` checks cost a loop over the entries. The trees they prevent
  fail `fsck`, so a host that checks pushed objects may reject the branch,
  and the damage is found far from the call that caused it.

## Consequences

- A caller that wants an unconditional ref move reads the ref first and
  passes what it read, or uses `raw`. Several refs in one transaction is
  `update-ref --stdin`, through `raw`.
- Binary content for `hashObject` waits for byte stdin
  ([#383](https://github.com/osdlc/osdlc/issues/383)). Widening `content` to
  `string | Uint8Array` then is not a breaking change.
- A lost race is a `GitFailure` of kind `exit`. A dedicated kind for it, for
  `updateRef` and `deleteRef` together, is possible later if callers need
  to switch on it.
- `deleteRef`'s `expected` is not yet checked to be a full sha, so a ref name
  passed there has the same always-matching problem. Changing that refuses
  input that works today, so it is left for its own change.
