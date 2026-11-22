---
id: D-03
type: decision
state: accepted
created: 2026-11-22
---

# D-03: The version line

## Decision

- The first public release is `0.3.0`, on the 0.x line.
- The version comes from replaying the development history under semver: one bump per merged
  change, a minor bump for each breaking change. Those earlier versions were never published,
  and the CHANGELOG keeps their history. The manifest holds `0.2.7`, and the first release's
  changeset is a minor bump.
- A breaking change to a stable export ships only in a new 0.x minor release, with a CHANGELOG
  entry that starts with `Breaking:`.
- The manifest's `schema` number is separate from the package version. It changes whenever the
  manifest's shape changes in a way a reader would notice.

## Why

- The last breaking change, the removal of the `stats` subcommand and the move to `schema: 2`,
  is recent, and the first release is also the first time anyone outside reads the API. A 1.0
  waits for a quiet period and an API sign-off.
- The npm placeholder versions `0.0.0-stage` and `0.0.1-stage` sit below `0.3.0`, so the
  replayed number is allowed.

## Reopen if

The first release shows the API to be wrong. Then the next minor release changes it, with a
`Breaking:` entry.
