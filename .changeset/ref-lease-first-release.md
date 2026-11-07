---
'@osdlc/ref-lease': patch
---

First public release. Compare-and-swap leases on git refs: create, replace and delete a ref at any
git remote only if it still holds the sha you read, with the payload as canonical JSON in the ref's
commit.

**Added**

- `casCreate`, `casReplace`, `casDelete`: the three compare-and-swap writes, through
  `git push --force-with-lease`.
- `fetchRef` and `fetchNamespace`: read one lease, or every lease under a prefix.
- `buildLeaseCommit`, with `DEFAULT_PAYLOAD_FILE`, `DEFAULT_IDENTITY` and `DETERMINISTIC_EPOCH`.
- `checkNamespaceConflict`: fail early when a literal ref blocks the namespace.
- `canonicalJson`: the payload encoding.
- `RefLeaseError` and its subclasses `CasFailed`, `RefNotFound`, `NamespaceConflict`, `GitFailed`
  and `PayloadUnreadable`, each with a stable `kind`.
- `fetchRef` takes a `decode` function and returns the payload as its type; without one the
  payload is `unknown`. It takes `payloadFile` to read another blob.
- `buildLeaseCommit` takes `payloadFile`, `files`, `identity` and `message`. The default identity
  is `ref-lease <ref-lease@local>`.
- Every operation takes a `git` client in place of `cwd`.
- The writes take `onMirrorSkip`, called when the local mirror of the ref was left alone.
- A `GitFailed` keeps `@osdlc/typed-git`'s classified failure as its `cause`, so a caller can tell
  an unreachable remote from an authentication failure.

**Changed**

- **Breaking:** every error takes one init object (`new CasFailed({ ref, expectedSha })`).
- **Breaking:** a git failure that is not a lost race or a missing ref is a `GitFailed` with `op`,
  `exitCode` and `stderr`; an unreadable payload is a `PayloadUnreadable`. Both were the base
  class before.
- **Breaking:** `checkNamespaceConflict` takes the namespace as a required argument, asks the
  authority on every call, and keeps no cache. `resetCache` is removed.
- **Breaking:** a write no longer prints to stderr when it leaves the local mirror alone; pass
  `onMirrorSkip`.
- **Breaking:** `canonicalJson` throws `TypeError` for a non-finite number, which it wrote as `null`.
- `fetchNamespace` ignores a trailing `/` on the prefix.
- `buildLeaseCommit` throws `TypeError` for a file name that is not one path segment.
- Failure details are read through the git client's failure shape. No behaviour change.
- Pushes go through `@osdlc/typed-git`'s `push`, which reports each ref's rejection as a value, and
  pushes and fetches run git in the C locale. A lost race is recognised whatever language the
  user's git speaks; before, a translated git turned it into a git failure.
