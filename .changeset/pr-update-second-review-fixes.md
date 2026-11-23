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

Fixed: a restack child (`--restack`) skipped every kept-tree check, so its
PR was updated and force-pushed even when a person had changed its kept tree.
It is now skipped with `kept worktree ... has local changes`, as any other PR
is, and when its kept tree's owner is gone or another checkout owns the tree.
Only whether the tree is current waits for the parent. The gap dates from
[#926](https://github.com/osdlc/osdlc/pull/926).

A restack child whose target's own attempt record fails while its new key is
looked up is now skipped with the record's error. Before, the failed look-up
read as no record, and the child was updated and pushed anyway.

Before taking a clone's lock, `update` checks the `<host>` and `<owner>`
folders above it and makes the missing ones one level at a time, each under a
folder that passed the check. A `<host>` folder that is a symbolic link no
longer has a folder made where it points, and a folder that cannot be written
skips the target with why, where before the run ended with `EACCES`.

A kept worktree is no longer removed from a folder someone else can write
to. `mirror prune --discard-kept` leaves such a tree, and its clone, with the
folder's problem and the `chmod` that fixes it; `update` leaves it too, saying
why in `keptRefused` or in the PR's skip. A host's `Ports.targetHome` may give
`keptRoot`, the folder of its own that holds the kept trees, which the check
starts from.

`survey` no longer fails when a prune removes a managed clone just before the
survey takes its lock. The clone is checked again under the lock; a clone that
is gone is reported unmeasured with a note, where before the survey ended with
`ENOENT` writing its last-used stamp.

The pruning at the end of an `update --apply` now also runs when a located
target's run worktree was made in the cache but none of its PRs got a result,
as when every lease was refused. The report says so in the new
`madeTargetWorktree`.
