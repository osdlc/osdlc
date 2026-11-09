# GitHub Actions hosted in osdlc/osdlc

Each folder under `packages/gh-actions/` is one composite GitHub Action. They
may later move to a repository of their own for the GitHub Marketplace, which
needs `action.yml` at a repository's root.

| Action                        | What it does                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| [`agent-setup`](agent-setup/) | Installs a pinned claude, codex or cursor CLI and, optionally, plugins. |
| [`pr-update`](pr-update/)     | Keeps open PRs up to date with their base using `@osdlc/pr-update`.     |

## Using an action

Reference it by path in this repository and pin the commit:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # gh-actions/v1
```

Inside this repository, call it by local path (`./packages/gh-actions/<name>`)
from a checkout of the default branch, not of a pull request, so a pull
request cannot change the action that runs with the workflow's secrets.
[`.github/workflows/claude.yml`](../../.github/workflows/claude.yml) is the
place a workflow would do this.

## Shape

- `action.yml` is a composite action. Its steps run scripts next to it through
  `$GITHUB_ACTION_PATH`, so the logic can be run and tested outside Actions.
- Inputs reach a script as `env`, never as `${{ inputs.* }}` inside `run:`,
  so an input cannot inject shell.
- A step that uses another action pins it to a commit SHA.
- A script supports `DRY_RUN=1`, which prints each command instead of running
  it.
- Each action has a `README.md`, a `CHANGELOG.md`, `LICENSE-MIT` and
  `LICENSE-APACHE`. Every action is `MIT OR Apache-2.0`.

## Versioning

All actions in this directory share one version. A release puts two tags on
one commit of the default branch: `gh-actions/v1.2.3`, created once, and
`gh-actions/v1` for the major line, moved to each new release. Together they
cover every action here. Callers pin the commit and name the tag in a
comment. Each action's `CHANGELOG.md` records what changed in it, and has an
entry for every release.

To release, run the `gh-actions release` workflow from the Actions tab with
the version. It refuses a version that is not `X.Y.Z`, an existing tag, a
branch other than the default, and a `CHANGELOG.md` with no entry for the
version.

## Security

Report a vulnerability as for every package here: privately, through the
[Security tab](https://github.com/osdlc/osdlc/security).
