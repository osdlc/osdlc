---
type: decision
state: accepted
created: 2026-10-19
---

# A total pull request model

## Decision

- Every field of `PullRequest` has a value, even when `gh` was not asked for
  it. A field that was not requested lands at its "not known" value:
  `UNKNOWN`, `null`, `false` or an empty array.
- `number` is the one field without a "not known" value. A payload with no
  usable number is not a pull request, and `parsePullRequest` returns `null`.
- The parser folds the transports onto one shape. A `[bot]` suffix (REST,
  search) or an `app/` prefix (gh's `--json` PR author) on a login is
  removed and sets `isBot`. A legacy `StatusContext` and a `CheckRun`
  both become a `CheckRun` with a `verdict`.
- A check that is still running has the verdict `pending`, not `success`.
- `gh`'s empty `reviewDecision` string becomes `null`.

## Why

- `gh --json` returns only the fields requested. An optional field makes every
  reader handle `undefined`, and a reader that forgets reads a field it never
  asked for as a fact.
- Absent and unknowable are the same answer to a caller, so they get one
  representation.
- Comparing a GraphQL login with a REST login never matches unless both use one
  form. That is how bot noise gets read as human review feedback.
- Reading "no failure yet" as green is how a red build merges.

## Consequences

- A caller cannot tell "not requested" from "unknown" by looking at the value.
  It chooses the field set with the verb, such as `PR_LIST_FIELDS`.
- `mergeable: 'UNKNOWN'` is also a real answer: GitHub computes it lazily.
  `prViewSettled` re-asks a few times, and `UNKNOWN` can still be the final
  verdict.
