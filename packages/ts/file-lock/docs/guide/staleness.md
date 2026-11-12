---
title: Choosing a staleness rule
sidebar:
  order: 2
description: When a held lock counts as abandoned, the two ready-made rules, writing your own, and common recipes.
---

A process can die while it holds a lock: a crash, `kill -9`, a closed laptop.
Its lock file stays on disk, and something has to decide when it is safe to
take it over. That decision is the **staleness rule**: a function that looks
at the lock as found on disk and answers `true` (abandoned, take it over) or
`false` (someone still has it).

```ts
type StaleRule<F> = (held: HeldLock<F>) => boolean

interface HeldLock<F> {
  content: (F & { token?: string }) | null // parsed JSON; null if the file is not a JSON object
  mtimeMs: number // last written or touched
  raw: string // the exact text, used to make takeover safe
}
```

The rule is only asked when a claim finds the lock already held.

## `holderGone(pids)`: free once the owner process has exited

Use it when the lock lives as long as a process. The function you pass picks
the pids out of the content. The lock is stale once **none** of them is alive.

```ts
import { claimLock, holderGone } from '@osdlc/file-lock'

type Lease = { pid?: number; holders?: number[] }

// A port lease: the launcher and the dev server it started both hold it.
const leaseGone = holderGone<Lease>((lease) => [lease.pid, ...(lease.holders ?? [])])

claimLock<Lease>('/run/ports/4000.lease', { pid: process.pid, holders: [] }, { isStale: leaseGone })
```

| Lock content | Alive | Stale? |
|---|---|---|
| `{ "pid": 100 }` | 100 | no |
| `{ "pid": 100 }` | none | **yes** |
| `{ "pid": 100, "holders": [200] }` | 200 only | no: a holder is still running |
| `{ "pid": "x" }` | (not a number, so no pid) | **yes** |
| `not json` | n/a | no: an unreadable lock is never judged gone |

Things to know:

- Liveness is `pidAlive(pid)`: signal 0, with `EPERM` (another user's process)
  counting as alive. Pass `{ alive }` to use your own probe.
- A pid can be reused by an unrelated later process, which then keeps the lock
  held. Record the holder's start time and return `{ pid, startedAt }` from
  `pids`: such a holder is alive only while `sameProcess` says so.
- A pid only means something on one machine. Do not use this rule for a lock
  on a shared network drive.

## `untouchedFor(ms)`: free once nobody has touched it for a while

Use it when you cannot name a process, or the work is short. The lock is stale
once its mtime is more than `ms` old.

```ts
import { claimLock, releaseLock, touchLock, untouchedFor } from '@osdlc/file-lock'

const lock = 'session/digest.lock'
const claim = claimLock(lock, {}, { isStale: untouchedFor(10 * 60_000) })
if (claim.ok) {
  // A heartbeat keeps a long job's lock fresh: refresh at a tenth of the limit.
  const heartbeat = setInterval(() => touchLock(lock, claim.token), 60_000)
  heartbeat.unref()
  try {
    await digest()
  } finally {
    clearInterval(heartbeat)
    releaseLock(lock, claim.token)
  }
}
```

The risk is the opposite of `holderGone`'s: a holder that is alive but slow,
and does not touch the lock, loses it after `ms`. Then two processes run at
once. Keep `ms` far above the longest hold, or touch the lock as you go.

`withLock` uses `untouchedFor(staleMs)` unless you pass `isStale`. Its sections
are usually short, so the default 10 s is plenty. A long section needs a larger
`staleMs`, or `isStale: holderGone((h) => [h.pid])`, which waits for the holder
process to exit however long it runs.

## Your own rule

Any function of `HeldLock` works. Check field types yourself: the content is
whatever is on disk.

```ts
import { claimLock, processStartedAt, sameProcess, type HeldLock } from '@osdlc/file-lock'

type Owner = { pid?: number; started_at?: number | null }

// Stale when the pid is gone, or now belongs to a different process.
function ownerGone(held: HeldLock<Owner>): boolean {
  const owner = held.content
  if (owner === null) return false // not JSON: another program's file, leave it alone
  if (typeof owner.pid !== 'number') return true
  return !sameProcess(owner.pid, owner.started_at ?? Number.NaN)
}

claimLock<Owner>(lock, { pid: process.pid, started_at: processStartedAt(process.pid) }, { isStale: ownerGone })
```

`holderGone((o) => [{ pid: o.pid, startedAt: o.started_at }])` does the same.
`sameProcess` reads a start time it cannot parse (here `NaN`) as unknown, so a
live pid with no recorded start counts as the owner.

## Changing what a held lock records

`updateLock(path, token, update)` rewrites the content and keeps the token.
The port lease above uses it to add the dev server it spawned, so the lease
outlives the launcher if the launcher is killed:

```ts
updateLock<Lease>(leasePath, token, (lease) => ({
  ...lease,
  holders: [...(lease.holders ?? []), child.pid],
}))
```

The new content is renamed into place, so nobody reads half of it.
