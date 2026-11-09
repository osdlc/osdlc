---
id: D-02
type: decision
state: proposed
created: 2026-11-09
---

# D-02: Only a regular file is a lock

## Decision

- Every read of a lock, marker or release name opens the path with
  `O_NOFOLLOW` and `O_NONBLOCK`, then checks with `fstat` on that descriptor
  that it is a regular file before reading. The opening lives in one module,
  `src/lock-file.ts`.
- Anything else at the lock path is not a lock this package wrote. A claim,
  and so `withLock`, throws `NotALockError` with the path and a `kind` of
  `symlink`, `directory` or `other`. `touchLock`, `updateLock` and
  `releaseLock` answer `false` and leave it alone.
- A claim retries only when the lock vanished between the link and the read
  (`ENOENT`). Every other read error is thrown.
- `claimLock` and `withLock` take a `mode`, applied exactly with `fchmod`
  before the content is written. `updateLock` copies the lock's mode onto its
  replacement. Without `mode`, nothing changes.
- `touchLock` sets the time through the descriptor it read the token from.

## Why

- [osdlc/osdlc#755](https://github.com/osdlc/osdlc/issues/755) found that 0.1.0
  followed a symlink at the lock path into the staleness rule, kept answering
  `{ ok: false, holder: null }` for a directory, and offered no way to keep a
  lock `0600`. Opening a FIFO for reading also blocked for good.
- `{ ok: false, holder: null }` already means "a takeover is in progress,
  retry shortly". A directory that will never go away must not share that
  answer: a caller that retries would wait for ever without knowing why.
  Throwing fits the package's rule that anything other than "already held" is
  an error.
- The token calls often run in `finally` blocks and during shutdown. A
  symlink or directory cannot hold the caller's token, so `false`, "not your
  lock", is the true answer and does not mask the error that is unwinding.
- An umask can only narrow a mode, and a caller asking for `0o640` under
  `umask 077` would get `0o600`. Setting the bits with `fchmod` makes `mode`
  mean what it says on every machine.

## Consequences

- A claim that used to return `{ ok: false, holder: null }` for a directory,
  or hang on a FIFO, now throws. That changes behaviour, so the release is a
  minor one.
- Only the last path component is checked. The directories above the lock are
  trusted, as before.
- Windows has no `O_NOFOLLOW` in Node, so the open follows a symlink there.
  The package is not tested on Windows.
- A Rust twin held to the same protocol must refuse a non-file the same way.
