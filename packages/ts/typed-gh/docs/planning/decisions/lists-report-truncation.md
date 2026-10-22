---
type: decision
state: proposed
created: 2026-10-20
---

# A list says when its limit cut it short

## Decision

- Every list query returns `{ rows, truncated }`: `prList`,
  `issueList`, `labelList`, and the new `repoList` and `searchPrs`.
- The verb asks gh for `limit + 1` rows. It returns at most `limit`, and sets
  `truncated` when the extra row came back.
- A failed call or unreadable output is not a list: it throws, or is `null`
  through `soft` (see [Three doors](three-doors.md)). An empty, complete list
  is `{ rows: [], truncated: false }`.
- The change ships in 0.6.0 with a **Breaking** note in the CHANGELOG.

## Why

- gh does not say when `--limit` cut a list short. A list of exactly `limit`
  rows could be complete or cut, and a caller cannot tell.
- Consumers that need to know write their own truncation checks today.
- One shape for every list means no list is cut off silently and callers
  learn one rule.
- The package is in alpha, so a breaking change now costs less than two list
  shapes side by side.

## Consequences

- Every caller of the three existing lists changes from `rows` to
  `result.rows`.
- Each list call fetches one extra row.
- `openPrFor` and `prFind` read `rows` and ignore `truncated`; they ask for a
  small limit and need only one match.
