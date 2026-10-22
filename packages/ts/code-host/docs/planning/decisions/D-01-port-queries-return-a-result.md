---
id: D-01
type: decision
state: accepted
created: 2026-10-21
---

# D-01: The port's queries return a `Result<T, CodeHostFailure>`

## Decision

- The `CodeHost` queries that could fail (`listPrs`, `listPrDetails`, `getPr`,
  `listComments`, `reviewThreads`, `prForBranch`) return
  `Result<T, CodeHostFailure>` from `@osdlc/result`. They no longer answer
  `null` for a failure. This is a hard cutover: no alias, no `soft` form.
- `CodeHostFailure` is a `Failure<CodeHostFailureKind>` with `host: 'github' |
  'forgejo'` and an optional `status`. The kinds are the tool kinds of
  `@osdlc/command-seam` plus `not-authenticated`, `network`, `not-found`,
  `rate-limited`, `http`, `unreadable`, `unsupported`, `no-remote`,
  `bad-remote` and `missing-token` (table in the README).
- A declared absence stays a success: `getPr` of a PR that does not exist and
  `prForBranch` of a branch with no PR answer `{ ok: true, value: null }`. On
  Forgejo, HTTP 404 on one PR number is that absence; 404 on a listing is
  `not-found`.
- The GitHub adapter reads through `gh.try.*` and maps `GhFailure` one to one
  (same kind, message, hint and detail), with the `GhFailure` as `cause`. The
  Forgejo adapter classifies the curl run with `classifyFailure`, names curl
  exit codes 6, 7, 35, 52, 55, 56 and 60 `network` and 28 `timeout`, and reads
  the HTTP status: 401 and 403 `not-authenticated`, 404 `not-found`, 429
  `rate-limited`, anything else outside 2xx `http`.
- Mutations (`postComment`, `updateComment`, `updateBranch`, `setDraft`,
  `mergePr`, `createPr`) still throw. What they throw is a `FailureError`
  carrying the same `CodeHostFailure` (Forgejo) or `CommandFailed` (GitHub).
  Both are `FailureError`s, so a CLI renders them as it renders a returned
  failure.
- `selectCodeHost` returns `Result<CodeHost, CodeHostFailure>`. Building an
  adapter reads the checkout and the environment, so it answers the way the
  queries do. Its failures are `no-remote`, `bad-remote` (the remote URL is
  redacted of credentials) and `missing-token`. The earlier plain `Error`s are
  gone.
- `reviewThreads` on Forgejo is an `unsupported` failure, where it was `null`.
  A merge gate already treated `null` as "unknown"; the failure says why.

## Why

- `null` meant "no PR", "not signed in" and "no network" at once. A survey that
  read `null` as "nothing to do" reported a broken setup as an empty list.
- The tool problems (a missing `gh`, a signed-out `gh`, no network) are the
  same for every caller. Classifying them once, here and in `typed-gh`, means
  no caller keeps its own table of stderr patterns or its own wording.
- One kind set across both adapters lets `@osdlc/cli-tool` map a kind to one
  exit code, whichever host failed.
- Mutations stay throwing because their callers already stop on failure and
  nothing swallowed them; a `Result` would add ceremony and invite ignoring it.

## Consequences

- Callers that tested `=== null` for failure test `!result.ok`; callers that
  used `null` for "none" read `result.value === null`.
- A caller that wants the old tolerant behaviour writes `unwrapOr(result, null)`
  at its own call site, where the choice is visible.
