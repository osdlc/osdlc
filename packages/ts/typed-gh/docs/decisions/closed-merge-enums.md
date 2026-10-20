---
type: decision
state: accepted
created: 2026-10-20
---

# Two closed enums

## Decision

- `MergeableState` and `ReviewDecision` are closed unions. The parser maps a
  value it does not know to `UNKNOWN` (for `MergeableState`) or `null` (for
  `ReviewDecision`).
- Every other enum in the model is open: its union ends in `(string & {})`, and
  the parser passes an unknown value through.

## Why

- Callers decide whether to merge from these two fields, member by member. A
  closed union lets a `switch` cover every case, and a new GitHub value lands
  on the cautious answer: "not known" or "no decision".
- For the other enums, such as `MergeStateStatus` or `ReviewState`, a new value
  is information a caller may want to show or log. Dropping it would lose it.

## Consequences

- A new GitHub value for `mergeable` or `reviewDecision` is invisible until the
  union gains it. That is a minor release, since a `switch` that covers every
  member would no longer be complete.
- Code that reads an open enum needs a default case.
