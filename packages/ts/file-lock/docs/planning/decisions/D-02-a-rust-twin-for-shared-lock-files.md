---
id: D-02
type: decision
state: proposed
created: 2026-11-08
---

# D-02: A Rust twin for lock files both languages hold

## Decision

- The protocol has a Rust implementation, the crate `osdlc-file-lock` in
  `packages/rust/osdlc-file-lock`. The name `file-lock` is taken on
  crates.io.
- The two form the `file-lock` family in `packages/conformance/file-lock/`.
  Its `SPEC.md` states the on-disk protocol, and its suite, written by this
  package, pins it: the marker name, what counts as lock content, and what
  claim, takeover, release, touch, update and the short section do to the
  files.
- The crate ports the mechanism, `untouchedFor` and the short section. It has
  no `holderGone` or `pidAlive` yet: probing a pid needs `unsafe` or another
  dependency, and its first user judges by age. They come when a Rust user
  needs them.
- There are still no OS advisory locks.

## Why

D-01 said Rust needed no twin because it has `File::lock`. That holds for a
lock only Rust processes take. It does not hold for a lock file that a Rust
process and a Node.js process both take, because each must honour the
other's claims:

- `sksizer/dev`'s determined app takes a per-vault "anchor lock" from its
  Rust platform and from the TypeScript `@sksizer/vault-path`. Both arms
  hand-wrote one protocol: an `O_EXCL` create of a bare token, an age-based
  break serialised through a `.break` file, and release while the file holds
  the token. It is the last hand-written lock left in that repository.
- Moving only the TypeScript arm to this package would break exclusion: a
  Rust waiter and a TypeScript waiter would take over one stale lock by two
  different protocols, and both could win.
- An OS advisory lock for both arms needs a native addon in Node, which D-01
  rejected. `flock` and `fcntl` locks also do not exclude each other on every
  platform, so both arms would have to agree on one of them.

Hand-porting the protocol into the app again would make two copies drift
apart, as dev's locks had. A crate held to this package's suite keeps one
protocol.

## Consequences

- A change to the protocol is a change to both implementations and to
  `SPEC.md`, and the suite's regeneration shows it.
- The crate's version shares major.minor with this package. The crate starts
  at 0.1.0, the version this package's first release takes.
- `tests/interop.test.ts` runs Node.js and Rust processes against one lock
  when the crate's `interop-counter` example is built. CI does not build it,
  so the suite is what holds the two together there.
