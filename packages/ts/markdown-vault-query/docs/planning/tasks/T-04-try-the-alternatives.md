---
id: T-04
type: task
state: open
created: 2026-11-22
---

# T-04: Try the notes view on `@type32/obsidian-bases-parser`

## Goal

Test the answer in [D-02](../decisions/D-02-alternatives.md): that this package should continue.

## Today

No spike has been run. `@type32/obsidian-bases-parser` runs queries over a `BaseHost` the caller
supplies, so it needs one written over `VaultIndex`.

## Approach

- [ ] Write a `BaseHost` over `VaultIndex`.
- [ ] Run this package's fixture bases through both engines and compare the rows, groups and
      summaries.
- [ ] Record what differs, and whether the other package covers what the first consumer shows.

## Acceptance criteria

- [ ] D-02 is confirmed or superseded, with the comparison as its evidence.
