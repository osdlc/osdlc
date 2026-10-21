# @osdlc/typed-gh

`gh --json` returns loose JSON, and a failed call returns an exit code. Code that reads a field it
never asked for, or treats a failed call as "nothing found", goes wrong without a sound. This
package wraps `gh` in typed calls. They return a complete model and tell "we could not ask" apart
from "there is nothing".

It is for TypeScript code that runs where `gh` is installed and signed in: developer tools, CI
scripts, release bots and coding agents. It is the GitHub-side companion of
[`@osdlc/typed-git`](https://github.com/osdlc/osdlc/tree/main/packages/ts/typed-git).

## Install

```sh
npm install @osdlc/typed-gh
```

It needs Node 22 or later (Bun also works, through the compiled `dist/`), and the `gh` CLI on `PATH`, signed in with `gh auth login`.
It is supported on macOS and Linux. Windows is not supported yet; it will be once a Windows CI job
runs the tests.

```ts
import { Gh, type PrListOptions, type PullRequest } from '@osdlc/typed-gh'

const gh = new Gh(process.cwd())

const filter: PrListOptions = { state: 'open', base: 'main' }
const prs: PullRequest[] = gh.prList(filter)?.rows ?? []
```

The `examples` folder in the repository runs the same calls as tests.

## When not to use it

- **`gh` is not installed.** In a browser or a serverless function, use an HTTP client such as
  Octokit.
- **You sign in with a token, a GitHub App or OAuth.** This package reads no token.
- **You make many calls or poll in a loop.** Each call starts a `gh` process.
- **You need the whole API typed.** This package covers the calls listed below. `api()` is a GET
  and `graphql()` is a query. Anything else goes through `raw`.

## How it compares

Checked against the npm registry on 2026-10-19.

| Package | Version | What it is, per the registry | Pick it instead when |
| --- | --- | --- | --- |
| `@octokit/rest` | 22.0.1 | GitHub REST API client for Node.js | you have a token, or no `gh` |
| `octokit` | 5.0.5 | GitHub SDK for browsers, Node.js and Deno | your code runs in a browser |
| `@octokit/graphql` | 9.0.5 | GitHub GraphQL API client | you write your own queries |
| `@actions/github` | 9.1.1 | Actions github lib | the code runs in a workflow |
| `@procedures/gh` | 0.13.2 | The GitHub CLI as procedures, no shell | you use `@procedures` |
| `@timmo001/effect-gh` | 0.7.0 | An Effect v4 SDK for the GitHub CLI | you build on Effect |

The last two also wrap `gh`. `@procedures/gh` depends on `zod` and two `@procedures` packages.
`@timmo001/effect-gh` needs `effect` as a peer. This package depends on `@osdlc/command-seam`
and `@osdlc/typed-git`.

## Authentication is `gh`'s

No token is read, stored, or forwarded. That is the reason this shells out to
the CLI rather than speaking REST: the credential already exists in the user's
keychain, and a library that reaches for `GITHUB_TOKEN` is a library that can
leak one.

## A total model

`gh --json` returns only the fields you asked for, so every field on
`PullRequest` has a "not known" value and none of them is `undefined`:

```ts
const pr = parsePullRequest({ number: 7 })

pr?.mergeable // 'UNKNOWN', not undefined
pr?.reviewDecision // null
pr?.checks // []
```

A caller cannot tell "absent" from "unknowable", so both get one value. A
field you never requested is never read as a fact.

Most enums are open. They are unions ending in `(string & {})`. GitHub adds
members over time. A client that crashes on a new one is worse than a client
that passes it through.

Two enums are closed: `MergeableState` (`MERGEABLE`, `CONFLICTING`, `UNKNOWN`)
and `ReviewDecision` (`APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`,
`null`). A value GitHub adds to either reads as `UNKNOWN` or `null`. A check
that decides whether to merge can then match every member.

## Three modes, so failure is never ambiguous

| | on failure |
| --- | --- |
| **queries** | return the absence value, `null`. Never throw. |
| **mutations** | throw `CommandFailed`, carrying argv and the full result. |
| **`raw(argv)`** | hand back the raw `CommandResult`; you decide. |

A query returns `null`, never an empty list on failure. `prList()` returning
`{ rows: [], truncated: false }` means *this repository has no open PRs*.
`null` means *we could not ask*. If the two were the same, an expired
credential would read as "nothing to do".

## A list says when its limit cut it short

`gh --limit` cuts a list without saying so. Every list query here asks for
one row more than `limit` and returns `{ rows, truncated }`: at most `limit`
rows, and `truncated: true` when there were more.

```ts
const page: ListResult<PullRequest> | null = gh.prList({ limit: 50 })

if (page?.truncated) console.warn('more than 50 open PRs; raise the limit')
```

`prList`, `issueList`, `labelList`, `repoList` and `searchPrs` all work this
way. A `limit` that is not a positive integer throws `RangeError`.

## A repository without a clone

By default a client talks to the repository of the clone at its directory.
Name a repository, a host, or both, and every call targets them instead, so
no clone is needed:

```ts
const acme = new Gh(process.cwd(), { repo: 'acme/widgets', hostname: 'github.acme.com' })

acme.prView(42)
acme.withRepo('acme/gadgets').prList()
acme.api('repos/{owner}/{repo}/branches')
```

The target goes into the argv, so a `CommandFailed` shows which repository a
call hit: `pr`, `issue` and `label` calls get `--repo github.acme.com/acme/widgets`,
`api` calls get `--hostname` and a filled `{owner}/{repo}`, and `authStatus`
asks about that host. `repoList` and `searchPrs` have no host flag in gh, so
they get `GH_HOST` in the environment. `withRepo` and `at` keep the runner and
the rest of the target.

`hostname` is any GitHub host: `github.com`, a GitHub Enterprise Server host,
or a `<tenant>.ghe.com` host. gh speaks only GitHub's API, so Forgejo, Gitea
and GitLab are out of reach. A `repo` that is not `owner/name`, or a
`hostname` that is not a bare host, throws `RangeError`.

## Finding a pull request

`prView` takes a number, a branch or a URL. A URL names its own repository
and host, so the client's target is not added to it.

```ts
gh.prView(42)
gh.prView('feature/login')
gh.prView('https://github.acme.com/acme/widgets/pull/42')
```

`prFind` takes what a person typed and runs the lookup it needs:

```ts
const pr: PullRequest | null = gh.prFind(process.argv[2] ?? '')
```

It reads the text with `parsePrRef`, which starts no process: `42` and `#42`
are numbers, `owner/name#42` is a number in that repository, a URL is a URL,
and any other valid branch name is a branch. Bare digits are tried as a PR
number first and then as a branch, since a branch can be named `42`. A branch
gives its open PR, or else its newest closed or merged one, so a tool run
after the merge still finds it.

`prList({ head })` matches the head branch exactly: `task/foo` never returns
`task/foo-2`. Two forks can share a branch name; ask for
`headRepositoryOwner` to tell them apart.

## Two shape hazards it absorbs

**Author logins differ by transport.** GraphQL (`gh pr view --json`) returns a
login without a suffix (`github-actions`). REST (`gh api`) returns the suffixed
one (`github-actions[bot]`). Comparing one with the other never matches, and
no error shows it. That is how bot noise gets treated as human review
feedback. Logins are cut to the suffix-less form once, when a payload is
parsed.

**`statusCheckRollup` holds two node types.** A modern `CheckRun` carries
`name`/`status`/`conclusion`. A legacy `StatusContext` carries
`context`/`state`. Both map onto one `verdict` axis:

```ts
const checks: CheckRun[] = parsePullRequest(payload)?.checks ?? []

checks.every((c) => c.verdict === 'success')
anyCheckFailed(checks)
```

A check still running is `pending`, never `success`. If "no failure yet" read
as green, a red build could merge.

## The merge state is not stable on a cold query

GitHub computes mergeability lazily: the first query kicks it off and answers
`UNKNOWN` until it lands. A caller that believes that first answer mis-triages
every PR that is merely slow.

```ts
const pr = gh.prViewSettled(7, { attempts: 3 }) // 3 is the default
```

`UNKNOWN` is still a legitimate final verdict, so callers must handle it.

Note also that `mergeStateStatus: "BEHIND"` only ever appears when branch
protection *requires* an up-to-date branch. Without that rule a branch a
hundred commits behind still reports `CLEAN` — so it is a corroborating hint
about staleness, never the measure of it. Compute that from the commit graph
(`typed-git`'s `aheadBehind`).

## Changing pull requests

Mutations throw `CommandFailed` when `gh` fails.

```ts
const url = gh.createPr(options)
gh.editPr(9, { title: 'Add retries to fetch' })
gh.editPrBody(9, 'Retries the fetch three times.')
const comment = gh.prComment(9, 'Rebased onto main.')
gh.prUpdateBranch(9, 'rebase')
gh.prSetDraft(9, false)
```

`createPr` and `prComment` return the URL `gh` printed, or `''` when it printed none.
`prSetDraft(n, false)` marks a draft PR ready for review. `prSetDraft(n, true)` turns a PR back into
a draft.

## Merging

`prMerge` takes the head commit you judged. GitHub refuses the merge if the head has moved since,
so a push that lands between your check and the merge cannot ride in unreviewed. The branch is not
deleted. That is yours to do.

```ts
const method: PrMergeMethod = 'squash'

gh.prMerge(9, { method, headSha: 'abc1234' })
```

`prReviewThreads(n)` reads the review threads, so you can look for open ones before you merge. It
returns `null` when it could not read all of them (a failed call, an unexpected payload, or more
than 100 threads). That is not the same as "no threads".

```ts
const threads: ReviewThread[] | null = gh.prReviewThreads(9)

threads?.filter((t) => !t.isResolved)
```

## Issues and labels

```ts
const issue: IssueRow | null = gh.issueView(7)
const triage: ListResult<IssueRow> | null = gh.issueList({ label: 'status:triage', limit: 50 })
gh.setIssueLabel(7, 'status:triage', 'status:define')

const labels: ListResult<Label> | null = gh.labelList({ limit: 100 })
gh.createLabel({ name: 'status:triage', color: '1f6feb', description: 'Triage stage' })
gh.editLabel('status:triage', { description: 'Waiting for triage' })
```

`issueList` returns open issues, up to `limit` (default 200). `labelList` returns up to `limit`
labels (default 1000; `gh`'s own default is 30). `setIssueLabel` removes one label and adds
another in one `gh issue edit` call. `createLabel` passes `--force`, so it is safe to repeat: an
existing label gets the color and description you pass.

## Diffs, reviews and comments

```ts
const diff = gh.prDiff(9)
const review = gh.createReview(9, {
  commitId: 'abc1234',
  body: 'One question.',
  comments: [{ path: 'src/fetch.ts', line: 12, body: 'Retry here too?' }],
})
gh.issueCommentEdit('4204154439', 'Updated: CI is green.')
```

`prDiff` returns the unified diff and throws `CommandFailed` when `gh` cannot produce it.

`createReview` is experimental. It posts a review of kind `COMMENT`: it cannot approve or request
changes. Each inline comment sits on one line of the new side of the diff. It returns the review's
URL.

`issueCommentEdit` is experimental. It takes the comment's numeric REST id, as text: the `id` from
`gh api repos/{owner}/{repo}/issues/<n>/comments`. The `Comment.id` that `prView` returns is a
GraphQL node id, which this REST path does not accept. An id that is not all digits throws
`RangeError` before `gh` runs (`AsyncGh` returns a rejected Promise).

## Pure halves, for an async fan-out

The verb table and every parser are side-effect free, so concurrent callers
drive them through their own `AsyncCommandRunner` without duplicating a line
of parsing:

```ts
import { prList } from '@osdlc/typed-gh'

const verb = prList({ state: 'open', limit: 10 })
const result = await runner.run(verb.argv, { cwd: '/repo', timeoutMs: 5_000 })
const prs = verb.parse(result)
```

## `AsyncGh`

The awaitable form of `Gh`, with the same methods, for a fan-out that must not block the event loop.
Same tri-modal contract (queries resolve to a value or `null` and never
reject, mutations reject with `CommandFailed`, `raw`/`rawChecked` are the
hatches), driven by the same verb table, so the two cannot drift. It takes an
`AsyncCommandRunner` and defaults to `spawnRunnerAsync("gh")`.

```ts
import { AsyncGh } from '@osdlc/typed-gh'

const gh = new AsyncGh('/repo')
const prs = await Promise.all(branches.map((b) => gh.openPrFor(b)))
const body = await gh.prBody(42) // string | null
await gh.editPrBody(42, `${body}\n\nfooter`)
await gh.prComment(42, 'rebased') // the comment's URL, or ''
await gh.prUpdateBranch(42, 'rebase')
```

These methods take `AsyncCallOptions`: `raw`, `rawChecked`, `prList`, `prView`, `prFind`,
`openPrFor`, `prViewSettled`, `prBody`, `api`, `graphql`, `labelList`, `issueList`, `issueView`,
`repoList`, `repoView` and `searchPrs`. The options are `timeoutMs` and an `AbortSignal` in
`signal`.

`api(endpoint, opts)` (on `Gh` and `AsyncGh`) is a REST GET through `gh api`.
It never throws; the result is `{ ok, status, etag, body, malformed, stderr, error? }`.
`stderr` is gh's own; `error` holds the runner's message when gh never ran or
was stopped (a missing binary, a timeout).
Pass `etag` for a conditional request (`If-None-Match`; a 304 comes back as
`status: 304, body: null`), or `includeHeaders: true` to read status and ETag
without one. If `gh` prints more than one header block, the last one is read. `{owner}` and
`{repo}` in the endpoint come from the client's repo, or are filled in by gh from the clone.

## Reading every page

`api` with `paginate: true` fetches every page and, when each page is an array, joins them into one
`body`:

```ts
const branches = gh.api('repos/{owner}/{repo}/branches', { paginate: true }).body
```

`graphql` (experimental) runs a query and returns each page's `data`. It returns `null` when the
call failed or any page has `errors` or no `data`: a partial answer is no answer. `nodesAt` joins
one connection's `nodes` across the pages, and is `null` when any page lacks them.

```ts
const query = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes { number title }
    }
  }
}`
const pages = gh.graphql(query, { owner: '{owner}', name: '{repo}' }, { paginate: true })
const prs = nodesAt(pages, ['repository', 'pullRequests'])
```

With `paginate`, the query must take `$endCursor` and page one connection; gh follows only that
one. `graphql` refuses a mutation with `RangeError`; send one through `raw`.

## Repositories and search

```ts
const repos: ListResult<Repository> | null = gh.repoList('acme', { archived: false, limit: 200 })
const repo: Repository | null = gh.repoView('acme/widgets')
const hits: ListResult<PrSearchHit> | null = gh.searchPrs('TICKET-123', { owner: 'acme' })
```

A `Repository` carries `nameWithOwner`, `owner`, `name`, `description`, `defaultBranch`,
`visibility`, `isArchived` and `url`. `gh search prs` has its own field set: a `PrSearchHit` names
its `repository` but has no head or base branch, so it is not a `PullRequest`. Its `state` is
upper-cased to match. The query takes GitHub's search syntax and may start with `-`.

## Injecting the subprocess seam

`Gh` takes a `CommandRunner` from
[`@osdlc/command-seam`](https://github.com/osdlc/osdlc/tree/main/packages/ts/command-seam), so a
suite runs offline:

```ts
const empty: CommandRunner = { run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }) }

new Gh('/repo', { runner: empty }).prList() // { rows: [], truncated: false }
```

This package re-exports `CommandFailed` and the runner and result types (`CommandRunner`,
`AsyncCommandRunner`, `CommandResult`, `CommandRunOptions`), since they appear in its signatures.
Import the runners themselves, such as `spawnRunner` and `spawnRunnerAsync`, from
`@osdlc/command-seam`.

## API

Everything below is exported from `@osdlc/typed-gh`. The Stability section says which items are
experimental.

### Clients

- `Gh`: the synchronous client, bound to one working directory, and optionally a repository and
  host.
- `AsyncGh`: the awaitable client, with the same methods.
- `GhOptions` and `AsyncGhOptions`: the runner, `repo` and `hostname` a client is built with.
- `AsyncCallOptions`: `timeoutMs` and `signal`, accepted by sixteen methods of `AsyncGh`.
- `defaultRunnerFactory` and `RunnerFactory`: how a client makes its default runner for `gh`.

Methods on both clients:

- Escape hatches: `raw` runs any `gh` call and returns the result. `rawChecked` throws on a failed
  exit. `at` returns the same client rooted at another directory, and `withRepo` the same client
  aimed at another repository.
- Pull request queries: `prList`, `prView`, `prFind`, `openPrFor`, `prViewSettled`, `prBody`,
  `prReviewThreads` and `searchPrs`.
- Pull request changes: `createPr`, `editPr`, `editPrBody`, `prComment`, `prUpdateBranch`,
  `prSetDraft`, `prMerge`, `prDiff` and `createReview`.
- Issue and label queries: `issueList`, `issueView` and `labelList`.
- Repository queries: `repoList` and `repoView`.
- Issue and label changes: `setIssueLabel`, `createLabel`, `editLabel` and `issueCommentEdit`.
- REST and GraphQL: `api` is a GET through `gh api` and `graphql` a query; neither throws.
- Setup checks: `installed`, `authenticated`, `authStatus` and `ready`.
- `ownerRepo` reads the owner and repository from a remote URL. It starts no process.

### Verbs

A verb is plain data: argv, a `checked` flag, a `readOnly` flag, optional stdin and environment,
and a `parse` function. `readOnly` is true for every query and `prDiff`, and false for every
mutation, so a caller that keeps an allowlist of safe calls can check a verb before running it.
Each verb takes an optional `GhTarget` last. Each client method has a verb of the same name, except
the escape hatches, `at`, `withRepo`, `prViewSettled`, `openPrFor`, `prFind`, `authenticated`,
`ready` and `ownerRepo`. `openPrsForBranch` is a verb with no method.

- `GhVerb`: the shape of a verb. `GhTarget`: the `repo` and `hostname` a verb talks to.
- Verb builders: `prList`, `prView`, `prBody`, `openPrsForBranch`, `prReviewThreads`, `prDiff`,
  `createPr`, `editPr`, `editPrBody`, `prComment`, `prUpdateBranch`, `prSetDraft`, `prMerge`,
  `createReview`, `issueList`, `issueView`, `labelList`, `setIssueLabel`, `createLabel`,
  `editLabel`, `issueCommentEdit`, `repoList`, `repoView`, `searchPrs`, `api`, `graphql`,
  `installed` and `authStatus`.
- `pickPrForBranch`: the first row whose head branch is exactly the one you name, for rows that
  came from somewhere other than `prList({ head })`, such as a `head:` search.
- `nodesAt`: one connection's nodes, joined across `graphql` pages.
- Field lists: `PR_REF_FIELDS` (enough to identify a PR), `PR_LIST_FIELDS` (for triage),
  `PR_VIEW_FIELDS` (the full set), `REPO_FIELDS` and `SEARCH_PR_FIELDS`.
- Option and result types: `ListResult`, `PrListOptions`, `IssueListOptions`, `RepoListOptions`,
  `SearchPrsOptions`, `CreatePrOptions`, `CreateReviewOptions`, `ReviewComment`,
  `CreateLabelOptions`, `ApiOptions`, `ApiResponse`, `GraphqlOptions`, `GraphqlVariable`,
  `AuthStatus`, `PrMergeMethod` and `ReviewThread`.

### Parsers

- `parsePullRequest`: reads a `gh --json` payload into a `PullRequest`, or `null`.
- `anyCheckFailed`: true if any check in a list failed.
- `normalizeAuthorLogin`: drops a `[bot]` suffix from a login.
- `parseOwnerRepo`: reads a remote URL into `{ owner, repo }`, or `null`.
- `ownerRepoSlug`: writes `{ owner, repo }` as `owner/repo`.
- `parsePrUrl`: reads a pull request URL on any GitHub host into its host, owner, repository and
  number, or `null`.
- `parsePrRef`: reads what a person typed to name a pull request into a `PrRef`, or `null`.

### Types

- Model: `PullRequest`, `Review`, `Comment`, `CheckRun`, `Actor`, `Label`, `IssueRow`,
  `Repository` and `PrSearchHit`.
- Enums: `PullRequestState`, `MergeableState`, `MergeStateStatus`, `ReviewDecision`, `ReviewState`,
  `CheckConclusion` and `RepositoryVisibility`.
- `OwnerRepo`, `PullRequestRef` and `PrRef`: a repository, a pull request in one, and what a person
  typed to name a pull request.

### From the command seam

- `CommandFailed`: thrown by a mutation. It carries the argv and the result.
- `CommandRunner`, `AsyncCommandRunner`, `CommandResult` and `CommandRunOptions`: the runner types
  that appear in signatures.

## Stability

The package is at 0.x. Each item is stable or experimental.

- **Stable** items change only with a minor release, and a breaking change is marked
  **Breaking** in the CHANGELOG.
- **Experimental** items may change or go in any release. Each has an `@experimental` tag in its
  TSDoc.

The experimental items:

- `issueCommentEdit`, the verb and the method on both clients
- `createReview`, the verb and the method on both clients
- `CreateReviewOptions`
- `ReviewComment`
- `graphql`, the verb and the method on both clients
- `nodesAt`
- `GraphqlOptions`
- `GraphqlVariable`

Every other export and method is stable, `prDiff` included.

## Platforms

Supported platforms are listed under [Install](#install). CI runs the tests on macOS and Linux. The package builds `gh` argv as arrays and starts `gh` with no
shell, so nothing in it is specific to one shell.

## What is not here

- **Closing a PR and deleting a branch.** `prMerge` merges and leaves the branch alone. Closing and
  deleting belong to a caller's own policy layer, where the audit trail lives.
- **A full REST or GraphQL client.** `api()` is a GET and `graphql()` a query; anything else goes
  through `raw(["api", …])`.
- **Anything that reads a token.**

## Licence

`MIT OR Apache-2.0`, at your option. See `LICENSE-MIT` and `LICENSE-APACHE`.
