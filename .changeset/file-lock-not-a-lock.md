---
'@osdlc/file-lock': minor
---

A lock path holding something other than a regular file is now an error, not a lock to read or retry ([#755](https://github.com/osdlc/osdlc/issues/755)).

- The held lock is read only if it is a regular file: `lstat` checks before it is opened, then it is opened with `O_NOFOLLOW` and `O_NONBLOCK` and checked again with `fstat`. A symlink's target is no longer read or shown to the staleness rule, and a FIFO no longer blocks the claim.
- **Breaking:** `claimLock` and `withLock` throw the new `NotALockError` (with `path` and a `kind` of `symlink`, `directory` or `other`) where they used to follow a symlink, return `{ ok: false, holder: null }` on every call for a directory, or hang on a FIFO. `touchLock`, `updateLock` and `releaseLock` return `false` for such a path.
- **Breaking:** a claim retries only when the lock vanished (`ENOENT`). Other read errors, such as `EACCES`, are thrown instead of ending in `holder: null`.
- New `mode` option on `claimLock` and `withLock`: the lock file's permission bits, such as `0o600`, set exactly whatever the umask. It must include `0o400`, or it throws a `RangeError`. `updateLock` keeps the lock's mode.
- A non-file at a stale lock's takeover marker name throws `NotALockError` naming the marker, instead of blocking every takeover.
- `touchLock` sets the time through the descriptor it checked the token on, and claim files are created exclusively.
