---
title: How it works
sidebar:
  order: 3
description: What happens on disk for a claim, a takeover and a release, and the races each step closes.
---

A lock is a file. "The file exists" means "the lock is held". Every step
below closes a race that a simpler lock file gets wrong.

## Claim: write the whole lock first, then link it into place

```text
1. create x.lock.new-<token>     exclusively, set to `mode` if given, then the
                                 full content, token included
2. link   x.lock.new-<token> → x.lock
      ok      → we hold the lock
      EEXIST  → something is there: check it is a regular file, open it
                without following a symlink or blocking, read it and ask
                the staleness rule
3. remove x.lock.new-<token>
```

`link()` fails if the target exists, just as `open(O_EXCL)` does, so of two
processes that link at the same moment exactly one wins.

**Why not `open(O_EXCL)` and then write?** A process killed between the two
leaves an empty lock. Nobody can tell whose it is, and every waiter has to
guess by its age. With link, the lock appears with its content already in it.

## What can be at the lock path

When the link fails, step 2 checks with `lstat` that what is there is a
regular file, so a symlink is never followed and a FIFO or device is never
opened. It then opens the file with `O_NOFOLLOW` and `O_NONBLOCK` and checks
the descriptor with `fstat`, in case the path was replaced between the two.
Only then is a byte read. If the open fails, the path is looked at again
rather than judged by the error code, which differs between systems.

| At `x.lock` | What the claim does |
|---|---|
| a lock file | reads it and asks the staleness rule |
| nothing (released since the link failed) | tries the link again |
| a symlink | throws `NotALockError`, kind `symlink`; the target is never opened |
| a directory, such as one an older mkdir-based lock left | throws `NotALockError`, kind `directory` |
| a FIFO, socket or device | throws `NotALockError`, kind `other`; it is never opened, and opening a FIFO to read would wait for a writer |
| a file it cannot read | throws the error, such as `EACCES` |

Only "nothing there" means try again. Anything else that is not a lock file is
an error the caller can see, rather than a claim that keeps coming back
`{ ok: false, holder: null }` as if a takeover were in progress. The same goes
for a non-file at a stale lock's marker name (below), which would otherwise
block every takeover of that lock.

## Takeover: only one reaper, and only the lock that was judged

When the rule says a lock is stale, the claimant must remove it and claim
again. The naive version, "if stale, delete it", goes wrong when two
waiters find the same dead lock:

```text
waiter A                         waiter B                     x.lock
reads dead lock D, stale                                      D
                                 reads D, stale               D
deletes D                                                     (none)
claims → holds L                                              L
                                 deletes x.lock  ← this is L, A's live lock!
                                 claims → holds M             M
A and B both believe they hold the lock.
```

The package removes a stale lock in four steps:

```text
1. re-read x.lock; if it is no longer exactly D, stop (someone replaced it)
2. link x.lock → x.lock.stale-<sha256(D)>     exclusive: one reaper wins
3. if both files still read exactly D, remove x.lock
4. remove the marker, then claim again
```

In the race above, B either loses the marker (step 2), or finds that
`x.lock` no longer reads `D` (steps 1 and 3). Step 3 also checks that the
lock's mtime has not changed since it was judged, so a holder that touches its
lock at the last moment keeps it. Either way it leaves `L` alone
and goes back to claiming. It then sees A as the live holder.

The marker is named from a **hash** of the content, because the content can be
longer than a file name may be (255 bytes on most file systems).

**A reaper that dies holding the marker** would block every later takeover of
that lock. A live reaper holds its marker for microseconds, so a marker older
than `MARKER_STALE_MS` (10 s) is a dead one's and the next claimant removes
it. Its age comes from the inode's ctime: the marker is a hard link of the
lock, so its mtime is the lock's, but creating the link sets the ctime.

## Release, touch, update: only with your token

```text
releaseLock(path, token):   read x.lock; if its token is ours, rename it to
                            x.lock.release-<uuid>, check the token again there,
                            and remove it (the file removed is the file checked)
touchLock(path, token):     open x.lock; if its token is ours, refresh the mtime
                            through that same descriptor
updateLock(path, token, f): read x.lock; if its token is ours, write f(content)
                            to a temp file with x.lock's mode and rename it
                            over x.lock
```

Each reads the lock the same way a claim does. Something that is not a lock
file holds no token, so each answers `false` and leaves it alone.

Without the token check, this happens:

```text
A holds the lock, then stalls past staleMs
B takes it over                                    x.lock = B's
A wakes, finishes, "releases" → deletes x.lock     ← B's lock is gone
C claims while B is still working                  two holders
```

With it, A's release finds B's token, does nothing and returns `false`.

## File mode

A claim with `mode` creates its temp file owner-only and sets it to exactly
`mode` before writing the content, so the umask does not apply and the content
is never more readable than asked. Linking and renaming keep the inode, so the
lock, its takeover marker and its release name all share that mode. The only
new inode in a lock's life is the one `updateLock` writes, and it copies the
lock's mode onto it before the rename.

## The short section

`withLock(path, fn, options)` is a loop around the same calls. It writes its
claim file once and only retries the link:

```text
write x.lock.new-<token> once
until timeoutMs has passed:
  try the claim (link, or judge the holder with isStale, by default untouchedFor(staleMs))
  ok    → run fn, then releaseLock (also when fn throws), return fn's result
          (a promise from fn is refused with a TypeError)
  held  → sleep retryMs (Atomics.wait, which blocks the thread without spinning)
then throw LockTimeoutError(path, last holder seen)
```

## Files you may see

| File | Lifetime | Left behind by a crash? |
|---|---|---|
| `x.lock` | while held | yes, and taken over once the rule says stale |
| `x.lock.new-<uuid>` | during a claim or an update | rarely; harmless, safe to delete |
| `x.lock.stale-<24 hex>` | microseconds, during a takeover | rarely; cleared after 10 s while its lock is still there. One left after its lock was removed blocks nothing and is safe to delete |
| `x.lock.release-<uuid>` | microseconds, during a release | rarely; harmless, safe to delete |

## Limits

- **One machine.** `link()` and `rename()` must be atomic, and a pid means
  something only on one machine. Network file systems are not supported.
- **Hard links required.** On a file system without them, a claim throws the
  error `link()` gives.
- **No shared (reader) locks**, and the kernel does not release the lock when a
  process dies: the staleness rule does that.
- **Windows is not tested.** `pidAlive` relies on signal 0, and takeover on
  hard links and ctime. Node has no `O_NOFOLLOW` there, so a symlink swapped in
  between the `lstat` check and the open is followed.
- **Only the last component is checked.** A symlink at the lock path is
  refused, but the directories above it are trusted.
