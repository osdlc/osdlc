# @osdlc/ref-lease

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
