---
id: D-15
type: decision
state: accepted
created: 2026-10-14
---

# D-15: API changes start from consumer code

## Decision

- An API addition or change is judged by the consumer code it leads to: is
  it useful, and does that code read well?
- Each one comes with an example in `examples/`. The example opens with the
  need it meets, shows the code a real tool would write, and drives that code
  with the `/testing` fakes.
- A change whose example reads worse than the code it replaces is reworked
  or dropped.

## Why

Tests of the mechanics show that the API works, not that it is pleasant to
use. Before `0.3.0`, the examples were rewritten this way. The rewrite found
fourteen places where consumer code read worse than it should. Eight led to
API changes, such as `stopProcess`, `fakeNeverExited` and `okExitCodes` on
`runJson`. The other six were left as they are. Most are listed under "Not
added" in [D-09](D-09-helpers.md).

## Consequences

- CONTRIBUTING asks for an example with each API change.
- New helpers still start experimental (see
  [D-02](D-02-version-line-and-stability.md)).
