# @osdlc/typed-gh

`gh --json` returns loose JSON, and a failed call returns an exit code. Code that reads a field it
never asked for, or treats a failed call as "nothing found", goes wrong without a sound. This
package wraps `gh` in typed calls. They return a complete model and tell "we could not ask" apart
from "there is nothing".

It is for TypeScript code that runs where `gh` is installed and signed in: developer tools, CI
scripts, release bots and coding agents.

A typed GitHub client for TypeScript, over the `gh` CLI. The GitHub-side companion
of [`@osdlc/typed-git`](https://github.com/osdlc/osdlc/tree/main/packages/ts/typed-git).

## Install

```sh
npm install @osdlc/typed-gh
```

It needs Node 22 or later (or Bun), and the `gh` CLI on `PATH`, signed in with `gh auth login`.
It is supported on macOS and Linux. Windows is not supported yet; it will be once a Windows CI job
runs the tests.

```ts
import { Gh, type PrListOptions, type PullRequest } from '@osdlc/typed-gh'

const gh = new Gh(process.cwd())

const filter: PrListOptions = { state: 'open', base: 'main' }
const prs: PullRequest[] = gh.prList(filter) ?? []
```

The `examples` folder in the repository runs the same calls as tests.

## When not to use it

- **`gh` is not installed.** In a browser or a serverless function, use an HTTP client such as
  Octokit.
- **You sign in with a token, a GitHub App or OAuth.** This package reads no token.
- **You make many calls or poll in a loop.** Each call starts a `gh` process.
- **You need the whole API typed.** This package covers the calls listed below. `api()` is a GET.
  Anything else goes through `raw`.

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

Absent and unknowable are the same answer to a caller, so they get one
representation. This is what stops a consumer reading a field it never
requested as a fact.

Most enums are open — unions ending in `(string & {})` — because GitHub adds
members, and a client that crashes on an unrecognized one is worse than a
client that carries it through. Two are closed: `MergeableState`
(`MERGEABLE`, `CONFLICTING`, `UNKNOWN`) and `ReviewDecision` (`APPROVED`,
`CHANGES_REQUESTED`, `REVIEW_REQUIRED`, `null`). A value GitHub adds to either
reads as `UNKNOWN` or `null`, so a check that decides whether to merge can
match every member.

## Three modes, so failure is never ambiguous

| | on failure |
| --- | --- |
| **queries** | return the absence value — `null`. Never throw. |
| **mutations** | throw `CommandFailed`, carrying argv and the full result. |
| **`raw(argv)`** | hand back the raw `CommandResult`; you decide. |

A query returns `null`, never `[]`. `prList()` returning `[]` means *this
repository has no open PRs*; `null` means *we could not ask*. Collapsing those
turns an expired credential into "nothing to do".

## Two shape hazards it absorbs

**Author logins differ by transport.** GraphQL (`gh pr view --json`) returns a
suffix-less login (`github-actions`); REST (`gh api`) returns the suffixed one
(`github-actions[bot]`). Comparing one against the other silently never
matches — which is how bot noise gets treated as human review feedback.
Logins are normalized to the suffix-less form once, when a payload is parsed.

**`statusCheckRollup` holds two node types.** A modern `CheckRun` carries
`name`/`status`/`conclusion`; a legacy `StatusContext` carries
`context`/`state`. Both are folded onto one `verdict` axis:

```ts
const checks: CheckRun[] = parsePullRequest(payload)?.checks ?? []

checks.every((c) => c.verdict === 'success')
anyCheckFailed(checks)
```

A check still running is `pending`, never `success`. Reading "no failure yet"
as green is how a red build merges.

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
const triage: IssueRow[] | null = gh.issueList({ label: 'status:triage', limit: 50 })
gh.setIssueLabel(7, 'status:triage', 'status:define')

const labels: Label[] | null = gh.labelList({ limit: 100 })
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

The queries `raw`, `rawChecked`, `prList`, `prView`, `openPrFor`, `prViewSettled`, `prBody`, `api`,
`labelList`, `issueList` and `issueView` also take `AsyncCallOptions`: `timeoutMs` and an
`AbortSignal` in `signal`.

`api(endpoint, opts)` (on `Gh` and `AsyncGh`) is a REST GET through `gh api`.
It never throws; the result is `{ ok, status, etag, body, malformed, stderr, error? }`.
`stderr` is gh's own; `error` holds the runner's message when gh never ran or
was stopped (a missing binary, a timeout).
Pass `etag` for a conditional request (`If-None-Match`; a 304 comes back as
`status: 304, body: null`), or `includeHeaders: true` to read status and ETag
without one. `{owner}` and `{repo}` in the endpoint are filled in by gh.

## Injecting the subprocess seam

`Gh` takes a `CommandRunner` from
[`@osdlc/command-seam`](https://github.com/osdlc/osdlc/tree/main/packages/ts/command-seam), so a
suite runs offline:

```ts
const empty: CommandRunner = { run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }) }

new Gh('/repo', { runner: empty }).prList() // []
```

This package re-exports `CommandFailed` and the runner and result types (`CommandRunner`,
`AsyncCommandRunner`, `CommandResult`, `CommandRunOptions`), since they appear in its signatures.
Import the runners themselves, such as `spawnRunner` and `spawnRunnerAsync`, from
`@osdlc/command-seam`.

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

Every other export and method is stable, `prDiff` included.

## Platforms

macOS and Linux are supported, and CI runs the tests on both. Windows is not supported yet. It will be
added together with a Windows CI job. The package builds `gh` argv as arrays and starts `gh` with no
shell, so nothing in it is specific to one shell.

## What is not here

- **Closing a PR and deleting a branch.** `prMerge` merges and leaves the branch alone. Closing and
  deleting belong to a caller's own policy layer, where the audit trail lives.
- **A full REST client.** `api()` is a GET; anything else goes through
  `raw(["api", …])`.
- **Anything that reads a token.**

## Licence

`MIT OR Apache-2.0`, at your option. See `LICENSE-MIT` and `LICENSE-APACHE`.
