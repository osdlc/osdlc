# @osdlc/ref-lease

## 0.2.5

### Patch Changes

- Updated dependencies [e1a5941]
- Updated dependencies [cb8eafc]
  - @osdlc/command-seam@0.15.0
  - @osdlc/typed-git@0.14.0

## 0.2.4

### Patch Changes

- b8069c5: First public release. Compare-and-swap leases on git refs: create, replace and delete a ref at any
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
    and `PayloadUnreadable`, each with a stable `kind`. A `GitFailed` keeps the underlying git failure
    as its `cause`.
  - `fetchRef` takes a `decode` function and returns the payload as its type; without one the
    payload is `unknown`. It takes `payloadFile` to read another blob.
  - `buildLeaseCommit` takes `payloadFile`, `files`, `identity` and `message`. The default identity
    is `ref-lease <ref-lease@local>`.
  - Every operation takes `cwd` and `env`; the writes take `onMirrorSkip`.
  - Works with `@osdlc/typed-git` 0.12 or 0.13.
  
  **Changed from the unpublished 0.2.3**
  
  - The payload is the caller's: it was typed for one application.
  - Every error takes one init object (`new CasFailed({ ref, expectedSha })`). A git failure that is
    not a lost race or a missing ref is a `GitFailed`, an unreadable payload a `PayloadUnreadable`;
    both were the base class.
  - `checkNamespaceConflict` takes the namespace as an argument and asks the authority on every call;
    it kept a per-process cache.
  - A write reports a local mirror it left alone through `onMirrorSkip`; it printed to stderr.
  - Pushes go through `@osdlc/typed-git`'s `push`, which reports each ref's rejection as a value, and
    pushes and fetches run git in the C locale. A lost race is recognised whatever language the
    user's git speaks; a translated git used to turn it into a git failure.
  - A replace whose new sha the ref already holds, from an expected sha it does not hold, is a lost
    race (`CasFailed`). git answers such a push "up to date" before it checks the lease, and it read
    as a success.
  - A fetch that collides with another process updating the same local ref (a held lock file, or the
    ref moved between read and write) retries; other local `cannot lock ref` failures fail at once.
  - Refs and namespaces under `refs/heads`, `refs/tags` or `refs/remotes`, or outside `refs/`, and
    abbreviated shas throw a `TypeError` before git runs. A fetch there would overwrite or prune the
    caller's own refs.
  - `canonicalJson` encodes a value with `toJSON` (a `Date`) as `JSON.stringify` does, and throws a
    `TypeError` for a `Map`, a `Set`, a class instance or a value that contains itself, which it
    wrote as `{}`.
  - `fetchNamespace` ignores a trailing `/` on the prefix and lists only refs under it, never a ref at
    the prefix itself.
  - `buildLeaseCommit` throws `TypeError` for a file name that is not one path segment, and
    `GitFailed` when git cannot write the objects.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.3] - 2026-10-26 (unpublished)

#### Changed

- Failure details follow the git client's new failure shape. No behaviour change.

### [0.2.2] - 2026-10-18 (unpublished)

#### Fixed

- A declined hook, a bad URL or another push failure that is not a lost race no longer raises a
  lost compare-and-swap.
- A race lost at the authority after the client-side check passed (the ref moved, was deleted or
  was created first) is recognised as a lost compare-and-swap.

### [0.2.1] - 2026-10-17 (unpublished)

#### Changed

- git runs through a new typed git client. No behaviour change.

### [0.2.0] - 2026-10-16 (unpublished)

#### Added

- `buildLeaseCommit` takes `extraParentShas`, for a commit that joins two histories.

#### Changed

- Breaking: a successful write also moves the local mirror of the ref, guarded so it never rewinds
  a newer local value, and reports to stderr when it leaves the mirror alone.
- Breaking: `canonicalJson` moved to its own module.
- A fetch that collides with another local process on a ref lock retries with a short backoff.

### [0.1.6] - 2026-10-14 (unpublished)

#### Fixed

- An error message falls back to the spawn error when git printed nothing to stderr.

### [0.1.5] - 2026-09-28 (unpublished)

#### Changed

- The guard's options type is no longer exported.

### [0.1.4] - 2026-09-01 (unpublished)

#### Changed

- git runs through a typed git client. The error for a commit with no payload file is reworded.

### [0.1.3] - 2026-08-26 (unpublished)

#### Fixed

- The fetches no longer write `FETCH_HEAD`.

### [0.1.2] - 2026-07-19 (unpublished)

#### Changed

- Internal changes only.

### [0.1.1] - 2026-07-19 (unpublished)

#### Changed

- git runs through an injectable command runner. No behaviour change.

### [0.1.0] - 2026-05-31 (unpublished)

#### Added

- The five ref operations, the lease commit builder, `canonicalJson`, the namespace guard and the
  error classes.
