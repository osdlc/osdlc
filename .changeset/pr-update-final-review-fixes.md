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
The same goes for `maintenance.auto=false` and `gc.auto=0`, which every git
call in a target, and a target's `git-ref` record and lease, now get that way
too: an inherited `-c gc.auto=…` no longer starts a background `gc` in a
managed clone after its lock is let go. In a located checkout, your own git
commands still run `gc --auto`.

Fixed: a managed clone's credential helper names `gh` by its absolute path,
found on the absolute `PATH` entries only. It was `!gh auth git-credential`,
which the shell looked up on `PATH` in the run worktree a push runs in, so
with `.` on `PATH` a `gh` the PR committed could run. When no `gh` is found
that way, no helper is set and a note says so.

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
run answered "no" could clone because another run had said yes.

Fixed: in a located checkout, the scratch branch a run checks a PR's head out
on wrote `branch.pr-update/scratch-<run>.remote` and `.merge` into your
`.git/config` while the run was on, and left them when a run was killed. The
scratch and kept branches are now made with `--no-track`.

Fixed: `mirror prune --discard-kept` removed a clone's kept worktree that had
no record, or a refused one, whatever branch it was on. It now removes such a
tree only while it is on its `pr-update/failed-*` branch. One a person
switched to a branch of their own, or detached, is left and reported, and its
clone stays.

Pruning no longer takes a path it cannot read for one that is not there: an
`lstat` that fails with anything but "no such file" (such as `EACCES`) is now
an error, where `mirror prune` skipped the path before. `survey --help` now
says it also writes a managed clone's last-used stamp and its lock file.

The note for a `--repo` target with no checkout and no clone now follows the
machine file. With consent to clone, it says `update --apply` will clone it.
With `checkout: local`, it names the file that says so and
`pr-update mirror enable`, which changes it. Before, it always said to run
`pr-update mirror enable`, even after you had.

A verify command that fails writing only to standard output, as many test
runners do, is now named with the last line it printed, as in
`verify \`check\` failed: 1 test failed`. Before, the reason ended at
`failed: `.
