---
"@osdlc/pr-update": minor
---

`survey` now measures a `--repo` target in a checkout already on your machine.
It looks under the roots listed in the shared `~/.config/osdlc/repositories.yaml`,
or, with none listed, beside the project root, and matches each checkout's
`origin`. A shallow checkout is skipped. A checkout found this way is fetched
and measured through its `origin`, whatever `--remote` says, with no tags, no
`FETCH_HEAD` and no pruning, so refs its own fetch lines keep under `origin/`
stay. A `--repo` target's PRs are listed on its own host: through the project
root's code host when it is on the host of the project root's `origin`, else
through GitHub over `gh` with `GH_HOST` set to that host. Hosts are compared
without a port, and an SSH config alias in the project root's remote counts
as the host `ssh -G` resolves it to. When a target has
no checkout, a note names the roots searched and the file that sets them. The
JSON report gives each repository `checkout: { path, source }` (`root`,
`located` or `clone`), or `null`.

`--repo` takes `host/owner/name` as well as `owner/name`. A bare `owner/name`
means the host of the project root's `origin` when that is GitHub, else
github.com. Targets are
lower-cased, so `Acme/API` and `acme/api` are one, and `--pr owner/name#N`
matches in any letter case. A `--repo` that is neither form, or one
`owner/name` on two hosts in one run, is a usage error.

pr-update has a machine file, `~/.config/osdlc/pr-update/config.yaml`
(`PR_UPDATE_MACHINE_CONFIG` names another, as an absolute path), for the
settings of the clone cache: `checkout`, `mirror_dir` and
`mirror_max_age_days`. A project's `pr-update.yaml` cannot set them.

For library hosts:

- `Ports.locate` is now called with a lower-cased `owner/name` and a second
  argument carrying the host, and may return `{ path, source, remote, others }`
  to name the remote a checkout is read through and the repository's other
  checkouts, which the `unpushed_local` guard also reads. A `locate` that
  takes one argument and returns a path works as before. A checkout returned
  either way is fetched without tags or `FETCH_HEAD`, and without pruning
  unless its `source` is `clone`.
- A target other than the project root is lower-cased everywhere: in the
  report's `repo`, in `owner/name#N` keys, and in the `repo` of attempt keys.
  An attempt record a host's store holds under a mixed-case `repo` is no
  longer matched, so that PR may be tried once more.
- Each repository in the report has a `checkout` field. It is optional when a
  report is parsed, so an older report still parses.
- A `--repo` that is not `owner/name` or `host/owner/name`, such as a URL,
  is now refused.
- `standalonePorts` takes a fifth argument, `{ git, env }`, for its `locate`.
- `selectedCodeHostFor` takes `projectRoot`, and a `SurveyEnv.codeHost`
  factory is called with a `CodeHostTarget` (now exported): for a target other
  than the project root it carries `host` and `onRootHost`.
- `SurveyEnv.resolveAlias` resolves an SSH config alias in the project root's
  remotes when a run has `--repo` targets; by default it asks `ssh -G`.
  `LocateTarget.host` carries no port.
