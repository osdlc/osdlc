---
"@osdlc/pr-update": minor
---

**Breaking:** the project root's run worktrees, kept worktrees and file attempt records moved out
of `<root>/.pr-update/` to the same places every `--repo` target already used, keyed by
`<host>/<owner>/<name>`: run worktrees under `worktrees/` in pr-update's cache directory, and
attempt records under `attempts/` in its state directory. A failed PR's kept worktree is no longer
moved anywhere: it stays where it ran, a run worktree folder in `worktrees/`, on its PR's branch,
and its record in `kept/` in the state directory names it. So a kept tree is on the filesystem it
ran on, a PR with submodules can be kept, and a cache cleaner that empties the cache removes kept
trees too. The project
root now gets only git records (worktree registrations, `pr-update/*` branches and, with
`attempts.store: git-ref`, refs on its remote). An existing `.pr-update/` is neither read, moved nor
deleted; `update` prints one note that it is no longer used and can be deleted.

**Breaking**, for library hosts: `Ports` gains a required `targetHome(target)`, asked about every
target, the project root included (`TargetCheckout.source` can be `'root'`). It returns where
that repository's run worktrees, kept-tree records, attempts and lease go (`TargetHome`, with
`worktreesRoot` for the folder check). `Ports.attempts` and `Ports.lease` still win for the
project root where set. The `attemptsDir` export is gone.

**Breaking:** a kept worktree is pr-update's, whatever is in it. When its PR's head or base moves
it is removed even if you changed or committed in it, where before that PR was skipped with
`has local changes`; `--retry-failed`, `--discard-kept` and `mirror prune --discard-kept` remove it
the same way. To keep its commit, push it out first with `pr-update kept push`. pr-update reads no
worktree locks of its own: a worktree git will not remove (one locked with `git worktree lock`) is
a failure, reported, and nothing of it is deleted by hand.

A worktree in `worktrees/` that no kept record names is a run worktree, so `mirror prune` removes
one whose run is dead, with its scratch branch and any other `pr-update/` branch it is on.
