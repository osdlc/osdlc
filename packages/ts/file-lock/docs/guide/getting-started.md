---
title: Getting started
sidebar:
  order: 1
description: The lost-update problem, the two ways to take a lock, and a first call of each.
---

## The problem a lock solves

Two processes that read a file, change it and write it back can lose each
other's change. Here two runs of the same tool each add one to a counter:

```text
process A                 process B                 counter.json
read  {"n": 4}                                      {"n": 4}
                          read  {"n": 4}            {"n": 4}
write {"n": 5}                                      {"n": 5}
                          write {"n": 5}            {"n": 5}   ← A's +1 is gone
```

Nothing failed and nothing was logged, but the counter is wrong. An atomic
write (temp file then rename) does not help: each write is whole, and the
second still replaces the first. A compare-and-swap write (`writeCas` from
`@osdlc/etag-write`) narrows the window but does not close it, because its
check and its rename are two steps.

A lock closes it: only one process at a time runs the read, change and write.

```text
process A                 process B                 counter.json
take lock
read  {"n": 4}            take lock → waits         {"n": 4}
write {"n": 5}                                      {"n": 5}
release                   ...gets it
                          read  {"n": 5}
                          write {"n": 6}            {"n": 6}   ✓
                          release
```

## Two shapes

The package gives you the lock in two shapes. Pick by how long you hold it.

| You want to... | Use | Held for | Stale when |
|---|---|---|---|
| Update one file safely | `withLock(path, fn)` | one synchronous function | untouched for `staleMs` (default 10 s), unless you pass `isStale` |
| Own something while your process runs (a port, a job, a session) | `claimLock(path, content, { isStale })` | until you call `releaseLock` | the rule you pass, such as `holderGone` or `untouchedFor` |

## A first `withLock`

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { withLock } from '@osdlc/file-lock'

const path = 'counter.json'

withLock(`${path}.lock`, () => {
  const { n } = JSON.parse(readFileSync(path, 'utf8')) as { n: number }
  writeFileSync(path, JSON.stringify({ n: n + 1 }))
})
```

- The lock is a file next to the data, `counter.json.lock`. It exists only
  while the function runs.
- If another process holds it, this call waits (up to `timeoutMs`, 30 s by
  default) and then throws `LockTimeoutError`.
- If the holder was killed and left the lock behind, the lock is taken over
  once it is older than `staleMs`.

## A first `claimLock`

```ts
import { claimLock, holderGone, releaseLock } from '@osdlc/file-lock'

type Owner = { pid?: number; job?: string }

const claim = claimLock<Owner>(
  '/tmp/nightly-report.lock',
  { pid: process.pid, job: 'nightly-report' },
  // Free again once the process that took it has exited, however it exited.
  { isStale: holderGone<Owner>((owner) => [owner.pid]) },
)

if (!claim.ok) {
  console.error(`already running as pid ${claim.holder?.content?.pid}`)
  process.exit(1)
}

try {
  // ... the long job ...
} finally {
  releaseLock('/tmp/nightly-report.lock', claim.token)
}
```

- `claimLock` never waits. It answers at once: `{ ok: true, token }`, or
  `{ ok: false, holder }` naming who has it.
- The lock file holds what you passed, plus a random `token`:

  ```json
  {
    "pid": 81234,
    "job": "nightly-report",
    "token": "4f1c2a9e-7c3b-4d5e-9a8b-2f6e1d0c3b7a"
  }
  ```

- Keep the token. `releaseLock`, `touchLock` and `updateLock` act only while
  the lock still holds it, so a process whose lock was taken over can never
  delete the new owner's.

Next: [Choosing a staleness rule](./staleness.md), then
[How it works](./how-it-works.md) for what happens on disk.
