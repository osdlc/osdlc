---
title: Recipes
description: "Copyable functions: claim or take over an expired lease, renew, release with history, list every lease, update with retry."
sidebar:
  order: 3
---

`claim`, `updateWithRetry` and `release` are exported by the library. They take every payload rule
as a callback, so the payload stays yours. The other recipes are functions you can copy. They all
come from [examples/recipes.test.ts](../../examples/recipes.test.ts), which tests them against a real git
repository.

The library does not know what is in your lease. These recipes store a holder and an expiry time:

<!-- snippet: lease-type -->
```ts
/** What this application stores in each lease. The library never reads it. */
interface Lease {
  holder: string
  /** ISO 8601. After this time anyone may take the lease over. */
  expiresAt: string
}

function decode(value: unknown): Lease {
  const v = value as Partial<Lease>
  if (typeof v.holder !== 'string' || typeof v.expiresAt !== 'string') {
    throw new TypeError('not a lease')
  }
  return { holder: v.holder, expiresAt: v.expiresAt }
}

const inMinutes = (now: Date, minutes: number) =>
  new Date(now.getTime() + minutes * 60_000).toISOString()
```

## Claim, or take over an expired lease

`claim` does three steps. It creates the ref if nobody has it. If somebody has it, it reads their
lease. If `isLive` says it is no longer live (or `isMine` says it is yours), it replaces it, but
only if it is still the lease it read. Otherwise it returns `{ won: false, payload }`, the lease
that is held. The lease can change between any two of these calls, so it looks again up to
`attempts` times (default 5) and then throws the last `CasFailed`. A payload it cannot read counts
as not live. `build` gets the lease being replaced, or `null` for a create.

<!-- snippet: claim -->
```ts
/**
 * Take `ref` for `holder`, or take it over when the current lease has expired.
 * The library does the create, the read and the guarded replace, and looks again
 * when another caller moves first. The meaning of "expired" is the callback's.
 */
function takeLease(
  authority: string,
  ref: string,
  holder: string,
  opts: { cwd: string; now: Date; ttlMinutes: number },
) {
  return claim<Lease>(authority, ref, {
    cwd: opts.cwd,
    decode,
    build: () => ({ holder, expiresAt: inMinutes(opts.now, opts.ttlMinutes) }),
    isLive: (lease) => new Date(lease.expiresAt) > opts.now,
    isMine: (lease) => lease.holder === holder, // a leftover of our own run
  })
}
```

Two workers taking over the same expired lease at once both read the same `current.sha`. One
replace lands; the other fails with `CasFailed` and reports the winner.

Clocks: the expiry check uses the caller's clock. Leave a margin larger than the clock skew
between your workers, or have a lease expire only after a grace period.

## Renew

The holder pushes the expiry out before it passes. Keep the sha each write returns: the next
renewal replaces from it.

<!-- snippet: renew -->
```ts
/**
 * Push the expiry out. `sha` is the lease commit you last wrote. If the replace
 * fails, someone else holds the lease now: stop the work it protects.
 */
function renew(
  authority: string,
  ref: string,
  sha: string,
  lease: Lease,
  opts: { cwd: string; now: Date; ttlMinutes: number },
): string {
  const next = buildLeaseCommit(
    { ...lease, expiresAt: inMinutes(opts.now, opts.ttlMinutes) },
    { cwd: opts.cwd, parentSha: sha },
  )
  casReplace(authority, ref, sha, next, { cwd: opts.cwd }) // throws CasFailed if we lost it
  return next
}
```

If the renewal throws `CasFailed`, the lease is no longer yours (it expired and someone took it
over). Stop the work it protects.

## Release, keeping the history

`release(authority, ref, sha, { cwd })` deletes the ref only if it still points at the `sha` you
wrote, and returns whether it did. A lease that was taken over, or is already gone, gives `false`:

<!-- snippet: release-pinned -->
```ts
/** Give the lease up if `sha` is still the one we hold. False means it is no longer ours. */
const giveUp = (authority: string, ref: string, sha: string, cwd: string): boolean =>
  release(authority, ref, sha, { cwd })
```

To keep the history too, delete the ref only if it is still yours. An archive ref, pushed first, keeps
its history, so a crash between the two pushes loses nothing. If the delete finds the lease is no
longer yours, the archive is taken back.

<!-- snippet: release -->
```ts
/**
 * Give the lease up, only if it is still the one we hold, keeping its history
 * under an archive ref. The archive goes first, so a crash between the two
 * pushes leaves the history kept; if the delete then finds the lease is no
 * longer ours, the archive is taken back.
 */
function releaseKeepingHistory(authority: string, ref: string, sha: string, cwd: string): void {
  const archive = `refs/lease-archive/${ref.replace(/^refs\//, '')}/${sha.slice(0, 12)}`
  casCreate(authority, archive, sha, { cwd })
  try {
    casDelete(authority, ref, sha, { cwd }) // only if it is still ours
  } catch (e) {
    casDelete(authority, archive, sha, { cwd }) // we released nothing: drop the archive
    throw e
  }
}
```

## List every lease

`fetchNamespace` gives every ref under a prefix and its sha; `fetchRef` reads each one. A lease can
be released between the two calls, so a `RefNotFound` there is not an error.

<!-- snippet: list -->
```ts
/** Every live lease under `prefix`, with its holder. */
function listLeases(authority: string, prefix: string, cwd: string): Map<string, Lease> {
  const leases = new Map<string, Lease>()
  for (const ref of Object.keys(fetchNamespace(authority, prefix, { cwd }))) {
    try {
      leases.set(ref, fetchRef(authority, ref, { cwd, decode }).payload)
    } catch (e) {
      if (!(e instanceof RefNotFound)) throw e // released between the two calls
    }
  }
  return leases
}
```

## Update with retry

`updateWithRetry` is for a change that should win eventually. It re-reads and tries again on
`CasFailed`, so `change` always sees the latest payload. `change` gets `null` when the ref is
absent (the write is a create). Returning `null` deletes the ref. It returns
`{ kind: 'written', sha, payload }`, `{ kind: 'deleted' }` or `{ kind: 'unchanged' }`.

<!-- snippet: update-with-retry -->
```ts
/**
 * Change a lease's payload with read-modify-write. The library re-reads and tries
 * again when another writer gets in between, so `change` always sees the latest lease.
 */
function updateLease(
  authority: string,
  ref: string,
  change: (lease: Lease) => Lease,
  opts: { cwd: string; attempts?: number },
): Lease {
  const out = updateWithRetry<Lease>(
    authority,
    ref,
    (current) => {
      if (current === null) throw new Error(`no lease at ${ref}`)
      return change(current.payload)
    },
    { cwd: opts.cwd, decode, attempts: opts.attempts ?? 5 },
  )
  if (out.kind !== 'written') throw new Error('unreachable: change never returns null')
  return out.payload
}
```

The attempts are bounded (`attempts`, default 5) and the last `CasFailed` is thrown. Under heavy
contention on one lease, pass `backoffMs(attempt)` to wait between attempts, with some jitter.

## Before the first write

If anything on the authority created a literal ref at the namespace path itself (`refs/locks`), git
cannot create refs under it, and every create fails with an unhelpful git error. Check once at
startup:

<!-- snippet: guard -->
```ts
checkNamespaceConflict(bare.dir, 'refs/locks', { cwd: worker.dir })
```
