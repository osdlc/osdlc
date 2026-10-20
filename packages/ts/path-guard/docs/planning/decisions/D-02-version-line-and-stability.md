---
id: D-02
type: decision
state: accepted
created: 2026-10-19
---

# D-02: Version line and stability

## Decision

- The package is on the 0.x line.
- Every export is stable in 0.x. None is experimental, beta or alpha.
  `tests/stability.test.ts` fails when an export carries `@experimental`,
  `@beta` or `@alpha` in its TSDoc without a listing in the README's Stability
  section.
- A breaking change ships only in a new minor version, such as 0.3.0, and the
  CHANGELOG marks it.
- The twins share the major and minor version, and one may skip versions to
  catch up, by the
  [twin rule](../../../../../README.md#twin-libraries).

## Why

- The API has one release line and a parity fixture shared with the crate.
  Tiers would add a promise to track for no export that needs one.
- The API review planned for 0.3.0 may rename exports
  ([D-05](D-05-kept-names-for-0-2.md)). A `1.0` now would rule that out.

## Consequences

- An export that needs room to change is tagged in its TSDoc and listed in the
  README in the same pull request, or the stability test fails.
- A breaking change in either twin moves both to a new minor version.
