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

For library hosts, `Ports.targetHome` is now required and is asked about the project root too
(`TargetCheckout.source` can be `'root'`); `Ports.attempts` and `Ports.lease` still win for the
project root where set. `attemptsDir` and `checkoutKept` are gone, `KeptPlace` has no
`naming` and gains `trees` (where its trees are), and `TargetHome.keptRoot` is now
`worktreesRoot`. A worktree a record does not name is a run worktree, so `mirror prune` removes
one whose run is dead, with its `pr-update/` branch. A kept record no longer has a rule against naming a git directory, since no record is
inside a working tree any more; its path, branch and listing checks stay.
