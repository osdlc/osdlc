---
id: D-02
type: decision
state: accepted
created: 2026-10-13
---

# D-02: Version line and stability tiers

## Decision

- The package stays on `0.x`. The first published version was `0.3.0`.
- The core exports are stable, and the rest experimental. The README lists
  the experimental exports by name, and each carries `@experimental` in its
  TSDoc.
- Exports with no user are kept and marked experimental, not removed before
  the first release.
- The owner confirmed the tier of each export before the first release. The
  types that only name the parts of a stable export, such as
  `ShellPositionals`, `FailureTextOptions` and `NeverExitedReason`, are
  stable with it. The types of the `/testing` fakes are experimental, like
  the fakes.

## Why

The core contract has settled, but some helpers are new or have no user yet.
`1.0` would promise more than the package can keep today. Marking the tiers
tells a reader which parts are safe to build on. An export with no user is
more likely to need a change, and removing it after publishing would be a
breaking change.

## Consequences

- A breaking change to a stable export will be marked **Breaking** in the
  CHANGELOG.
- Any release may change or remove an experimental export.
- `1.0` comes once the experimental exports have gone 60 to 90 days without
  a breaking change, the open API-change questions are settled, and Windows
  support has landed, if that is feasible
  ([T-01](../tasks/T-01-windows-support.md)).
