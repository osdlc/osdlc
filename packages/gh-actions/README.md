# GitHub Actions hosted in osdlc/osdlc

Each folder under `packages/gh-actions/` is one composite GitHub Action. They
may later move to a repository of their own for the GitHub Marketplace, which
needs `action.yml` at a repository's root.

| Action | What it does |
| --- | --- |
| [`claude-setup`](claude-setup/) | Installs a pinned Claude Code CLI and, optionally, plugins. |
| [`claude-pr-answer`](claude-pr-answer/) | Asks Claude about a pull request with read-only tools and posts the answer. |

## Using an action

Reference it by path in this repository and pin the commit:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/claude-setup@<commit-sha> # claude-setup/v0.1.0
```

Inside this repository, call it by local path (`./packages/gh-actions/<name>`)
from a checkout of the default branch, not of a pull request, so a pull
request cannot change the action that runs with the workflow's secrets.
[`.github/workflows/claude.yml`](../../.github/workflows/claude.yml) does this.

## Shape

- `action.yml` is a composite action. Its steps run scripts next to it through
  `$GITHUB_ACTION_PATH`, so the logic can be run and tested outside Actions.
- Inputs reach a script as `env`, never as `${{ inputs.* }}` inside `run:`,
  so an input cannot inject shell.
- A step that uses another action pins it to a commit SHA.
- Each action has a `README.md`, a `CHANGELOG.md`, `LICENSE-MIT` and
  `LICENSE-APACHE`. Every action is `MIT OR Apache-2.0`.

## Versioning

Each release is tagged `<action>/vX.Y.Z`, as the Rust crates are, and noted in
the action's `CHANGELOG.md`. A tag marks the repository commit that holds that
release; callers pin the commit and name the tag in a comment.

## Security

Report a vulnerability as for every package here: privately, through the
[Security tab](https://github.com/osdlc/osdlc/security).
