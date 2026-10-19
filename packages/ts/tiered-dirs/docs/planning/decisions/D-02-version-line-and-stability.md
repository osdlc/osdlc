---
id: D-02
type: decision
state: accepted
created: 2026-10-18
---

# D-02: Version line and stability

## Decision

- The first published version is `0.3.0`, on the 0.x line.
- The twin rule requires the same major and minor version as the Rust crate.
  The crate was at 0.3 when this package was first released, so this
  package starts at 0.3.
- Every export is stable in 0.x, and its TSDoc says so. None is experimental.
- A breaking change to an export ships only in a new 0.x minor release, with a
  CHANGELOG entry that starts with `Breaking:`.
- A minor release may add a member to `TierKind` or `Convention`, a code to
  `TieredDirsErrorCode`, or a name to `EnvVars`. The README says so, and a
  `switch` over one of these unions needs a `default` arm. `Home` is
  exhaustive: adding a home changes every caller's layout, so it is a breaking
  release.
- Versions 0.1.0 and 0.2.0 were used during development and never published.
  The CHANGELOG keeps their history.

## Why

- The Rust crate is `#[non_exhaustive]` on `TierKind`, `Convention`, `Error`
  and `EnvVars`. TypeScript has no such attribute, so the growth rule is
  written in the docs.
- The TypeScript API had no public version before 0.3.0. The changes that
  brought it in line with the Rust crate cost no version bump.

## Consequences

- The twin rule keeps the major and minor versions equal, so a breaking
  change in either twin moves both to a new minor version.
