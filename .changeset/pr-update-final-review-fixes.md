---
"@osdlc/pr-update": minor
---

Fixed: hooks a PR commits no longer run in the project root's run worktrees.
In a repository with a relative `core.hooksPath` such as `.husky`, the
`worktree add`, the checkout of the PR's head and the push in the root's run
worktree ran the hooks the PR's author committed, with no trust gate. Every
git command in a run worktree or kept tree, the project root's included, now
runs with hooks off. This changes behaviour: your own pre-push hook no longer
runs on pr-update's pushes. The root's own fetch, survey, PR listing and
branch mode's sync, in your checkout, keep its hooks.

Fixed: hooks stay off when pr-update runs from a git alias or hook started as
`git -c core.hooksPath=.husky`. git passes that setting on in
`GIT_CONFIG_PARAMETERS`, which it reads after the `GIT_CONFIG_COUNT` entry
that turned hooks off, so a target's checkout ran the PR's hooks. The setting
is now also appended to `GIT_CONFIG_PARAMETERS` (typed-git's `hooksOffEnv`).

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
