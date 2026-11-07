# @osdlc/file-lock

Cross-process exclusive file locks for Node.js. No dependencies beyond Node's
own `fs` and `crypto`.

There are two shapes, built on one mechanism:

- **A held lock**, `claimLock`, for something a process owns for as long as
  it runs: a port lease, one loop per repository, one digest per session. The
  lock names its holder, and you choose when a holder counts as gone: its
  process exited, or it stopped touching the lock.
- **A short critical section**, `withLock`, for a re-read, check and rewrite
  of one file that two processes may do at once.

## Why

Two processes that read a file, change it and write it back can lose each
other's change. A lock file next to the data stops that, but the simple
versions break in ways that only show up under load or after a crash:

- An `O_EXCL` create followed by a write can leave an empty lock if the
  process dies between the two. Nobody can tell whose it is.
- "Delete the lock if it looks stale" lets a slow waiter delete the fresh lock
  that a faster waiter just took, so two holders run at once.
- "Delete the lock on exit" lets an owner whose lock was taken over delete the
  new holder's lock.

This package closes each of those. A claim writes the whole content to a temp
file and hard-links it into place, so the lock never exists empty. A stale lock
is taken over through a marker that only one reaper can create, and it is
removed only if it still reads exactly as it did when it was judged stale.
Every claim carries a random token, and release, touch and rewrite act only
while the lock still holds that token.

When not to use it:

- The lock must hold across machines, or the directory is on a network file
  system. `link()` and `rename()` are relied on to be atomic.
- You need a shared (reader) lock, or a lock the kernel drops when the process
  dies. Those are OS advisory locks (`flock`, `fcntl`), which Node has no
  built-in binding for.
- The section is async and long. `withLock` blocks the thread while it waits.
  Use `claimLock` and `releaseLock` around async work instead.

## Guide

The [guide](https://github.com/osdlc/osdlc/blob/main/packages/ts/file-lock/docs/guide/getting-started.md) walks through the problem with
timelines and examples: [getting started](https://github.com/osdlc/osdlc/blob/main/packages/ts/file-lock/docs/guide/getting-started.md),
[choosing a staleness rule](https://github.com/osdlc/osdlc/blob/main/packages/ts/file-lock/docs/guide/staleness.md) and
[how it works](https://github.com/osdlc/osdlc/blob/main/packages/ts/file-lock/docs/guide/how-it-works.md) on disk.

## Install

```sh
npm install @osdlc/file-lock
```

`pnpm add @osdlc/file-lock` and `yarn add @osdlc/file-lock` work too.

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { claimLock, holderGone, releaseLock, withLock } from '@osdlc/file-lock'

const dir = mkdtempSync(join(tmpdir(), 'file-lock-'))

// A short section: no other process runs it on this file at the same time.
const counter = join(dir, 'counter')
writeFileSync(counter, '0')
withLock(`${counter}.lock`, () => {
  writeFileSync(counter, String(Number(readFileSync(counter, 'utf8')) + 1))
})

// A held lock: ours until this process exits, or until we release it.
const lease = join(dir, '4000.lease')
const claim = claimLock(
  lease,
  { pid: process.pid },
  { isStale: holderGone<{ pid?: number }>((c) => [c.pid]) },
)
if (claim.ok) {
  // ... use the port ...
  releaseLock(lease, claim.token)
} else {
  console.log('held by', claim.holder?.content?.pid)
}
```

## The held lock

`claimLock(path, content, { isStale, markerStaleMs? })` writes `content` as
JSON, with a fresh `token` field added, and returns `{ ok: true, token }` when
it took the lock. When the lock is held, it reads it and asks `isStale`:

- `false`: the holder is live. The result is `{ ok: false, holder }`, where
  `holder` is a `HeldLock`: the parsed `content` (null when the file is not
  a JSON object), the `mtimeMs`, and the `raw` text.
- `true`: the lock is taken over and the claim is tried again. When several
  claimants take over one stale lock at once, one of them wins and the others
  see it as the live holder.

`{ ok: false, holder: null }` means the lock kept changing under every
attempt. The directory must exist; any error other than "already held" is
thrown.

The content is read back unchecked, cast to the type you name, so a rule should
check the type of each field it reads. A lock written by another program
without a `token` still reaches the rule with its fields, but no token
releases it.

With the token in hand:

- `touchLock(path, token)` refreshes the lock's mtime: a sign of life for an
  `untouchedFor` rule. Run it on a timer for long work.
- `updateLock(path, token, update)` replaces the content, keeping the token.
  `update` gets the current content and returns the new fields. The new file
  is renamed into place, so a reader never sees it half written.
- `releaseLock(path, token)` removes the lock.

Each acts only while the lock still holds `token`, and returns whether it did
anything. An owner whose lock was taken over gets `false` and leaves the new
holder's lock alone.

The types are `LockContent`, `HeldLock`, `LockClaim`, `ClaimOptions` and
`StaleRule`.

## Staleness rules

`isStale` is any function of a `HeldLock`. Two are ready-made:

- `holderGone(pids, { alive? })`: stale once no pid that `pids` reads from the
  content is alive. A lock whose content cannot be parsed is never judged
  gone by this rule. A recycled pid keeps the lock held; compare a start time
  in your own rule if that matters. `alive` defaults to `pidAlive(pid)`,
  which sends signal 0 and counts `EPERM` (another user's process) as alive.
  `HolderGoneOptions` is its options type.
- `untouchedFor(ms, now?)`: stale once the lock was not written or touched for
  more than `ms`. A live holder that outlasts `ms` without touching loses the
  lock, so keep `ms` far above the longest hold.

## The short section

`withLock(path, fn, { staleMs?, timeoutMs?, retryMs?, markerStaleMs? })` runs
`fn` holding the lock at `path` and releases it when `fn` returns or throws.
The lock records this process's `pid`, and its rule is
`untouchedFor(staleMs)`.

| option | default | meaning |
|---|---|---|
| `staleMs` | 10 s | a lock untouched for longer is a killed holder's |
| `timeoutMs` | 30 s | give up after waiting this long; 0 tries once |
| `retryMs` | 5 ms | pause between attempts |
| `markerStaleMs` | `MARKER_STALE_MS` | a takeover marker older than this is a dead reaper's |

When the lock stays held, it throws `LockTimeoutError`, whose message is
`timed out waiting for lock <path>`, with the `path` and the last `holder`
seen. `LockOptions` is the options type.

Waiting blocks the thread with `Atomics.wait`, so the section is for short,
synchronous work. `fn` must not be async: the lock would be released when it
returns its promise.

## Read-modify-write with `@osdlc/etag-write`

[`@osdlc/etag-write`](../etag-write/README.md) is not a lock. `writeCas` checks
the etag and then renames, so two processes writing at once can still both
pass the check, and one of them loses its update. `atomicWrite` alone never
checks. For a file that more than one process rewrites, take the lock first,
then read, change and write inside it. The atomic write still matters inside
the lock: a reader that takes no lock, or a crash mid-write, must never see a
torn file.

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { atomicWrite, etagOfFile, writeCas } from '@osdlc/etag-write'
import { withLock } from '@osdlc/file-lock'

const path = join(mkdtempSync(join(tmpdir(), 'file-lock-rmw-')), 'state.json')
atomicWrite(path, JSON.stringify({ runs: 0 }))

withLock(`${path}.lock`, () => {
  const seen = etagOfFile(path)
  const state = JSON.parse(readFileSync(path, 'utf8')) as { runs: number }
  // Other lock-takers wait here. writeCas still refuses the write if a
  // writer that does not take the lock (a person in an editor) changed it.
  writeCas(path, JSON.stringify({ runs: state.runs + 1 }), seen)
})
```

## Behaviour to know

- **Files beside the lock.** A claim writes `<path>.new-<uuid>` and removes it
  before returning. A takeover creates `<path>.stale-<24 hex digits>` for
  microseconds. A process killed in between can leave either behind. A stale
  marker blocks the takeover of that one lock content until it is
  `MARKER_STALE_MS` (10 s) old, judged by the inode's ctime; then the next
  claimant removes it.
- **The content is pretty-printed JSON** with a trailing newline, and the
  `token` field last.
- **`updateLock` checks the token, then renames.** A takeover that lands
  between the two is overwritten. A rule that never judges a live holder stale,
  such as `holderGone`, closes that window.
- **`withLock` decides staleness by age.** A live holder whose section
  outlasts `staleMs` loses the lock to the next waiter, and both then run.
- **Hard links are required.** A file system without them (some FUSE and
  network mounts) fails the claim with the error `link()` throws.

## How it compares

| | `@osdlc/file-lock` | `proper-lockfile` | OS advisory lock (`flock`) |
|---|---|---|---|
| Lock never exists empty or half written | yes | yes (a directory) | yes |
| Holder recorded in the lock | yes | no | no |
| Stale when the holder process is gone | yes (`holderGone`) | no | yes (the kernel drops it) |
| Stale when untouched for a while | yes (`untouchedFor`) | yes | no |
| Release refuses to delete another holder's lock | yes (token) | no | yes |
| Shared (reader) locks | no | no | yes |
| Works without a native addon in Node | yes | yes | no |
| Async API | no (`claimLock` is sync and fast) | yes | depends on the binding |

This comparison is from each package's documentation. Pick `proper-lockfile`
for an async, mtime-refreshed lock with no holder check. Pick an OS lock when a
native addon is acceptable and the kernel should release the lock on exit.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

The experimental exports:

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. Bun works too, through the compiled `dist/`.
The tests run on Linux and macOS. Windows is not tested: `pidAlive` relies on
signal 0, and the takeover relies on hard links and ctime.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
