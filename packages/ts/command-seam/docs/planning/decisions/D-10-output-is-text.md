---
id: D-10
type: decision
state: accepted
created: 2026-10-13
---

# D-10: Output is text

## Decision

- Captured output is decoded as UTF-8 text.
- The sync pipe path caps each stream at 256 MB and reports a kill at the cap
  as `reason: 'output'`.
- The async runner and the `bun test` capture path have no cap.
- A cap on every runner and a byte mode are deferred until a user needs them
  ([T-03](../tasks/T-03-bounded-and-binary-output.md)). The owner first chose to
  add both now, then deferred them. The deferral is the decision.

## Update (October 2026)

[#233](https://github.com/osdlc/osdlc/issues/233) brought the cap forward: the
capture runners take `maxOutputBytes`, a per-stream cap that also replaces the
sync default of 256 MB, and report a kill at it as `reason: 'output'`. The
async runner still has no default cap, and the `bun test` capture path still
has none. The byte mode stays deferred.

## Why

The users of this package run tools that print text. execa already offers
both a buffer limit and binary output for those who need them.

Binary output will be added when a user needs it. It may be built here, or by
wrapping execa or another library behind the runner interface.

## Consequences

- The README "Output is text" bullet states the encoding and the cap.
