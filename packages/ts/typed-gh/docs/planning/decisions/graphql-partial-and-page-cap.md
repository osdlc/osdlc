---
type: decision
state: proposed
created: 2026-11-05
---

# `graphql` reads partial answers on request, and has no page cap

From [osdlc/osdlc#373](https://github.com/osdlc/osdlc/issues/373).

## Decision

- `graphql(query, variables, { partial: true })` returns each page as a
  `GraphqlPage`: `{ data, errors }`, where `errors` is a list of
  `GraphqlError` (`message`, `type`, `path`) and is empty for a page that came
  back whole. Without `partial`, nothing changes: a page with `errors` fails
  the call.
- gh exits 1 for a response that carries `errors`, after printing it. The
  partial verb declares that result an answer through `absent`, so the plain
  method, `try` and `soft` return it. A non-zero exit is an answer only when
  every page has a `data` object and the last page has errors, which is why gh
  stopped. Any other non-zero exit stays a failure, including one that left
  whole pages on stdout (a network error on page 3).
- With `paginate`, gh stops at the first page with errors. When that page
  says `hasNextPage: true` anywhere, the pages after it were never fetched.
  The call then fails, as it would without `partial`, rather than return
  fewer rows. The test reads every `hasNextPage` in the page, not only the
  first `pageInfo` gh reads, so it fails whenever gh would have gone on, and
  sometimes when gh would not have (a nested connection with more items).
- `nodesAt(pages, path, { partial: true })` joins one connection across
  partial pages and returns `PartialNodes`: the `nodes`, where a node GitHub
  could not resolve is `null`, and every error of every page. It is `null` on
  the same terms as the plain form, so a connection that is itself `null`
  gives no nodes at all.
- No `maxPages`. `paginate` follows the connection to its end, as gh does.
  A caller that needs a cap, or needs to carry on past a page with errors,
  leaves `paginate` off and passes `$endCursor` itself. The README shows the
  loop.
- `Gh.graphql` and `AsyncGh.graphql` are overloaded on `partial`, and the
  `try` and `soft` types keep both overloads, so each form keeps its own
  return type in all three doors.

## Why

- A caller that batches several aliased lookups into one query loses all of
  them today when one is gone, so it stays on raw `gh api graphql`.
  `{ data, errors }` per page is GraphQL's own shape for that answer.
- Opt-in, because a partial answer read as a whole one gives wrong results.
  The default keeps the rule that a partial answer is a failure.
- `errors` is read into a small typed model, leniently: gh counts a string
  `errors` as an error, so this does too, and an entry that is not an object
  still counts as one error with no message. A caller can then always tell a
  page with errors from one without.
- A page cap means replacing `--paginate` with our own cursor loop. A verb is
  one argv and one parse, and the clients, `runVerb` and every fake runner
  are built on that. A loop needs several runs per verb, the path of the
  connection to read its cursor from (gh finds it by scanning for the first
  `pageInfo`), and its own answer for a failure halfway. The loop a caller
  writes is a few lines with `graphql` and `nodesAt`, and it can also do
  what `--paginate` cannot: go on past a page with errors.

## Consequences

- New experimental exports: `GraphqlPartialOptions`, `GraphqlPage`,
  `GraphqlError` and `PartialNodes`. `GraphqlOptions` gains
  `partial?: false`, so a value typed `GraphqlOptions` still picks the whole
  form.
- A caller with a `partial` flag only known at run time calls the verb, which
  has a third overload for `GraphqlOptions | GraphqlPartialOptions`. The
  client methods have two overloads only, because the `try` and `soft` types
  keep a method's last two.
- `absent` on `GhVerb` now means "a non-zero exit that is still an answer",
  of which "there is no such thing" is one case.
- If a cap turns out to be needed often, a later `maxPages` can still run
  the cursor loop in the clients. That would be its own decision.
