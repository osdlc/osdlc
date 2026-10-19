---
id: D-04
type: decision
state: accepted
created: 2026-10-18
---

# D-04: YAML contract version 2 only

## Decision

- A YAML contract must set `mcVersion: 2`. The loader rejects any other
  value.
- A version 1 file throws a `DeclarativeError` that names the command
  `markdown-contract migrate --write <file>`.
- `migrate` ships in the package. It rewrites a version 1 contract as version
  2, loads the result before it prints or writes it, and skips a file that is
  already version 2.
- `compileContractObject` has no `mcVersion` argument.

## Why

- Version 2 changed how typed table and list values work. Keeping both
  versions would mean two readers with different results for one file.
- A loader that guesses the version hides the difference. An error that names
  the migration command tells the user what to do.
- A test migrates every version 1 fixture and checks that it gives the same
  findings as its version 2 form, so the migration is safe to use.

## Consequences

- A change to the YAML format is a new `mcVersion`, with its own migration,
  and a breaking entry in the CHANGELOG.
