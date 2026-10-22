# @osdlc/code-host

The CodeHost port: what a code host must answer about pull requests, plus the
GitHub and Forgejo adapters behind it.

Callers that need PR facts (a classifier, a router, an orchestrator tick) ask
the port instead of calling `gh` or a REST API themselves, so a second host is
a new adapter and not a rewrite of every caller.

## Install

```sh
npm install @osdlc/code-host
```

ESM only. Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of its
dependency `@osdlc/typed-git` (which takes it from `hosted-git-info`).

`pnpm add @osdlc/code-host` and `yarn add @osdlc/code-host` work too.

## Quick start

```ts
import { selectCodeHost } from '@osdlc/code-host'
import { describe, FailureError } from '@osdlc/result'

// Picks the GitHub or Forgejo adapter from the repository's `origin` remote.
const selected = selectCodeHost(process.cwd())
if (!selected.ok) throw new FailureError(selected.error)
const host = selected.value

const pr = host.getPr(42, { since: null })
if (pr.ok) console.log(pr.value?.title, pr.value?.mergeable)
else console.error(describe(pr.error)) // "gh is not signed in to GitHub. Run `gh auth login`."

host.postComment(42, 'Rebased onto main.')
```

Tests pass a fake `CommandRunner` instead, so nothing touches the network.

## Failures

A query that can fail returns a `Result<T, CodeHostFailure>` from
[`@osdlc/result`](../result#readme). The failure has a `kind` to branch on, a
`message` and a `hint` for a person, the `host` that failed, and the tool's
own output as `detail`. Both adapters report the same kinds, so a caller
handles "not signed in" once. A declared absence is still a success: `getPr`
of a number that does not exist, and `prForBranch` of a branch with no PR,
answer `{ ok: true, value: null }`. A Forgejo `getPr` whose comments, reviews or
status call fails is a failure, never a PR with no checks or no reviews.

| `kind` | Means | `hint` |
| --- | --- | --- |
| `not-installed` | `gh` or `curl` is not on `PATH` | GitHub: install `gh` and run `gh auth login`; Forgejo: "Install curl." |
| `not-authenticated` | `gh` is signed out, or Forgejo answered 401 or 403 | "Run `gh auth login`." / "Set `FORGEJO_TOKEN` to a valid token." (the variable `forgejoTokenEnv` names) |
| `network` | the host could not be reached (DNS, connect, TLS) | "Check your network connection ..." |
| `not-found` | no such repository, or hidden from this account (404) | "Check the repository name ..." |
| `rate-limited` | the API limit was reached (429) | "Wait a few minutes and try again." |
| `timeout` | the tool or request ran out of time | |
| `http` | any other HTTP error status; the status is in `status` and `detail` | |
| `unreadable` | the host answered, but the answer could not be read | |
| `unsupported` | the host has no such feature (`reviewThreads` on Forgejo) | |
| `no-remote`, `bad-remote`, `missing-token` | `selectCodeHost` could not build a Forgejo adapter | |
| `not-executable`, `bad-cwd`, `output-cap`, `signal`, `aborted`, `spawn`, `exit` | the subprocess layer's own kinds, passed through | |

On GitHub the failure's `cause` is `@osdlc/typed-gh`'s `GhFailure`; on Forgejo
it is `@osdlc/command-seam`'s `CommandFailure` for a curl that failed. A
mutation (`postComment`, `updateBranch`, ...) throws on failure instead: a
`FailureError` carrying the same `CodeHostFailure`, or `CommandFailed`. Both
are `FailureError`s, so `@osdlc/cli-tool`'s `runMain` prints them uniformly.

`selectCodeHost` returns a `Result<CodeHost, CodeHostFailure>` too (see
[D-01](docs/planning/decisions/D-01-port-queries-return-a-result.md)).

## Runtime and platform

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, ESM only; Bun also runs it, through the compiled `dist/`. No `Bun.*` API
is used. The GitHub adapter needs the `gh` CLI on `PATH`, signed
in; the Forgejo adapter needs `curl` and a personal access token in `FORGEJO_TOKEN` (or the variable
named by the `forgejoTokenEnv` option). Both need `git` for drift counts. Linux and macOS are the
tested platforms.

## What is here

| Export | What it is |
| --- | --- |
| `CodeHost` | The port: `listPrs`, `listPrDetails`, `getPr`, `postComment`, `updateBranch`, `parsePrUrl`, `prForBranch`. Every method is synchronous; queries return a `Result` |
| `CodeHostFailure`, `CodeHostFailureKind` | The classified failure the queries report (see Failures) |
| `CodeHostPr`, `PrFacts`, `Activity`, `PrInput`, ... | The normalized shapes the port speaks (`types.ts`) |
| `GithubCodeHost`, `codeHostPrFrom` | GitHub adapter over `@osdlc/typed-gh` |
| `ForgejoCodeHost`, `forgejoPrFrom` | Forgejo adapter over `curl` and the Forgejo REST API; reads its token from `FORGEJO_TOKEN` by default; `forgejoTokenEnv` names another variable |
| `selectCodeHost`, `resolveCodeHost`, `codeHostNameForRemote` | Pick the adapter from the git remote; `selectCodeHost` returns a `Result` |
| `githubAuthChecks`, `forgejoAuthChecks`, `authChecksFor` | The auth probes a doctor command runs |
| `assemblePrFacts` | Adds local-git drift (`behind`/`ahead`) to a `CodeHostPr` |
| `parsePrInput` | Parse a PR argument: a number, `#n`, `owner/repo#n`, or a URL |

## Boundaries

- Every shell-out goes through a `CommandRunner` from `@osdlc/command-seam`
  that the caller injects (`selectCodeHost` builds the default one). Tests pass
  fakes; nothing here touches the network.
- Git and GitHub access goes through `@osdlc/typed-git` and `@osdlc/typed-gh`.
- No verdicts. Classifying a PR stays with the caller; this package only
  produces the facts it reads.

## Not here yet

The port has no write verbs beyond `postComment`, `updateBranch`, `createPr`,
`setDraft`, `updateComment` and `mergePr`. `editPrBody`, `postReview` and
`replyToThread` are the next additions.

## When not to use

- You only target GitHub and want the full API surface: use octokit.
- You run one-off scripts: call `gh` directly.
- You need an async API: every method here is synchronous by design.
- You need a host other than GitHub or Forgejo (GitLab, Bitbucket): there is no
  adapter yet.

## How it compares

From the author's knowledge, and possibly out of date. octokit is the
full-featured GitHub client, but it speaks only GitHub and handles credentials
itself. The `gh` CLI covers GitHub only and has no stable programmatic
interface beyond its `--json` output. This package is a small port with two
adapters, so a caller written against `CodeHost` does not change when the host
does. It reads no token for GitHub (`gh` finds its own) and runs every
subprocess through an injected runner, which makes callers testable offline.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
