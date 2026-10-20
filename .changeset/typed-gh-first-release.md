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
