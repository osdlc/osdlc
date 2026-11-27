---
"@osdlc/pr-update": minor
---

**Breaking:** the project root's run worktrees, kept worktrees and file attempt records moved out
of `<root>/.pr-update/` to the same places every `--repo` target already used, keyed by
`<host>/<owner>/<name>`: run worktrees under `worktrees/` in pr-update's cache directory, kept
worktrees under `kept/` and attempt records under `attempts/` in its state directory. The project
root now gets only git records (worktree registrations, `pr-update/*` branches and, with
`attempts.store: git-ref`, refs on its remote). An existing `.pr-update/` is neither read, moved nor
deleted; `update` prints one note that it is no longer used and can be deleted.

For library hosts, `Ports.targetHome` is now required and is asked about the project root too
(`TargetCheckout.source` can be `'root'`); `Ports.attempts` and `Ports.lease` still win for the
project root where set. `attemptsDir` and `checkoutKept` are gone, and `KeptPlace` has no
`naming`. A kept record no longer has a rule against naming a git directory, since no record is
inside a working tree any more; its path, branch and listing checks stay.
