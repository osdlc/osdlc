---
'@osdlc/pr-update': minor
---

`survey` now measures a `--repo` target in a checkout already on your machine.
It looks under the roots listed in the shared `~/.config/osdlc/repositories.yaml`,
or, with none listed, beside the project root, and matches each checkout's
`origin`. A shallow checkout is skipped. A checkout found this way is fetched
and measured through its `origin`, whatever `--remote` says. When a target has
no checkout, a note names the roots searched and the file that sets them. The
JSON report gives each repository `checkout: { path, source }` (`root` or
`located`), or `null`. `update` surveys such a checkout but does not yet update
it: its PRs are listed as skipped.

`--repo` takes `host/owner/name` as well as `owner/name`. A bare `owner/name`
means the project root's host when that is GitHub, else github.com. Targets are
lower-cased, so `Acme/API` and `acme/api` are one, and `--pr owner/name#N`
matches in any letter case. A `--repo` that is neither form is a usage error.

pr-update has a machine file, `~/.config/osdlc/pr-update/config.yaml`
(`PR_UPDATE_MACHINE_CONFIG` names another, as an absolute path), for the
settings of the clone cache: `checkout`, `mirror_dir` and
`mirror_max_age_days`. A project's `pr-update.yaml` cannot set them.

For library hosts: `Ports.locate` is now called with a lower-cased `owner/name`
and a second argument carrying the host, and may return
`{ path, source, remote }` to name the remote a checkout is read through. A
`locate` that takes one argument and returns a path works as before.
`standalonePorts` takes a fifth argument, `{ git, env }`, for its `locate`.
