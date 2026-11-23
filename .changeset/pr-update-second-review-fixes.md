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

Fetching a checkout found on the machine, or a managed clone, no longer
writes any ref but the remote's branches under `origin/*`. A checkout whose
own `remote.origin.fetch` had a forced line into `refs/heads/` (such as
`+refs/heads/topic:refs/heads/topic`) had that local branch overwritten,
losing commits not yet pushed. The fetch now passes `--refmap=`.

A checkout found on the machine is fetched with `--no-prune`, so a
`fetch.prune` or `remote.origin.prune` in its config no longer deletes refs
its own fetch lines keep under `origin/`, such as `origin/pr/*`.

A managed clone is no longer used when others can write to it. A new clone
has write for group and others taken off everything in it before it is put in
place, so a umask of `000` or `002` no longer leaves it open. An existing
clone whose folder or `config` others can write to, or whose `config` is a
symbolic link, is skipped with the fix to run, as the folders above it
already were.
