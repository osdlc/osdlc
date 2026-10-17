---
id: D-02
type: decision
state: accepted
created: 2026-10-17
---

# D-02: Version line and stability

## Decision

- The first published version is `1.0.0`.
- All nine exports are stable: `split`, `compose`, `splitLenient`, `Split`,
  `LenientSplit`, `NoteShape`, `SourceRange`, `OpenEol` and `CloseEol`. None
  is experimental, and the README's experimental list is empty.
- Version 0.1.0 was used during development and never published.

## Why

- The API has not changed since it was first written, two months before the
  first release, and over a dozen packages used it in that time without a
  breaking change.
- The scope is small and closed (see [D-01](D-01-name-and-scope.md)). The one
  growth risk, a field added to `NoteShape`, is settled by
  [D-03](D-03-noteshape-is-passed-back.md).

## Consequences

- Removing or renaming an export, or changing its shape so that callers
  break, needs `2.0.0` and is listed under "Breaking" in the CHANGELOG.
- A new experimental export must carry `@experimental` and be listed in the
  README. A test checks that the two agree.
