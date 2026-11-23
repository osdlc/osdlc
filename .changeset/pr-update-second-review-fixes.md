---
"@osdlc/pr-update": patch
---

A kept worktree's record no longer decides what is deleted. In a checkout the
records are in `.pr-update/failed/`, inside the working tree, so a repository
could commit one that named another repository's git directory and a branch
there, and the next `update --apply` deleted that branch. Now a record is
refused when its branch is not `pr-update/failed-<owner>-<name>-<number>`, its
path is not that PR's kept folder, it names a git directory from a checkout's
own folder, or `git worktree list` does not show its folder on its branch. A
refused record and its folder are left alone, listed in the new `keptRefused`
output, and the PR is updated as if nothing were kept.
