---
id: D-J2NB
type: decision
state: proposed
created: 2026-11-22
---

# D-J2NB: Version line and stability

The owner has not yet confirmed the version. This note proposes it.

## Decision

- The package stays on the 0.x line. Its development history, replayed under semver, reaches
  `0.1.2`. Those versions were never published, and the CHANGELOG keeps their history.
- The first public release is `0.2.0`: the release tooling adds a minor bump for the move, which
  removes the Bun export condition and the `src/` files from the tarball and narrows the Node
  range.
- Every stable export follows 0.x semver: a breaking change ships in a minor release, with a
  changelog entry that starts `Breaking:`.
- The 24 experimental exports (see [D-R8TX](D-R8TX-first-public-api.md)) may change in any
  release.
- A report carries `schema: 1`. The number changes only when a report's shape changes.
- A minor release may add a member to a list of names, such as `CHANGE_CATEGORIES`,
  `CONTENT_KINDS` or `FILE_GROUPS`. A `switch` over one needs a `default` arm.

## Why

- The package has 15 days of history and two consumers. A 1.0 would promise a surface that has
  not met enough callers.
- The replay found two uncertain changes: new optional fields on `Language`, and a changed
  `formatting` rule. The `formatting` change alters a documented result only for files with
  whitespace inside strings, and nothing was public, so neither forces a different line.
