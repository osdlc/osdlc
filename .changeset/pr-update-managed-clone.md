---
"@osdlc/pr-update": minor
---

**Breaking:** an unattended `update --apply` (no terminal) whose GitHub
`--repo` target has no checkout now exits 2, where it used to skip the target.
Run `pr-update mirror disable` once to skip such targets again, or
`pr-update mirror enable` (or pass `--mirror-dir`) to let it clone them.

`update --apply` can now update a GitHub `--repo` target that has no checkout
on your machine, from a bare clone pr-update keeps for it. It clones only with
your consent: `--mirror-dir <dir>` on the run, `PR_UPDATE_MIRROR_DIR` in the
environment, or `checkout: mirror` in the machine file. With none of them it
asks once, and saves your answer in `~/.config/osdlc/pr-update/config.yaml`.
With no terminal to ask on it exits 2 and names `--mirror-dir`,
`PR_UPDATE_MIRROR_DIR`, `pr-update mirror enable` and `pr-update mirror
disable`. So an unattended `update --apply` whose GitHub `--repo` target has
no checkout now fails where it used to skip the target; `pr-update mirror
disable` makes it skip again.

New commands: `pr-update mirror enable [--mirror-dir <dir>]` writes
`checkout: mirror`, and `pr-update mirror disable` writes `checkout: local`.

Clones go to `~/.cache/osdlc/pr-update/repos/<host>/<owner>/<name>.git` by
default. The directory must be outside every git checkout and new, empty or
already pr-update's, and yours; on Linux and macOS no one else may write to
it, or to the `<host>` and `<owner>` folders in it (the error names the
`chmod go-w` that fixes it, and the ways to choose a clone directory on a
filesystem with Unix permissions). On Windows no ownership or mode check is
made, so keep the clone directory under your user profile, as the default is.
A clone pr-update did not make, a symbolic link
in its place, or one another user owns, is never used. Each clone is made with
`gh repo clone`, gets the `gh`
credential helper in its own config only, and keeps the `origin/<branch>`
layout. A clone that fails part-way is removed and the target is skipped
with the error. Each clone has a lock beside it. `update` takes the locks of
the clones it will use before its survey, in sorted path order, lets go of a
clone with no PR to update at once, and of the others once their worktree is
added. `update --apply` waits up to 60 seconds for a lock and then skips the
target as `mirror busy`; a rehearsal does not wait. A run never changes a
clone without its lock: taking a lock back to remove a worktree, or to
discard a kept one, it waits only when it holds no other lock. A run worktree
it cannot get the lock for is left, with a note, for the next run in that
clone or `pr-update mirror prune`; a kept worktree is left for another
`--discard-kept`.

A bad value or a YAML error in the machine file is reported with the file's
path and ignored. When the file cannot take an answer (not YAML, or not a map
of keys), `update --apply` exits 14 before it asks, and so do `mirror enable`
and `mirror disable`.

`survey` and rehearsals never clone. They use a clone that exists, fetch it
under its lock, and otherwise report the target as not measured with a note
naming `pr-update mirror enable`. A target on a host that is not GitHub gets
a note and no clone. A clone is trusted by repository: `pr-update trust
github.com/<owner>/<name>`. `survey` and `update` take `--mirror-dir`.

For library hosts: a host that wants managed clones supplies its own
`ManagedClones` as `SurveyEnv.clones`, and its own `CloneLookup` as
`StandalonePortsOptions.clones` for `standalonePorts`' locate (a target with
no usable checkout is reported to it as a `MissedCheckout`). `LocateTarget`
and `RepoTarget` carry `github`, and `RepoTarget` carries `unserved`, the
reason a target looked for has no checkout.
