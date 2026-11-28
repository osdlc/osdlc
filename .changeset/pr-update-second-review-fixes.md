---
"@osdlc/pr-update": minor
---

Fixed: a kept worktree's record no longer decides what is deleted. Its
records were in `.pr-update/failed/`, inside the working tree, so a repository
could commit one that named another repository's git directory and a branch
there, and the next `update --apply` deleted that branch. Records now live in
pr-update's state directory, and a record is refused when its branch is not
`pr-update/failed-<owner>-<name>-<number>`, its path is not a folder directly
in its repository's run worktrees, its folder is a symbolic link, or
`git worktree list` does not show a worktree at its folder, or shows it on a
run's scratch branch. A refused record and its folder are left alone, listed
in the new `keptRefused` output, and the PR is updated as if nothing were
kept. A kept tree git will not remove (a locked one) is listed in the new
`keptLeft`, its PR is skipped, and the run exits 1. Every removal of a kept
tree, including a new keep replacing the PR's old tree, first checks the
folders it is in.

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

A restack child whose target's own attempt record fails while its new key is
looked up is skipped with the record's error.

Before taking a clone's lock, `update` checks the `<host>` and `<owner>`
folders above it and makes the missing ones one level at a time, each under a
folder that passed the check. A `<host>` folder that is a symbolic link no
longer has a folder made where it points, and a folder that cannot be written
skips the target with why, where before the run ended with `EACCES`.

A kept worktree is never removed from a folder someone else can write to.
`mirror prune --discard-kept` leaves such a tree, and its clone, with the
folder's problem and the `chmod` that fixes it; `update` leaves it too, saying
why in `keptRefused` or in the PR's skip. A host's `TargetHome` may give
`worktreesRoot`, the folder of its own that holds the run worktrees, which the
check starts from.

When a prune removes a managed clone just before `survey` takes its lock, the
clone is checked again under the lock, and one that is gone is reported
unmeasured with a note.

The pruning at the end of an `update --apply` also runs when a located
target's run worktree was made in the cache but none of its PRs got a result,
as when every lease was refused. The report says so in the new
`madeTargetWorktree`.

The folder check before a removal compares the cache or state directory by its
real path, so a directory reached through a symbolic link still has every
folder between it and the tree checked, and a tree that is not under it is
left.

A managed clone is made in a staging folder only its user can open, then
hardened and moved into place, with git's background maintenance turned off
in it (`maintenance.auto=false`, `gc.auto=0`), so no git process writes in it
while it is hardened or after. The `pr-update` command takes write for group
and others out of its umask when it starts, so it and the commands it runs
never create a file others can write to. A host that calls `runUpdate`
directly keeps its own umask.

After each fetch of a managed clone, while it holds the clone's lock,
pr-update runs `git maintenance run --auto` in the foreground, so a clone
used every day is still repacked though nothing runs in the background there.
