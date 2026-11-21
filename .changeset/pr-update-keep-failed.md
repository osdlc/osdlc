---
'@osdlc/pr-update': minor
---

`update --apply --keep-failed` (or `pr_update.keep_failed: true`) moves the worktree of a PR that ended `conflict` or `failed` to `.pr-update/failed/<owner>-<name>-<number>/`, on a branch named for the PR, with a failed verify's log in `.pr-update-verify.log`. The result gains `keptWorktree` and the text names it. A later run skips that PR (`failed worktree kept at <path>`) until its head or base moves; `--retry-failed` and `--discard-kept` remove kept worktrees.
