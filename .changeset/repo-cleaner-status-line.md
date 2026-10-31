---
'@osdlc/repo-cleaner': minor
---

A status line on stderr while a run works: which repository (`[2/5]` in a run of several), and which step — reading the repository, fetching, listing pull requests (gh), checking worktrees, local or remote branches with a count (`37/427`) — and, in `apply`, the re-check and each delete step. It is drawn only when stderr is a terminal, erased before any other output, and turned off with `--no-progress`.

Library: `SweepOptions.onProgress` receives a `SweepProgress` before each step and each item; `ApplyOptions.onSweepProgress` and `onStep` do the same for `applyPlan`.
