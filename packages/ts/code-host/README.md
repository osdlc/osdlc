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

// Picks the GitHub or Forgejo adapter from the repository's `origin` remote.
const host = selectCodeHost(process.cwd())
const pr = host.getPr(42, { since: null })
console.log(pr?.title, pr?.mergeable)
host.postComment(42, 'Rebased onto main.')
```

Tests pass a fake `CommandRunner` instead, so nothing touches the network.

## Runtime and platform

Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, ESM only; Bun also runs it, through the compiled `dist/`. No `Bun.*` API
is used. The GitHub adapter needs the `gh` CLI on `PATH`, signed
in; the Forgejo adapter needs `curl` and a personal access token in `FORGEJO_TOKEN` (or the variable
named by the `forgejoTokenEnv` option). Both need `git` for drift counts. Linux and macOS are the
tested platforms.

## What is here

| Export | What it is |
| --- | --- |
| `CodeHost` | The port: `listPrs`, `listPrDetails`, `getPr`, `postComment`, `updateBranch`, `parsePrUrl`, `prForBranch`. Every method is synchronous |
| `CodeHostPr`, `PrFacts`, `Activity`, `PrInput`, ... | The normalized shapes the port speaks (`types.ts`) |
| `GithubCodeHost`, `codeHostPrFrom` | GitHub adapter over `@osdlc/typed-gh` |
| `ForgejoCodeHost`, `forgejoPrFrom` | Forgejo adapter over `curl` and the Forgejo REST API; reads its token from `FORGEJO_TOKEN` by default; `forgejoTokenEnv` names another variable |
| `selectCodeHost`, `resolveCodeHost`, `codeHostNameForRemote` | Pick the adapter from the git remote |
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
