---
id: D-03
type: decision
state: accepted
created: 2026-11-22
---

# D-03: Version line and stability

## Decision

- The first public release is `0.4.0`, on the 0.x line. The version `0.3.2` in the manifest is
  the last of the versions rebuilt from the development history. They were never published, and the
  CHANGELOG keeps their history.
- Every export is stable within a 0.x minor line. A breaking change bumps the minor version and
  its changelog entry starts with `Breaking:`. No export is experimental, and
  `tests/stability.test.ts` fails if one carries `@experimental` or the README's Stability section
  disagrees.
- The package does not go to 1.0 yet. See [D-04](D-04-planned-corpus-model.md).

## Why

- The first release carries one breaking change to the history ([D-02](D-02-api-for-the-first-release.md)),
  so it is a minor release.
- A package that a planned model may absorb is not ready to promise a stable 1.0 surface.

## Consequences

- Callers pin a minor range, such as `~0.4.0`, until the line settles.
