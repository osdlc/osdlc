---
type: decision
state: proposed
created: 2026-11-05
---

# A pull request's activity is one GraphQL timeline read

[#369](https://github.com/osdlc/osdlc/issues/369) asked for a typed verb
that returns a pull request's activity as one ordered list, optionally
since a point in time, and asked whether the REST timeline under
`gh api --paginate` or a GraphQL query fits better.

## What consumers build by hand today

- `GithubCodeHost.getPr` in `@osdlc/code-host` joins `prView`'s `comments`
  and `reviews` with a second, paginated REST call for the inline review
  comments (`pulls/<n>/comments`). Its `since` option is ignored: "this
  always fetches the full state". The result is grouped by kind, not
  ordered in time, and has no commits or changes of state.
- `GithubCodeHost.listComments` pages `issues/<n>/comments` through `raw` to
  get the numeric REST ids that `updateComment` needs, because `prView`'s
  `Comment.id` is a GraphQL node id.
- No consumer in this repository reads commits, force pushes or changes of
  state as activity. Each would need another call.

## Decision

- One verb, `prActivity(number, { since? })`, with the method on `Gh` and
  `AsyncGh` and a soft form. It returns `ListResult<PrActivityItem> | null`.
- It reads the pull request's GraphQL `timelineItems`, through the
  `graphql` verb with `paginate`, with `itemTypes` limited to comments,
  reviews, commits, and the closed, reopened, merged, ready-for-review,
  converted-to-draft, head force-pushed and base-changed events.
- Rows keep GitHub's timeline order, oldest first. Each review is followed
  by its inline comments, read up to 100 per review. `truncated` is true
  when a review has more. gh's `--paginate` follows one connection, the
  timeline, so the nested list cannot be paged in the same call.
- `since` goes to GitHub's own `since` argument, normalized to UTC. The
  verb does not filter again on its side, because GitHub decides which date
  of an item `since` compares (a commit's is not its push time). A value
  that is not an ISO 8601 date and time with a zone throws `RangeError`.
- No ETag. GraphQL has none.
- "Could not resolve to a PullRequest" is the verb's `absent`, so a pull
  request that does not exist is `null`, as for `prView`.
- `PrActivityItem` is a union discriminated by `kind`. Every item has `id`,
  `at` and `actor`. Text items carry `restId` from `fullDatabaseId`, the
  REST id `issueCommentEdit` takes. A GraphQL `Bot` actor has
  `isBot: true`.
- The verb, the methods and the three types are experimental. The query
  was checked against GitHub's published GraphQL schema, not against a live
  pull request.

## Why GraphQL and not the REST timeline

- **`since` is server side.** The REST timeline endpoint
  (`issues/<n>/timeline`) takes no `since`, so a poll would fetch every
  page every time and filter locally. That is the cost `since` exists to
  avoid.
- **An ETag does not help.** The REST timeline lists oldest first, so new
  items land on the last page. Once a pull request has more than one page,
  a conditional request on the first page answers 304 while there is new
  activity. And this package's `api` cannot
  send an ETag with `paginate`, because gh prints a header block per page.
- **One shape per item.** REST timeline events differ in shape: `committed`
  has no `created_at` and names a git author rather than an account,
  `reviewed` has `submitted_at`, and inline comments come grouped under
  `line-commented`. GraphQL selects the same fields on each type, with a
  `__typename` to switch on.
- **Bot logins.** GraphQL gives the bare login and a `Bot` type, which the
  package's `Actor` already uses. REST gives `name[bot]`.
- **A partial answer is visible.** A GraphQL page with `errors` fails the
  call, as `graphql` already does, so a short page is never read as less
  activity.

The cost: inline comments are capped per review, and GitHub's `since`
semantics are its own. Both are documented on the verb.

## What is left out

- Labels, assignees, review requests, references and other timeline items.
  None was asked for, and each adds fields to keep total. `itemTypes` makes
  adding one a small change.
- Adopting the verb in `@osdlc/code-host`. `getPr`'s activity carries REST
  ids for inline comments and a `threadId` derived from REST fields, and
  its callers sign entries by id. Moving it to this verb changes the ids
  every caller sees, so it is a change for that package to decide, in its
  own pull request.
