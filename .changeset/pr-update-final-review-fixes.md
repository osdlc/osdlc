---
"@osdlc/pr-update": minor
---

**Breaking:** your own hooks no longer run in the project root's run
worktrees, so a pre-push hook no longer runs on pr-update's pushes. Put a check
you need before a push in `verify:` instead.

**Breaking:** git commands pr-update runs in a run worktree, a kept tree or a
`--repo` target get a `PATH` holding only the absolute entries of yours, so a
program git starts by name (`ssh`, a `!` credential helper, `gpg`) is no
longer found on a relative entry. Put such a program on an absolute `PATH`
entry.

Fixed: hooks a PR commits no longer run in the project root's run worktrees.
In a repository with a relative `core.hooksPath` such as `.husky`, the
`worktree add`, the checkout of the PR's head and the push in the root's run
worktree ran the hooks the PR's author committed, with no trust gate. Every
git command in a run worktree or kept tree, the project root's included, now
runs with hooks off. The root's own fetch, survey, PR listing and branch
mode's sync, in your checkout, keep its hooks.

Fixed: hooks stay off when pr-update runs from a git alias or hook started as
`git -c core.hooksPath=.husky`. git passes that setting on in
`GIT_CONFIG_PARAMETERS`, which it reads after the `GIT_CONFIG_COUNT` entry
that turned hooks off, so a target's checkout ran the PR's hooks. The setting
is now also appended to `GIT_CONFIG_PARAMETERS` (typed-git's `gitConfigEnv`).
The same goes for `maintenance.auto=false` and `gc.auto=0`: an inherited
`-c gc.auto=…` no longer starts a background `gc` in a managed clone after its
lock is let go. They are set with hooks off, so they reach every git call
pr-update makes in a `--repo` target and in the project root's run worktrees
and kept trees, and a target's `git-ref` record and lease. So pr-update's own
rebases, merges, commits and pushes there no longer start `gc --auto`, and in
a located checkout neither does its fetch. The project root's own fetch still
can, and so can your own git commands in any checkout.

A managed clone's credential helper names `gh` by its absolute path, found on
the absolute `PATH` entries only, so a `gh` a PR commits never runs as the
helper when `.` is on `PATH`. When no `gh` is found that way, no helper is set,
a note says so, and the clone's fetches and pushes use the helper your git
config names: put `gh` on an absolute `PATH` entry before the clone is made,
or run `gh auth setup-git`.

Fixed: with a relative entry such as `.` on `PATH`, git in a run worktree
could start a program the PR commits: the `ssh` of a push or fetch over ssh,
your global `!gh auth git-credential` helper, or `gpg`. Every git command
pr-update runs where a PR's files are checked out, and in a `--repo` target,
now gets a `PATH` with only the absolute entries of yours (command-seam's
`absolutePathEntries`); with none left, `/usr/bin:/bin` on Linux and macOS.

With `--keep-failed` on a managed clone, keeping a failed PR's worktree and
adding the run worktree back happen under the clone's lock, so a
`mirror prune` cannot remove the clone between the two. When another run
holds the lock, the tree is not kept, `keepError` says `mirror busy`, and the
run goes on.

Answering the first-run question holds the lock file `<machine file>.lock`
while the machine file is read and the answer written, taken over once its
holder has exited or it is ten minutes old, so of two runs answering at once
the first answer is the one saved. The question is asked outside the lock. A
run whose answer was not the one saved, or that was given another directory,
does not adopt the saved one: it clones nothing, and its targets with no
checkout are skipped with a note that says what the file holds and that
`pr-update mirror enable` or `pr-update mirror disable` changes it. The same
holds when the file is edited while the question is on screen.

The scratch branch a run checks a PR's head out on, and a kept tree's branch,
are made with `--no-track`, so a run writes no `branch.<name>.remote` or
`.merge` keys into a located checkout's `.git/config`.

`mirror prune --discard-kept` removes a kept worktree only through the clone
being pruned: the clone must list it, and the tree's own `.git` file must
name that clone. A kept tree of a moved clone, or one another git directory
owns, stays with its clone and the reason (run `git worktree repair` in the
clone), in `--dry-run` too. A kept tree still on disk whose
record names the clone keeps the clone too when the clone's list does not
show it (its record folder in the clone was dropped by a `git worktree prune`
that ran while the cache was not mounted, say). `--discard-kept` removes such
a tree as a plain folder, but never a live run's worktree, nor one whose
`.git` names another git directory, nor one whose `.git` cannot be read.

Pruning never takes a path it cannot read for one that is not there: an
`lstat` that fails with anything but "no such file" (such as `EACCES`) is an
error, reported for that one entry under `failed`, and the rest are still
pruned; a size it cannot count is shown as 0. The same goes for the folders a
prune walks to find run worktrees, kept-tree records, clones and leftovers:
one it cannot list or look into is reported under `failed` as
`could not be read`, and its siblings are still pruned. `mirror list` notes
such a path and lists the rest. A dead run's worktree whose owning git
directory cannot be read is left and reported, and so is a clone with kept
trees whose `kept/` folder, or a record in it, cannot be read, and a clone
whose last-used stamp or lock cannot be read, or whose lock cannot be taken.
When the machine file cannot be read, no clone is removed for its age.
Everything a prune removes passes one check first (the folder rule, the
owner's `git worktree list`, the clone's lock), and `--dry-run` passes it too.
A clone's dead run worktree in a folder that cannot be read keeps the clone.
`survey --help` says it also writes a managed clone's last-used stamp and its
lock file, and what the `git maintenance run --auto` after the clone's fetch
writes.

A worktree is removed with one `git worktree remove --force`. When git
refuses (a worktree locked with `git worktree lock`, say), that is a failure,
reported under `failed`, its clone stays, and pr-update never deletes its
folder or git's record of it by hand. `update` likewise leaves a killed run's
scratch worktree that git will not remove, and its branch. One lock is git's
own: a `git worktree add` that was killed leaves its worktree locked with the
reason `initializing`. A run worktree whose run is over, locked with exactly
that reason, is unlocked and removed; any other lock is still refused.

When git will not remove a run's own worktree at the end of `update`, the
PR it last served keeps its outcome, its result says so in the new
`worktreeLeft`, and the text adds `worktree left: <why>`.

With `--keep-failed`, when the run worktree that comes after a kept one
cannot be added, the kept tree and its record stay, `keepError` says so, and
the run updates no more PRs in that repository.

A kept record no longer leads a removal to a folder it does not own. A tree
removed as a plain folder because a record names it (`mirror prune
--discard-kept` for a tree its clone does not list, or a discard whose
record's git directory is gone) stays when it is a live run's worktree, when
its `.git` names another git directory, or when its `.git` cannot be read. A
record naming a live run's worktree that is not on the record's branch is
refused, and `mirror prune` counts a live run's worktree as in use whatever a
record says.

`mirror prune --dry-run` reads a clone's lock with file-lock's
`readHeldLock`, as a claim does, so it calls a clone busy exactly where the
real run would.

A machine file that is read but not valid (a YAML error, no mapping, or a
value the schema refuses) is treated like one that cannot be read: no clone
is removed for its age unless you pass `--older-than` or `--all-clones`, and
the clone directory is reported once under `failed`. A key the schema does
not know still leaves the age as read.

A worktree, kept tree or clone that a prune leaves whole because it cannot
list or empty a folder in it now names the fix, `chmod -R u+rwX <path>`.

The note for a `--repo` target with no checkout and no clone follows the
machine file. With consent to clone, it says `update --apply` will clone it.
With `checkout: local`, it names the file that says so and
`pr-update mirror enable`, which changes it.

A verify command that fails writing only to standard output, as many test
runners do, is now named with the last line it printed, as in
`verify \`check\` failed: 1 test failed`. Before, the reason ended at
`failed: `.
