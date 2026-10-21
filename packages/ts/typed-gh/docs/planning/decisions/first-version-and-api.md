---
type: decision
state: accepted
created: 2026-10-20
---

# First version 0.5.0, API signed off

## Decision

- The owner reviewed the public API in review of the public API and signed it off.
- The first version on npm is `0.5.0`. It is released through a `minor`
  changeset on the current `0.4.1`.
- The package stays at `0.x`. A stable item changes only with a minor
  release, and the CHANGELOG marks a breaking change. An item tagged
  `@experimental` may change in any release.

## Why

- The API was renamed and trimmed before this release. A first release is the
  last cheap time to do that.
- A `minor` bump from `0.4.1` gives `0.5.0` without editing `version` by hand.
  The release flow does the bump.
- `0.x` tells users the surface may still move, and the stability list says
  which parts are likely to.

## Consequences

- The first CHANGELOG entry also lists the breaking changes since `0.4.1`, for
  anyone who used an earlier copy.
- A rename after this release is a breaking change and needs a minor release
  with a **Breaking** note.
- `issueCommentEdit` and `createReview` are experimental until they have been
  used in practice. See the README's Stability section.
