---
title: Recipes
description: "Copyable functions: claim or take over an expired lease, renew, release with history, list every lease, update with retry."
sidebar:
  order: 3
---

Each recipe is a function you can copy. They all come from
[examples/recipes.test.ts](../../examples/recipes.test.ts), which tests them against a real git
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

Three steps. Create the ref if nobody has it. If somebody has it, read their lease. If it has
expired, replace it, but only if it is still the lease you read.

<!-- snippet: claim -->
```ts
type ClaimResult = { won: true; sha: string } | { won: false; holder: string }

/**
 * Take `ref` for `holder`, or take it over when the current lease has expired.
 * Returns who holds it afterwards.
 */
function claim(
  authority: string,
  ref: string,
  holder: string,
  opts: { cwd: string; now: Date; ttlMinutes: number },
): ClaimResult {
  const { cwd, now } = opts
  const payload: Lease = { holder, expiresAt: inMinutes(now, opts.ttlMinutes) }

  // 1. Nobody holds it: create the ref. Exactly one concurrent caller wins.
  try {
    const sha = buildLeaseCommit(payload, { cwd })
    casCreate(authority, ref, sha, { cwd })
    return { won: true, sha }
  } catch (e) {
    if (!(e instanceof CasFailed)) throw e
  }

  // 2. Somebody holds it. Read the lease and the sha it sits at.
  const current = fetchRef(authority, ref, { cwd, decode })
  if (new Date(current.payload.expiresAt) > now) {
    return { won: false, holder: current.payload.holder }
  }

  // 3. It has expired: replace it, but only if it is still the lease we read.
  //    If another worker took it over first, our replace fails and we report them.
  try {
    const sha = buildLeaseCommit(payload, { cwd, parentSha: current.sha })
    casReplace(authority, ref, current.sha, sha, { cwd })
    return { won: true, sha }
  } catch (e) {
    if (!(e instanceof CasFailed)) throw e
    return { won: false, holder: fetchRef(authority, ref, { cwd, decode }).payload.holder }
  }
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

Deleting the ref ends the lease. To keep its history, point an archive ref at the last commit
first.

<!-- snippet: release -->
```ts
/**
 * Give the lease up, keeping its history under an archive ref. The delete only
 * happens if the lease is still the one we hold.
 */
function release(authority: string, ref: string, sha: string, cwd: string): void {
  const archive = ref.replace(/^refs\/locks\//, 'refs/locks-archive/') + `/${sha.slice(0, 12)}`
  casCreate(authority, archive, sha, { cwd })
  casDelete(authority, ref, sha, { cwd })
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

For a change that should win eventually, re-read and try again on `CasFailed`. Each attempt sees
the latest lease, so the change is applied to what is really there.

<!-- snippet: update-with-retry -->
```ts
/**
 * Change a lease's payload with read-modify-write, retrying when another writer
 * gets in between. Each attempt re-reads, so `change` always sees the latest lease.
 */
function updateWithRetry(
  authority: string,
  ref: string,
  change: (lease: Lease) => Lease,
  opts: { cwd: string; attempts?: number },
): Lease {
  const { cwd, attempts = 5 } = opts
  for (let attempt = 1; ; attempt++) {
    const current = fetchRef(authority, ref, { cwd, decode })
    const next = change(current.payload)
    try {
      casReplace(
        authority,
        ref,
        current.sha,
        buildLeaseCommit(next, { cwd, parentSha: current.sha }),
        { cwd },
      )
      return next
    } catch (e) {
      if (!(e instanceof CasFailed) || attempt >= attempts) throw e
    }
  }
}
```

Bound the attempts. Under heavy contention on one lease, back off between attempts with some
jitter.

## Before the first write

If anything on the authority created a literal ref at the namespace path itself (`refs/locks`), git
cannot create refs under it, and every create fails with an unhelpful git error. Check once at
startup:

<!-- snippet: guard -->
```ts
checkNamespaceConflict(bare.dir, 'refs/locks', { cwd: worker.dir })
```
