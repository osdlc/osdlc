---
"@osdlc/pr-update": patch
---

A person's work in a kept worktree or a managed clone is never removed:

- `pr-update mirror prune` leaves a clone that holds a local branch with
  commits no remote-tracking branch has, a stash, or notes, in `--dry-run`
  too. The message names them and how to push or remove them.
- A kept worktree whose folder is missing (on a drive that is not mounted,
  say) stays with its clone, locked or not, until you mount it or run
  `git worktree prune` in the clone.
- A kept worktree you locked with `git worktree lock` is never removed, folder
  included: `--discard-kept`, `--retry-failed` and a PR that moved all leave
  it. Before, its folder was deleted even though git refused to remove it.
- In a managed clone, a stash counts as a change to a kept worktree, so it is
  not discarded as stale.
- A keep no longer repoints a `pr-update/failed-*` branch that is already
  there and is not the old kept tree's (`git checkout -b`, not `-B`). The
  keep fails with a note instead, and a keep that is undone deletes the branch
  only if it made it.
