---
id: T-03
type: task
state: open
created: 2026-11-22
---

# T-03: Compare with Obsidian releases after 1.13

## Goal

Know where the package differs from Obsidian's Bases behaviour after 1.13, and close the gaps worth
closing.

## Today

The package follows the Bases documentation for Obsidian 1.9 to 1.13
([D-05](../decisions/D-05-bases-behaviour.md)). `@type32/obsidian-bases-parser` follows 1.15.1 as
observed, so its behaviour is a source of cases.

## Approach

- [ ] List the functions, methods and view keys Obsidian added or changed after 1.13.
- [ ] Add the ones that matter, each with a test.
- [ ] Say in the README which Obsidian version the package follows.

## Acceptance criteria

- [ ] The README names the Obsidian version the package follows, and the differences are listed.
