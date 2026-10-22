---
type: decision
state: accepted
created: 2026-10-21
supersedes: three-modes.md
---

# Three doors: plain, `try` and `soft`

## Decision

- The plain method of a query returns its value or throws, as `typed-git`'s
  does. A failed `gh` throws `CommandFailed`. A run that exited 0 but whose
  output could not be read completely throws a `FailureError` carrying a
  `GhFailure` of kind `unreadable`. A query never answers `null` for a failure.
- A query for one thing (`prView`, `issueView`, `repoView`) answers `null` when
  GitHub says there is no such thing. The verb declares this with `absent`,
  matched on stderr (`Could not resolve to a …`, `HTTP 404`, `no pull requests
  found for branch`). `prFind`, `openPrFor` and `prViewSettled` inherit it.
- `gh.try.*` is a facade over the whole client returning
  `Result<T, GhFailure>` from `@osdlc/result`. It catches `CommandFailed` and
  `FailureError` and nothing else. A declared absence is `ok: true` with `null`.
- `gh.soft.*` is a facade over the queries returning `null` for a failure.
  It is the old query contract, now opt-in. A mutation has no soft form and
  throws `TypeError` if called through `soft`.
- A probe (`installed`, `authStatus`, `api`, and `authenticated` and `ready`
  over them) returns its failure as part of its value in every door. The verb
  is marked `probe`.
- A mutation, and `prDiff`, throw `CommandFailed` as before (`checked`).
- `raw` returns the `CommandResult`; `rawChecked` throws.
- `GhFailure` is a `Failure<GhFailureKind>`. `GhFailureKind` is every
  `@osdlc/command-seam` kind plus `not-authenticated`, `network`, `not-found`,
  `rate-limited` and `unreadable`, read from gh's stderr. The table, with the
  messages and hints, is in the README. `not-installed` carries the hint
  ``Install it from https://cli.github.com, then run `gh auth login`.``
- `Gh` and `AsyncGh` follow the same contract and run one verb table.

## Why

- Mirroring `typed-git` means a caller learns one contract for both clients.
  The old contract (query is `null`, mutation throws) differed from the git
  client's, and `null` hid why. A caller that wanted a sentence for a person
  had to guess from `null`.
- `null` conflated "no such PR", "gh is not installed", "signed out", "rate
  limited" and "the JSON was malformed". Now each is a kind with a message and
  a hint written by the layer that knows `gh`.
- Absence stays an answer for the single-thing views because `prFind`'s
  fallback (a number that is no PR is tried as a branch) depends on telling
  "not found" from "broke".
- The soft door keeps the old behaviour for a caller whose fallback really is
  "nothing", such as an adapter whose port reports a failure as `null`.

## Consequences

- Hard cutover, pre-1.0: a caller that tested a query's result for `null` to
  detect a failure now catches, or reads `soft`. `code-host`'s GitHub adapter
  reads through `gh.soft` until its port reports failures itself.
- Matching is on gh's English messages. A translated or reworded message is a
  plain `exit` with gh's own first line, never a wrong kind.

Supersedes [Three modes](three-modes.md), whose query contract this replaces.
