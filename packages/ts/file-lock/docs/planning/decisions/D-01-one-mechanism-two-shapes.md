---
id: D-01
type: decision
state: proposed
created: 2026-11-07
---

# D-01: One mechanism, two shapes

## Decision

- The package has one locking mechanism: claim by hard-linking a fully
  written temp file, take over a stale lock through an exclusive marker
  named from a hash of its content, and act on a lock (touch, rewrite,
  release) only while it holds the claim's token.
- It exposes it in two shapes: the held lock (`claimLock` and its token
  calls), whose caller chooses the staleness rule, and the short critical
  section (`withLock`), whose rule is the lock's age unless the caller passes
  `isStale`.
- The section is synchronous only. An async variant is added when a user
  needs one; until then, async work uses `claimLock` and `releaseLock`.
- There is no Rust twin. Rust has `File::lock` in the standard library since
  1.89. [D-03](D-03-a-rust-twin-for-shared-lock-files.md) changes this for
  lock files that a Rust process and a Node.js process both take.
- There are no OS advisory locks (`flock`, `fcntl`). Node has no built-in
  binding, and a native addon is a cost every consumer pays.

## Why

- The package replaces four hand-written locks in `sksizer/dev`: a held lock
  with token release and hash-marker takeover, an `O_EXCL` section lock that
  serialised takeover through a `.break` file, the `dev-ports` port leases
  (a holder-gone rule over the owner pid and its holder pids), and an ad hoc
  `'wx'` spin lock. The first one's mechanism was the strongest, so all four
  now share it.
- The `.break` file serialised reapers by age, so a reaper killed while
  holding it blocked takeovers until it went stale too, and a slow reaper
  could still judge a lock that had been replaced. The hash marker makes the
  removal conditional on the exact content that was judged stale.
- `proper-lockfile` judges staleness by age only, records no holder, and
  releases without checking ownership.

## Consequences

- A lock file is JSON with a `token` field. A lock written by another program
  without one reaches the rule with its fields, but nothing releases it.
- With its default rule, `withLock` cannot tell a slow holder from a dead
  one. Callers keep `staleMs` far above their longest section, or pass an
  `isStale` rule such as `holderGone`.
