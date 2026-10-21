---
id: D-05
type: decision
state: superseded
created: 2026-10-19
---

# D-05: `isInside` and `realpathOrSelf` keep their names for 0.2.x

Superseded by [D-06](D-06-api-makes-the-filesystem-visible.md). 0.3.0 removes
both: `lexical.isUnder` replaces `isInside`, and `guard.realPath` replaces
`realpathOrSelf`.

## Decision

- `isInside` and `realpathOrSelf` keep their names and signatures for every
  0.2.x release.
- The API review planned for 0.3.0 revisits both.
- Both are TypeScript-only. The Rust crate has no export to match.

## Why

- A rename in 0.2.x would break callers in a patch release.
- The review looks at the API as a whole, so names that change, change
  together, once.

## Consequences

- Until then the README and the TSDoc say what each does and where it stops:
  `isInside` compares text and follows no symlink, and `realpathOrSelf` folds
  `..` as text when its walk gives up.
- A rename in 0.3.0 is a breaking change, marked in the CHANGELOG.
