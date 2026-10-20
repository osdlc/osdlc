---
type: decision
state: accepted
created: 2026-10-19
---

# A merge names the head it judged

## Decision

- `prMerge(number, { method, headSha })` requires `headSha`. It runs
  `gh pr merge <n> --<method> --match-head-commit <sha>`.
- GitHub refuses the merge when the head of the PR is no longer that sha.
  The call then throws `CommandFailed`.
- `method` is `squash`, `merge` or `rebase`, with no default.
- The call never passes `--delete-branch`. The caller deletes the branch.

## Why

- A push can land between the check that approved a PR and the merge. Without
  the sha, that push merges unreviewed.
- The check and the merge are separate calls. Only the caller knows which
  commit it judged, so the caller has to say so.
- A merge method changes history. A default would choose it for the caller.

## Consequences

- A caller reads `headRefOid` when it judges the PR, and passes that value.
  `prView` returns it.
- A refused merge is an expected outcome when someone pushes. The caller
  re-judges the PR and tries again.
