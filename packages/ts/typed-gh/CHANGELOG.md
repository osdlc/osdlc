# Changelog

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
