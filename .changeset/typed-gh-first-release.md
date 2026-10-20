---
'@osdlc/typed-gh': minor
---

First public release. `@osdlc/typed-gh` is a typed GitHub client over the `gh` command line: it reads `gh` output into a total model, builds `gh` calls as plain data, and offers a synchronous and an awaitable client. It reads no token; sign-in is `gh`'s.

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
