---
"@osdlc/pr-update": minor
---

`update --apply` can now update a GitHub `--repo` target that has no checkout
on your machine, from a bare clone pr-update keeps for it. It clones only with
your consent: `--mirror-dir <dir>` on the run, `PR_UPDATE_MIRROR_DIR` in the
environment, or `checkout: mirror` in the machine file. With none of them it
asks once, and saves your answer in `~/.config/osdlc/pr-update/config.yaml`.
With no terminal to ask on it exits 2 and names those three. So an unattended
`update --apply` whose `--repo` has no checkout now fails where it used to skip
the target; `pr-update mirror disable` makes it skip again.

New commands: `pr-update mirror enable [--mirror-dir <dir>]` writes
`checkout: mirror`, and `pr-update mirror disable` writes `checkout: local`.

Clones go to `~/.cache/osdlc/pr-update/repos/<host>/<owner>/<name>.git` by
default. The directory must be outside every git checkout and new, empty or
already pr-update's. Each clone is made with `gh repo clone`, gets the `gh`
credential helper in its own config only, and keeps the `origin/<branch>`
layout. A clone that fails part-way is removed and the target is skipped
with the error. Each clone has a lock beside it: `update --apply` waits up to
60 seconds for it and then skips the target as `mirror busy`.

`survey` and rehearsals never clone. They use a clone that exists, fetch it
under its lock, and otherwise report the target as not measured with a note
naming `pr-update mirror enable`. A target on a host that is not GitHub gets
a note and no clone. A clone is trusted by repository: `pr-update trust
github.com/<owner>/<name>`. `survey` and `update` take `--mirror-dir`.

For library hosts: `SurveyEnv.clones` (`ManagedClones`) lets a run use managed
clones; `LocateTarget` and `RepoTarget` carry `github`, and `RepoTarget`
carries `unserved`, the reason a target looked for has no checkout.
