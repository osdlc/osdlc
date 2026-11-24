# osdlc-file-lock

Cross-process exclusive file locks for Rust, on the same protocol as the npm
package [`@osdlc/file-lock`](https://github.com/osdlc/osdlc/tree/main/packages/ts/file-lock),
so a Rust process and a Node.js process can take turns holding one lock file.
For Rust processes only, it also has [an OS lock](#the-os-lock) that names its
holder and is let go when the holder dies.

Two processes that read a file, change it and write it back can lose each
other's change. A lock file next to the data stops that, but the simple
versions break under load or after a crash:

- An `O_EXCL` create followed by a write can leave an empty lock if the
  process dies between the two. Nobody can tell whose it is.
- "Delete the lock if it looks stale" lets a slow waiter delete the fresh lock
  that a faster waiter just took, so two holders run at once.
- "Delete the lock on exit" lets an owner whose lock was taken over delete the
  new holder's lock.

This crate closes each of those. A claim writes the whole content to a temp
file and hard-links it into place, so the lock never exists empty. A stale
lock is taken over through a marker that only one reaper can create, and it
is removed only if it still reads exactly as it did when it was judged stale.
Every claim carries a random token, and release, touch and rewrite act only
while the lock still holds that token.

When not to use it:

- Only Rust processes take the lock. Use [the OS lock](#the-os-lock) in this
  crate: the system lets it go when the process dies, with no staleness rule
  to choose.
- The lock must hold across machines, or the directory is on a network file
  system. `link()` and `rename()` are relied on to be atomic.

## Which lock

The crate has two locks, on two protocols. They do not exclude each other: a
path is locked with one of them, never with both.

|                    | The file-existence lock                       | The OS lock                               |
| ------------------ | --------------------------------------------- | ----------------------------------------- |
| API                | `claim_lock`, `with_lock`                     | `os_lock::OsLock`                         |
| The lock is        | the existence of the lock file                | an operating-system lock on the open file |
| Who takes it       | Rust and Node.js (`@osdlc/file-lock`)         | Rust processes that use this crate        |
| A holder that dies | keeps the lock until your rule calls it stale | loses the lock at once                    |
| Waiting            | `with_lock` waits, `claim_lock` does not      | never waits for the lock                  |
| Names its holder   | the content you write                         | a record with the pid, not on Windows     |

Use the file-existence lock when a Node.js process takes the lock too, or
for a short section that waits its turn. Use the OS lock when one Rust
process at a time owns something for as long as it runs, such as a daemon's
single-instance lock, and a dead owner must never block the next one.

## Install

```sh
cargo add osdlc-file-lock
```

The library is `osdlc_file_lock`. Rust 1.89 or later.

## Quick start

```rust
use std::time::Duration;

use osdlc_file_lock::{LockClaim, LockOptions, claim_lock, release_lock, untouched_for, with_lock};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;

    // A short section: no other process runs it on this file at the same time.
    let counter = dir.path().join("counter");
    std::fs::write(&counter, "0")?;
    with_lock(&dir.path().join("counter.lock"), &LockOptions::new(), || -> std::io::Result<()> {
        let n: u32 = std::fs::read_to_string(&counter)?.parse().unwrap_or(0);
        std::fs::write(&counter, (n + 1).to_string())
    })??;

    // A held lock: ours until we release it, or until it is untouched for a minute.
    let lease = dir.path().join("4000.lease");
    match claim_lock(&lease, &json!({ "pid": std::process::id() }), untouched_for(Duration::from_secs(60)))? {
        LockClaim::Claimed { token } => {
            // ... use the port ...
            release_lock(&lease, &token)?;
        }
        LockClaim::Held { holder } => println!("held by {:?}", holder.and_then(|h| h.content)),
    }
    Ok(())
}
```

## The held lock

`claim_lock(path, content, is_stale)` writes `content`, which must serialise
to a JSON object, with a fresh `token` field added. It returns
`LockClaim::Claimed { token }` when it took the lock. When the lock is held,
it reads it and asks `is_stale`:

- `false`: the holder is live. The result is `LockClaim::Held { holder:
  Some(..) }`, a `HeldLock` with the parsed `content` (`None` when the file is
  not lock content), the `modified` time and the `raw` text.
- `true`: the lock is taken over and the claim is tried again. When several
  claimants take over one stale lock at once, one of them wins and the others
  see it as the live holder.

`LockClaim::Held { holder: None }` means the lock could not be settled: it
kept changing, or it is stale and another claimant's takeover is still in
progress. Try again shortly. The directory must exist; any error other than
"already held" is returned.

With the token in hand, `touch_lock`, `update_lock` and `release_lock` act
only while the lock still holds it, and return whether they did anything. An
owner whose lock was taken over gets `false` and leaves the new holder's lock
alone. Any other error is returned.

`untouched_for(limit)` is the ready-made rule: stale once the lock was not
written or touched for longer than `limit`. `untouched_for_at` takes the clock.
Any `Fn(&HeldLock) -> bool` is a rule.

## The short section

`with_lock(path, &options, f)` runs `f` holding the lock and releases it when
`f` returns or panics. The lock records this process's `pid`. `LockOptions`
sets `stale` (10 s), `timeout` (30 s, zero tries once), `retry` (5 ms) and
`is_stale`, which replaces the age rule.

When the lock cannot be taken, `f` is not called and the error says why:
`LockError::Timeout` with the last holder seen, or `LockError::Io`. Waiting
blocks the thread.

## The OS lock

`os_lock::OsLock` is an exclusive lock on the open lock file
(`std::fs::File::try_lock`), with one line of JSON in the file that names the
holder. Taking it never waits for a holder. The system lets it go when the
holder dies, so a lock is never stale.

```rust
use osdlc_file_lock::os_lock::{OsLock, OsLockError, OsLockState};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("daemon.lock");

    // Take the lock without waiting. Its file now holds `{"pid":<this process>}`.
    let mut lock = match OsLock::acquire(&path) {
        Ok(lock) => lock,
        Err(OsLockError::Held { holder, .. }) => {
            return Err(format!("already running: pid {}", holder.pid).into());
        }
        Err(other) => return Err(other.into()),
    };
    // Replace the record while the lock is held. The pid stays in it.
    lock.record(&json!({ "started_at": "2026-11-24T10:00:00Z" }))?;

    // A process that only asks, such as a `stop` command, takes nothing.
    match OsLock::holder(&path)? {
        OsLockState::Held(holder) => println!("held by pid {}: {:?}", holder.pid, holder.record),
        OsLockState::HeldUnnamed => println!("held, and the file does not say by whom"),
        OsLockState::GuardBusy => println!("a start or a question is under way"),
        OsLockState::Free => println!("free"),
    }

    drop(lock); // or the death of the process
    Ok(())
}
```

- `OsLock::acquire(path)` takes the lock and writes `{"pid":N}`.
  `OsLock::acquire_with(path, &record)` writes your record at once. A record
  is anything that serialises to a JSON object. Its `pid` is set to this
  process's and written first. A record is at most `MAX_RECORD_LEN` (4096)
  bytes.
- `lock.record(&record)` replaces the record while the lock is held.
- `OsLock::holder(path)` asks who holds the lock. It keeps no lock and writes
  nothing, so a process that asks is never named as the holder and never
  makes a real taker lose.
- `OsLock::acquire_unnamed(path)` takes the lock and names nobody: the file is
  emptied. Use it for a lock that only has to exclude.
- Dropping the `OsLock` unlocks. The file stays, with the last record.

A taker that is refused gets an `OsLockError`, and the caller maps it:

| Error         | Meaning                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `Held`        | Held, and the file names the holder: `holder.pid`, `holder.record`                               |
| `HeldUnnamed` | Held, and the file does not name the holder                                                      |
| `GuardBusy`   | Not tried: another process is stopped in the middle of taking the lock or of asking              |
| `Io`          | A file could not be opened, locked or written, or the record is not a JSON object or is too long |

`OsLock::holder` answers with an `OsLockState`: `Free`, `Held(holder)`,
`HeldUnnamed` or `GuardBusy`.

What to know:

- **Two files.** The lock is `x.lock`. Beside it is `x.lock.guard`, an empty
  file with a second lock that orders the first write of the record: every
  taker and asker tries the lock and writes or reads the record while it
  holds the guard. So a holder's record is always its own, never an earlier
  holder's. Neither file is ever deleted, and you must not delete them while
  a process may use them: a new file at the path is a second lock.
- **A frozen process can hold the guard.** One stopped in the middle of
  `acquire` or `holder` makes every other call wait `GUARD_WAIT` (1 s) and
  report `GuardBusy`, until it goes on or dies. The lock is not tried then,
  so it may be free. `acquire` and `holder` block the thread for that long.
- **`pid` is checked, the rest is not.** A holder is named when the first line
  of the file is a JSON object with a `pid` from 1 that fits a `u32`. The
  other fields are read back unchecked.
- **The answer is about one moment.** The holder can be gone, and its pid
  given to another process, before you act on it.
- **Within one process** two takes of one path conflict, as between
  processes. Take the lock after any `fork`, not before.
- **Windows.** The lock also stops every other open of the file from reading
  it, so the record cannot be read while the lock is held. A holder is always
  reported as `HeldUnnamed`. The rest is the same.
- **Not the file-existence lock.** `claim_lock` and `with_lock` do not see an
  OS lock, and take over its file as a stale lock. The npm package has no OS
  lock.

## Compared with `@osdlc/file-lock`

The two follow one protocol, stated in
[`packages/conformance/file-lock/SPEC.md`](https://github.com/osdlc/osdlc/blob/main/packages/conformance/file-lock/SPEC.md)
and checked by the family's conformance suite. A lock written by either is
claimed, taken over and released by the other. The differences:

- The npm package also has `holderGone` and `pidAlive`. This crate does not
  yet: write the rule as a closure.
- `with_lock` returns `f`'s result even when the release after it fails, and
  leaves the lock for the staleness rule. `withLock` throws the release's
  error.
- The content is serialised with its keys in sorted order. The npm package
  keeps the caller's order. Neither depends on the other's layout.
- [The OS lock](#the-os-lock) is in this crate only. It is not part of the
  shared protocol, and the conformance suite does not cover it.

## Behaviour to know

- **Files beside the lock.** A claim writes `<path>.new-<uuid>` and removes it
  before returning. A release renames the lock to `<path>.release-<uuid>` for
  microseconds. A takeover creates `<path>.stale-<24 hex digits>` for
  microseconds. A process killed in between can leave any of them behind. A
  marker is an empty file of its own. One whose lock is still there blocks the
  takeover of that lock until its mtime is `MARKER_STALE` (10 s) old; then the
  next claimant removes it.
- **`update_lock` checks the token, then renames.** A takeover that lands
  between the two is overwritten.
- **The age rule guesses.** A live holder whose work outlasts the stale age
  loses the lock to the next waiter, and both then run. Keep the age far above
  the longest hold, or call `touch_lock`.
- **Hard links are required.** A file system without them fails the claim
  with the error `link()` gives. Windows is not tested.

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE),
at your option.
