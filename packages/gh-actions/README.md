# GitHub Actions hosted in osdlc/osdlc

Each folder under `packages/gh-actions/` is one composite GitHub Action. They
may later move to a repository of their own for the GitHub Marketplace, which
needs `action.yml` at a repository's root.

| Action                        | What it does                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| [`agent-setup`](agent-setup/) | Installs a pinned claude, codex or cursor CLI and, optionally, plugins. |

## Using an action

Reference it by path in this repository and pin the commit:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # v1
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

All actions in this directory share one version. A release is a single tag,
`v1` for the major line and `v1.2.3` for each release, and covers every
action here. The tag marks the repository commit that holds that release;
callers pin the commit and name the tag in a comment. Each action's
`CHANGELOG.md` records what changed in it.

## Security

Report a vulnerability as for every package here: privately, through the
[Security tab](https://github.com/osdlc/osdlc/security).
