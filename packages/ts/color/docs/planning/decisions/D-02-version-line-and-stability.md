---
id: D-02
type: decision
state: accepted
created: 2026-10-18
---

# D-02: Version line and stability

## Decision

- The first published version is `1.0.0`.
- All nine exports are stable: `Rgba`, `parseColor`, `formatHex`,
  `mixColors`, `withAlpha`, `fromPixel`, `compositeOver`, `relativeLuminance`
  and `contrastRatio`. None is experimental, and the README's experimental
  list is empty.
- Versions 0.1.0 to 0.1.2 were used during development and never published.

## Why

- The package was first prepared as `0.1.3`. The owner chose `1.0.0` instead,
  on the condition that the API changes in D-03 to D-06 landed first. They
  did. The changes are breaking, so the first release is the point to make
  them.
- The scope is small and closed (see [D-01](D-01-name-and-scope.md)).

## Consequences

- Removing or renaming an export, or changing its shape so that callers
  break, needs `2.0.0` and is listed under "Breaking" in the CHANGELOG.
- A new experimental export must carry `@experimental` and be listed in the
  README. A test checks that the two agree.
