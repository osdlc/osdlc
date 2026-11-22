---
id: D-05
type: decision
state: accepted
created: 2026-11-22
---

# D-05: The checkout is read without following symlinks

## Decision

- When the flags read a file from the checkout, a path that is itself a symlink is not read.
  The read returns nothing, as it does for a missing file.
- The changed files are read from git at the head revision, not from the working tree, so this
  concerns only the other files the flags scan.

## Why

- A tracked symlink can point outside the repository. Following it would make `prep` parse a file
  the repository does not hold. Only counts and names reach the output, but a tool that reads a
  reviewer's checkout should read only that checkout.
- A symlink is rarely source a reviewer cares about, so skipping it loses little. A flag that
  depends on a file behind a link is missed, and `coverage` and the flag rules already say a flag
  is partial.

## Consequences

- `tests/prep-flags.test.ts` checks that a link outside the repository is not read and names no
  importer.
- Git lists a symlink to a directory as one entry, so files reached only through it are not
  listed and not seen as importers.
