---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The first release is `0.4.1`, on the 0.x line. npm holds two placeholder versions before it,
  `0.0.0-stage` and `0.0.1-stage`. They are not releases.
- The version comes from replaying the development history under semver: one bump per merged
  change, a minor bump for each breaking change. Those versions were never published, and the
  CHANGELOG keeps their history.
- The Rust twin shares the major and minor version, so it starts at `0.4.0`.
- The `./config` subpath and the detection report schemas (`DetectReportSchema` and the types
  beside it) are experimental. Every other export is stable within a 0.x minor line. The README
  lists the experimental items, and a test checks the list against the `@experimental` tags.
- A breaking change to a stable export ships only in a new 0.x minor release, with a CHANGELOG
  entry that starts with `Breaking:`.
- `@osdlc/config-layers` is an optional peer at a range written by hand, today
  `^0.8.0 || ^0.9.0 || ^0.10.0`: the lines `./config` was checked against (each section built
  from the packed package). Changesets leaves the range alone while a config-layers release stays
  in it (`onlyUpdatePeerDependentsWhenOutOfRange` in `.changeset/config.json`). A release that
  leaves it would still give this package an automatic patch that rewrites the range, so the pull
  request that takes config-layers to a new line also checks `./config` against it and adds it
  here by hand, with an agent-router minor changeset. `tests/stability.test.ts` fails if the range
  drops a line it lists, which stops a Version Packages pull request that rewrote it.
- A minor release may add a member to a union of codes or names, such as `AVAILABILITY_REASONS`,
  `PROFILE_SKIP_REASONS`, a validity code or `TRAITS`. A `switch` over one of these needs a
  `default` arm.

## Why

- The config sections and the detection report follow what their first host needs, and their
  shape is still moving. Marking them experimental lets them change in a patch release while
  the resolver stays stable.

## Consequences

- A caller that only resolves references and walks profiles depends on stable exports alone.
