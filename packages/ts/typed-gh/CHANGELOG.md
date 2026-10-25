# @osdlc/typed-gh

## 0.9.5

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0
  - @osdlc/typed-git@0.8.1

## 0.9.4

### Patch Changes

- Updated dependencies [1a44195]
  - @osdlc/typed-git@0.8.0

## 0.9.3

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0
  - @osdlc/typed-git@0.7.2

## 0.9.2

### Patch Changes

- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0
  - @osdlc/typed-git@0.7.1

## 0.9.1

### Patch Changes

- 96385dc: An empty `hostname` now means no host, the same as leaving it out. It used to throw `RangeError`, so a caller that reads the host from its own config had to write `hostname: value || undefined`. Passing `hostname: 'github.com'` is unchanged: it still reaches gh as given, because naming github.com explicitly keeps a call there when `GH_HOST` or gh's default host points at another host. The README now says so.

## 0.9.0

### Minor Changes

- cc2abe4: `api` now keeps GitHub's error body when a request fails. `body` is parsed even when gh exits with an error, and a new `message` field holds `body.message`. `ApiResponse` gains this `message` field as required. `malformed` is now also set when a failed call prints something that is not JSON. The docs now say that `status` is only filled in when headers were requested.

### Patch Changes

- 72f5049: `prList` always requests the `number` field. Before, a `fields` list without `number` returned no rows.
- Updated dependencies [b5aac07]
- Updated dependencies [41ef520]
  - @osdlc/typed-git@0.7.0

## 0.8.0

### Minor Changes

- ae400e5: Added `runVerb` and `runVerbAsync`, with `RunVerbOptions` and `RunVerbAsyncOptions`. They run one verb through a runner the caller owns and apply what the verb carries: `env` (the target host, as `GH_HOST`, for `repoList` and `searchPrs`), `input` (the payload `createReview` sends on stdin), `timeoutMs` and the checked contract. Running `verb.parse(await run(verb.argv))` yourself dropped `env` and `input` without an error. `Gh` and `AsyncGh` now call them, so there is one copy of that logic.

## 0.7.0

### Minor Changes

- d9b0f77: **Breaking:** the plain door throws the classified failure. A failed `gh` (a mutation, `prDiff`, `rawChecked`, a query) now throws a `FailureError` whose `failure` is the `GhFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` only had command-seam's generic `exit` kind, so a signed-out `gh` during a write exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.
  
  **Breaking:** the single-thing queries no longer treat every `Could not resolve to a …` as absence. `prView` answers `null` only for a missing pull request, `issueView` only for a missing issue and `repoView` only for a missing repository; a mistyped `--repo` is now a `not-found` failure, and a bare `HTTP 404` is a failure. The absence test reads stderr and stdout, as the classifier does.
  
  An `HTTP 403` is now `not-authenticated` (SAML, a missing scope), the same as Forgejo's 401 and 403, unless the text says it is a rate limit, which stays `rate-limited`. The `try` and `soft` doors recognise a thrown failure by shape, so two installed copies of `@osdlc/command-seam` or `@osdlc/result` agree.
- d9b0f77: `Gh` and `AsyncGh` get `typed-git`'s three doors. **Breaking:** a query no longer answers `null` for a failure. The plain method returns its value or throws `CommandFailed` (a `FailureError` carrying a `GhFailure` of kind `unreadable` when `gh` exited 0 but its output could not be read). A query for one thing (`prView`, `issueView`, `repoView`, and `prFind`, `openPrFor`, `prViewSettled` over them) still answers `null` when GitHub says there is no such thing. `prList`, `prBody`, `graphql`, `labelList`, `issueList`, `repoList`, `searchPrs` and `prReviewThreads` now return a non-null value and throw. `installed`, `authenticated`, `authStatus`, `ready` and `api` are unchanged: their failure is part of their value.
  
  New: `gh.try.*` returns `Result<T, GhFailure>` from `@osdlc/result`; `gh.soft.*` returns `null` for a failed query, which is the old query behaviour, now opt-in (`TriedSync`, `TriedAsync`, `Soft`). `GhFailure` carries a `kind`, a one-line `message`, a `hint` for a person, `detail`, `argv`, `exitCode` and the `CommandFailed` as `cause`. `GhFailureKind` is every `@osdlc/command-seam` kind plus `not-authenticated`, `network`, `not-found`, `rate-limited` and `unreadable`, read from `gh`'s stderr. `classifyGhFailure(commandFailed)` is exported. `@osdlc/result` is now a dependency.

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
  - @osdlc/command-seam@0.9.0
  - @osdlc/typed-git@0.6.0
  - @osdlc/result@0.1.0

## 0.6.0

### Minor Changes

- d558059: Reach a repository without a clone, find a pull request from what a person typed, read every page of a list, and list repositories and search pull requests. Some changes break callers of 0.5. They are marked `Breaking:`.
  
  - `Gh` and `AsyncGh` take optional `repo` (`owner/name`) and `hostname` options, and `withRepo(repo)` returns the same client aimed at another repository. The target goes into each call's argv: `--repo host/owner/name` on `pr`, `issue` and `label` calls, `--hostname` and a filled `{owner}/{repo}` on `api` calls, and `--hostname` on `authStatus`. Every verb builder takes an optional `GhTarget` as its last argument. An invalid `repo` or `hostname` throws `RangeError`.
  - `hostname` is any GitHub host: `github.com`, GitHub Enterprise Server, or a `<tenant>.ghe.com` host.
  - Breaking: `parsePrUrl` accepts any GitHub host and returns `hostname` in its `PullRequestRef`. Before, it returned null for a host other than `github.com`.
  - `prView` takes a number, a branch or a URL. A URL is passed without the client's target. A string that starts with `-` throws `RangeError`.
  - `prFind(input)` returns the one PR that `input` names, and `parsePrRef(input)` reads it without running `gh`: `42`, `#42`, `owner/name#42`, a URL, or a branch name. Bare digits are a number first and then a branch. A branch gives its open PR, else its newest closed or merged one.
  - Breaking: `prList({ head })` matches the head branch exactly, through `gh pr list --head`. Before, it passed `--search head:<branch>`, which matched by prefix.
  - Breaking: `prList`, `issueList` and `labelList` return `{ rows, truncated } | null` instead of an array or null. Each asks `gh` for one row more than `limit`, and `truncated` is true when it came back. A `limit` that is not a positive integer throws `RangeError`. `openPrsForBranch` returns the same shape. The new `ListResult` type names it.
  - `api` takes `paginate: true` to fetch every page; pages of arrays are joined into one `body`. With `etag` or `includeHeaders` it throws `RangeError`. An endpoint that starts with `-` throws `RangeError`.
  - `graphql(query, variables, { paginate })` runs a GraphQL query and returns each page's `data`, or null when the call failed or any page has `errors` or no `data`. It refuses a mutation. `nodesAt(pages, path)` joins one connection's nodes across pages. Both are experimental, with `GraphqlOptions` and `GraphqlVariable`.
  - Every `GhVerb` carries `readOnly`: true for every query and `prDiff`, false for every mutation. `GhVerb` also has an optional `env`.
  - `repoList(owner)` and `repoView(repo?)` return the new `Repository` type. `searchPrs(query)` returns `PrSearchHit` rows, since `gh search prs` has its own field set. `REPO_FIELDS` and `SEARCH_PR_FIELDS` name their fields. `gh repo list` and `gh search` take no host flag, so the host reaches them as `GH_HOST`.
  - New types: `GhTarget`, `GhOptions`, `AsyncGhOptions`, `ListResult`, `PrRef`, `Repository`, `RepositoryVisibility`, `PrSearchHit`, `RepoListOptions` and `SearchPrsOptions`.

### Patch Changes

- Updated dependencies [4d13bd9]
  - @osdlc/typed-git@0.5.3

## 0.5.0

### Minor Changes

- ac5f0d1: First public release. `@osdlc/typed-gh` is a typed GitHub client over the `gh` command line: it reads `gh` output into a total model, builds `gh` calls as plain data, and offers a synchronous and an awaitable client. It reads no token; sign-in is `gh`'s.
  
  - The typed model: `PullRequest`, `Review`, `Comment`, `CheckRun`, `Actor`, `Label` and `IssueRow`, with their enums. A field a query did not ask for takes its "not known" value. Check results fold onto one verdict.
  - `Gh`, a synchronous client, and `AsyncGh`, an awaitable client with the same methods. Queries return parsed values, or null when `gh` could not answer, and never throw. Mutations throw `CommandFailed`. `raw` and `rawChecked` run any `gh` call.
  - Pull requests: list, view, create, edit, comment, diff, review, update the branch, mark ready or draft, merge on a known head, and read review threads. `prViewSettled` asks again while GitHub computes the merge state.
  - Issues and labels: list and view issues, swap an issue's label, and list, create and edit labels.
  - `api`: a REST GET through `gh api` that never throws; failure is `ok: false`.
  - Setup checks: `installed`, `authenticated`, `authStatus` and `ready`.
  - Every call is also a verb: plain data (argv, a checked flag, optional stdin and a parser) that a caller runs on its own runner.
  - Parsers for repository and pull request URLs.
  - `issueCommentEdit` and `createReview`, with `CreateReviewOptions` and `ReviewComment`, are experimental (see the README's Stability section).
  - ESM with `.d.ts` types, for Node 22 or newer and Bun, on macOS and Linux. Licence `MIT OR Apache-2.0`.
  
  Changes since 0.4.1:
  
  - Breaking: four verbs are renamed. `labelCreate` is `createLabel`, `labelEdit` is `editLabel`, `reviewCreate` is `createReview`, and `version` is `installed`.
  - Breaking: these are no longer exported: `needsMergeStateRetry`, `parseActor`, `parseCheckRun` and `PullRequestJson`. The `asAsync` helper is gone too.
  - Breaking: the `command-seam` re-exports are removed: `runChecked`, `runCheckedAsync`, `spawnRunner` and `spawnRunnerAsync`. Import them from `@osdlc/command-seam`.
  - Changed: `createPr` returns the last URL line of `gh` output. It returns `''`, and does not throw, when `gh` printed no URL.
  - Changed: `issueCommentEdit` throws `RangeError` for a comment id that is not all digits. The async client rejects with it.
  - Fixed: a login that is only `[bot]` now reads as `null`.
  - Fixed: `api` with headers reads the last header block if `gh` prints more than one.

### Patch Changes

- Updated dependencies [ac5f0d1]
  - @osdlc/command-seam@0.8.0
  - @osdlc/typed-git@0.5.2

## History before the first public release

These versions were never published. They are rebuilt from the git history.
The first release on npm is 0.5.0, and its entry is added above this section
when it is released.

### [0.4.1] - 2026-10-16 (unpublished)

#### Added

- `prSetDraft(number, draft)`: mark a pull request ready for review, or convert it back to a draft.
- `issueCommentEdit(commentId, body)`: rewrite one conversation comment.
- `prMerge(number, { method, headSha })`: merge by squash, merge commit or rebase. GitHub refuses
  the merge when the head is no longer `headSha`. The branch is not deleted.
- `prReviewThreads(number)`: a pull request's review threads, each with resolved, outdated and
  last-author fields. It returns null when the threads cannot be read in full, for example when
  there are more than 100.
- Each of the four is a verb, a `Gh` method and an `AsyncGh` method.

### [0.4.0] - 2026-10-14 (unpublished)

#### Added

- `ApiResponse.error`: the runner's own message when `gh` never ran or was stopped, for example a
  failed start or a timeout.

#### Changed

- Breaking: `ApiResponse.stderr` holds the output of `gh` only. Read `error` for a runner failure.
- `AuthStatus.detail` falls back to the runner's error when `gh` printed nothing on stderr.

### [0.3.2] - 2026-10-11 (unpublished)

#### Added

- `prDiff(number)`: a pull request's unified diff as text.
- `Gh.createReview` and `AsyncGh.createReview`, with a matching verb: post a review of kind
  `COMMENT` with inline comments. They return the review's URL.
- `GhVerb.input`: text written to the child's stdin, for a verb whose payload is too large for argv.

#### Changed

- `prComment` returns the new comment's URL, or an empty string when `gh` printed none.

#### Fixed

- `prView` always asks for `number`. A field subset that left it out no longer reads as "no such
  pull request".

### [0.3.1] - 2026-10-10 (unpublished)

#### Added

- `AsyncGh`: an awaitable client with the same methods as `Gh`.
- `api(endpoint, opts)`: a REST GET through `gh api`. It never throws; failure is `ok: false`.
- `prBody`, `editPrBody`, `prComment` and `prUpdateBranch`, as verbs and as client methods.
- The async runner types and helpers are re-exported beside the sync ones.
- `Gh` and `AsyncGh` accept an explicit `runner: undefined`, the same as leaving it out.

### [0.3.0] - 2026-10-06 (unpublished)

#### Added

- `Gh.authStatus()`: login state and what `gh auth status` printed.

#### Changed

- Breaking: the `authStatus` verb returns `AuthStatus { ok, detail }` instead of a boolean. Read
  `.ok` for the old answer.

### [0.2.0] - 2026-10-01 (unpublished)

#### Changed

- Breaking: `openPrFor(branch, limit)` became `openPrFor(branch, { limit, fields })`. Pass the limit
  in the options object.

### [0.1.5] - 2026-09-27 (unpublished)

#### Added

- `id` on `Comment` and `Review`, and `url` on `CheckRun`.

### [0.1.4] - 2026-09-27 (unpublished)

#### Added

- Label and issue support: verbs and `Gh` methods to list, create and edit labels, to list and view
  issues, and `setIssueLabel` to swap an issue's label in one call. The `IssueRow` type.

#### Changed

- `Label` carries `color` and `description`.

### [0.1.3] - 2026-09-12 (unpublished)

#### Added

- `Gh.installed()` and `Gh.authenticated()`, to tell a missing `gh` from a signed-out one.

### [0.1.2] - 2026-09-10 (unpublished)

#### Added

- `prList({ repo })`: list the pull requests of a repository this machine has no checkout of.

### [0.1.1] - 2026-09-10 (unpublished)

#### Added

- `parsePrUrl` and the `PullRequestRef` type: read `{ owner, repo, number }` from a GitHub pull
  request URL.
- `isCrossRepository` on `PullRequest`.

### [0.1.0] - 2026-09-01 (unpublished)

#### Added

- The typed model: `PullRequest`, `Review`, `Comment`, `CheckRun`, `Actor` and `Label`. A field a
  query did not ask for takes its "not known" value.
- `prList`, `prView` and `editPr`, and `prViewSettled`, which asks again while GitHub is still
  computing the merge state.
- Check results folded onto one verdict: `pending`, `success`, `failure` or `neutral`.
  `ACTION_REQUIRED` counts as neutral.
- `normalizeAuthorLogin`, `parseOwnerRepo` and `PR_REF_FIELDS`.
- Pure argv builders and parsers, so a caller can drive them with its own runner.
