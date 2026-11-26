---
"@osdlc/pr-update": minor
---

**Breaking:** your own hooks no longer run in the project root's run
worktrees, so a pre-push hook no longer runs on pr-update's pushes. Put a check
you need before a push in `verify:` instead.

**Breaking:** a managed clone made where `gh` is not on an absolute `PATH`
entry gets no credential helper, and its fetches and pushes use the one your
git config names. Put `gh` on an absolute `PATH` entry before the clone is made,
or run `gh auth setup-git` to set a helper in your git config.

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

Fixed: a managed clone's credential helper names `gh` by its absolute path,
found on the absolute `PATH` entries only. It was `!gh auth git-credential`,
which the shell looked up on `PATH` in the run worktree a push runs in, so
with `.` on `PATH` a `gh` the PR committed could run. When no `gh` is found
that way, no helper is set and a note says so.

Fixed: with a relative entry such as `.` on `PATH`, git in a run worktree
could start a program the PR commits: the `ssh` of a push or fetch over ssh
(a managed clone pushes over ssh when gh's `git_protocol` is `ssh`), your
global `!gh auth git-credential` helper, or `gpg`. Every git command
pr-update runs where a PR's files are checked out, and in a `--repo` target,
now gets a `PATH` with only the absolute entries of yours (command-seam's
`absolutePathEntries`); with none left, `/usr/bin:/bin` on Linux and macOS.

Fixed: with `--keep-failed` on a managed clone, keeping a failed PR's
worktree and adding the run worktree back now happen under the clone's lock.
A `mirror prune --all-clones --discard-kept` between the two could remove the
kept tree and the clone. When another run holds the lock, the tree is not
kept, `keepError` says `mirror busy`, and the run goes on.

Fixed: two runs answering the first-run question at once could both write
the machine file, the second overwriting the first. Reading the file and
writing the answer now hold the lock file `<machine file>.lock`, taken over
once its holder has exited or it is ten minutes old, so the first answer is
the one saved. The question is still asked outside the lock. A run whose
answer was not the one saved, or that was given another directory, no longer
adopts the saved one: it clones nothing, and its targets with no checkout are
skipped with a note that says what the file holds and that
`pr-update mirror enable` or `pr-update mirror disable` changes it. Before, a
run answered "no" could clone because another run had said yes. The same holds when
the file is edited while the question is on screen: a `mirror_dir` saved then
stays beside the answer written, and a run whose answer named another
directory clones nothing, with a note.

Fixed: in a located checkout, the scratch branch a run checks a PR's head out
on wrote `branch.pr-update/scratch-<run>.remote` and `.merge` into your
`.git/config` while the run was on, and left them when a run was killed. The
scratch and kept branches are now made with `--no-track`.

Fixed: `mirror prune --discard-kept` removed a clone's kept worktree that had
no record, or a refused one, whatever branch it was on. It now removes such a
tree only while it is on its `pr-update/failed-*` branch. One a person
switched to a branch of their own, or detached, is left and reported, and its
clone stays. A kept tree with a record that a person switched to another
branch is now skipped the same way, with the reason, in `--dry-run` too:
`--dry-run` listed it and its clone as removed, and the real run reported it
under `failed` and exited with an error. So is a kept tree whose record the
checkout it names does not bear out (the record's `gitDir` is another
repository's, which does not list the tree): nothing is removed, the clone is
left with the reason, and the prune no longer exits with an error for it. One
whose owner's worktrees cannot be listed is still under `failed`.

Fixed: `mirror prune --discard-kept` removed a kept worktree a person had
switched to a branch of their own, with uncommitted files in it, when the git
directory its record named was not there (the clones folder was moved) or
could not be read. The clone being pruned must now list the tree on its
record's branch, whatever the record says, and the tree's own `.git` file must
name that clone. So a kept tree of a moved clone stays until you run
`git worktree repair` in the clone. `update --discard-kept` no longer takes a
git directory it cannot read for one that is gone; one that is gone still lets
the tree be removed.

Fixed: `mirror prune` removed a clone in use when git could not read the
clone's record of a worktree: `git worktree list` leaves such a worktree out
with no error. The clone now stays, under `failed`.

Pruning no longer takes a path it cannot read for one that is not there: an
`lstat` that fails with anything but "no such file" (such as `EACCES`) is now
an error, where `mirror prune` skipped the path before. The error is reported
for that one entry, under `failed`, and the rest are still pruned; a size it
cannot count is shown as 0. The same goes for the folders a prune walks to find
run worktrees, kept trees, clones and leftovers: one it cannot list or look
into (a folder that cannot be searched, say) is reported under `failed` as
`could not be read`, and its siblings are still pruned. `mirror list` notes
such a path and lists the rest. A dead run's worktree whose owning git
directory cannot be read is left and reported too: it was taken for one with no
owner, and its folder removed without its clone's lock. So is a clone with kept
trees whose `kept/` folder, or a record in it, cannot be read, whose trees
`--discard-kept` took for trees with no record. So is a clone whose last-used
stamp or lock cannot be read, or whose lock cannot be taken; one of those
stopped the whole prune. When the machine file cannot be read, no clone is
removed for its age, where the default of 30 days was used. Everything a prune
removes now passes one check first (the folder rule, the owner's
`git worktree list`, the clone's lock), and `--dry-run` passes it too, so it no
longer lists what the real run would leave. A clone's dead run worktree in a
folder that cannot be read keeps the clone, where the two were removed. `survey --help` now
says it also writes a managed clone's last-used stamp and its lock file, and
what the `git maintenance run --auto` after the clone's fetch writes.

Fixed: `mirror prune`, and the prune after `update --apply`, removed a clone
whose `worktrees/` folder held a record with an empty or missing `gitdir`
file: `git worktree list` leaves it out with no error, so the clone looked
unused, and a kept tree's commits made there went with it. The clone now
stays, under `failed`, while any record there is not in that list. A kept tree
still on disk whose record names the clone keeps the clone too when the
clone's list does not show it (its record folder in the clone was dropped by a
`git worktree prune` that ran while `kept/` was not mounted, say). This holds
for a plain prune, with no flags. A clone whose `kept/` folder cannot be read
now stays under `failed` without `--discard-kept` too, since its records cannot be checked.

Fixed: `mirror prune --discard-kept` removed a kept worktree, its record and
its branch through another git directory, without that directory's lock, when
the tree's record named it and it still listed the tree (a copy of the clone,
repaired with `git worktree repair` as the prune's message suggests). Such a
tree now stays, with its clone and the reason, in `--dry-run` too.

Fixed: `mirror prune` removed a worktree a person had locked with
`git worktree lock`: git refused, and pr-update then deleted the folder and
git's record of it, uncommitted files and all. Prune now honours the lock. A
dead run's worktree or a kept worktree that `git worktree list` shows as
locked stays, with `--discard-kept` too, even when its folder is missing (on a
drive that is not mounted, say), and so does its clone; the message names
`git worktree unlock <path>`. `update` likewise leaves a killed run's scratch
worktree that a person locked, and its branch, where it used to remove it from
a `--repo` target's checkout or clone. git's own `initializing` lock, which a
killed `git worktree add` leaves, is still not counted.

Fixed: `mirror prune --dry-run` read a clone's lock with rules of its own, so
a lock whose `token` is not a string read as a dead holder's and the clone as
removable, where the real run found the lock held and left the clone busy. It
now reads the lock with file-lock's `readHeldLock`, as a claim does.

Fixed: a machine file that is read but not valid (a YAML error, no mapping, or
a value the schema refuses) gave `mirror_max_age_days` its default of 30 days,
though the file may say `0` or a longer age. It is now treated like one that
cannot be read: no clone is removed for its age unless you pass
`--older-than` or `--all-clones`, and the clone directory is reported once
under `failed`. A key the schema does not know still leaves the age as read.

A worktree, kept tree or clone that a prune leaves whole because it cannot
list or empty a folder in it now names the fix, `chmod -R u+rwX <path>`.

The note for a `--repo` target with no checkout and no clone now follows the
machine file. With consent to clone, it says `update --apply` will clone it.
With `checkout: local`, it names the file that says so and
`pr-update mirror enable`, which changes it. Before, it always said to run
`pr-update mirror enable`, even after you had.

A verify command that fails writing only to standard output, as many test
runners do, is now named with the last line it printed, as in
`verify \`check\` failed: 1 test failed`. Before, the reason ended at
`failed: `.
