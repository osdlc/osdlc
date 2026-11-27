---
id: T-03
type: task
state: open
created: 2026-11-22
---

# T-03: Fold the package into the corpus model

## Goal

One TypeScript model of a folder of notes, shared with the Rust `markdown-corpus` crate, in place
of this package.

## Today

The package is published on its own ([D-04](../decisions/D-04-planned-corpus-model.md)). Its link
rule differs from the crate's, and the two share no conformance suite.

## Approach

1. Build the TypeScript corpus model beside the crate, with one conformance suite for both.
2. Decide the link rule that both follow, and record it.
3. Move this package's consumers over, then retire this package with a final release that points
   to the model.

## Acceptance criteria

- [ ] A shared conformance suite passes in TypeScript and Rust.
- [ ] This package's last release names its replacement.
