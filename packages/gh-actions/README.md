# GitHub Actions hosted in osdlc/osdlc

Each folder under `packages/gh-actions/` is one composite GitHub Action,
except the two named below the table. The actions may later move to a
repository of their own for the GitHub Marketplace, which needs `action.yml`
at a repository's root.

| Action                        | What it does                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| [`agent-setup`](agent-setup/) | Installs a pinned claude, codex or cursor CLI and, optionally, plugins.   |
| [`claude-pr`](claude-pr/)     | Answers `@claude` on a pull request, or reviews it with `@claude review`. |
| [`codex-pr`](codex-pr/)       | The same for `@codex`, with the Codex CLI.                                |
| [`cursor-pr`](cursor-pr/)     | The same for `@cursor`, with the Cursor CLI.                              |
| [`pr-update`](pr-update/)     | Keeps open PRs up to date with their base using `@osdlc/pr-update`.       |

[`pr-common`](pr-common/) is not an action: it holds the scripts that
claude-pr, codex-pr and cursor-pr share (it has no `action.yml` or changelog).
They find it as `$GITHUB_ACTION_PATH/../pr-common`, which works because a
`uses:` of any action here checks out the whole repository. `pr-common/test.sh`
tests all three against fake CLIs.

[`ts-packages`](ts-packages/) is not an action either. It documents the two
reusable workflows that check and release a pnpm workspace of TypeScript
packages, `.github/workflows/ts-packages-ci.yml` and
`ts-packages-release.yml`. GitHub runs a reusable workflow only from
`.github/workflows/`. Its changelog puts them under the shared version.
osdlc/osdlc's `.github/workflows/pr-update.yml` can be called the same way
(pr-update's README shows the caller), and so can its coverage and complexity
report, `.github/workflows/reports.yml` ([Reports](#reports) below shows how).

## Using an action

Reference it by path in this repository and pin the commit:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # gh-actions/v1
```

A reusable workflow is called the same way, from a job:

```yaml
jobs:
  packages:
    uses: osdlc/osdlc/.github/workflows/ts-packages-ci.yml@<commit-sha> # gh-actions/v1
```

Inside this repository, call it by local path (`./packages/gh-actions/<name>`)
from a checkout of the default branch, not of a pull request, so a pull
request cannot change the action that runs with the workflow's secrets.
[`.github/workflows/claude.yml`](../../.github/workflows/claude.yml) is the
place a workflow would do this.

## Reports

[`.github/workflows/reports.yml`](../../.github/workflows/reports.yml) reports
line coverage and complexity for Rust crates and pnpm TypeScript packages,
writes the tables to the run's summary, compares the total with the default
branch through octocov, and keeps one line about it on each pull request. It
reports only; nothing fails a run. osdlc/osdlc runs it on its own triggers;
another repository calls it:

```yaml
name: reports

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

jobs:
  reports:
    permissions:
      contents: read
      actions: read # octocov reads the default branch's report
      pull-requests: write # the coverage comment
    uses: osdlc/osdlc/.github/workflows/reports.yml@<commit-sha> # gh-actions/v1
```

Leave out a `concurrency` group named `quality-reports-…`: the workflow uses
one. The settings are the calling repository's variables, each overridable by
an input of the workflow under `with:`. A language whose folder setting is
empty is skipped.

| Variable                | Input           | Default                | Meaning                                                                            |
| ----------------------- | --------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `REPORTS_RUST_DIR`      | `rust-dir`      | empty: no Rust         | The Cargo workspace folder, from the root (`.` for a workspace at the root).       |
| `REPORTS_RUST_ARGS`     | `rust-args`     | `--workspace`          | Which packages `cargo llvm-cov` and clippy take, e.g. `--workspace --exclude app`. |
| `REPORTS_TS_PACKAGES`   | `ts-packages`   | empty: no TypeScript   | The package folders, space separated, globs allowed: `packages/ts/*`, `web site`.  |
| `REPORTS_TS_SETUP`      | `ts-setup`      | install, then build    | Shell run at the root before the report, one line. `none` runs nothing.            |
| `REPORTS_TS_BUILD`      | `ts-build`      | `pnpm run build`       | The default setup's build, after `pnpm install --frozen-lockfile`.                 |
| `REPORTS_TS_COVERAGE`   | `ts-coverage`   | each `coverage` script | A command run in each package instead of vitest. See below.                        |
| `REPORTS_OXLINT_CONFIG` | `oxlint-config` | osdlc's                | The oxlint complexity thresholds.                                                  |
| `REPORTS_OXLINT_IGNORE` | `oxlint-ignore` | none                   | More globs, space separated, that oxlint leaves out, e.g. committed build output.  |
| `REPORTS_NODE_VERSION`  | `node-version`  | none                   | Node for the Rust job, when its tests run Node.                                    |
| `REPORTS_ENV`           | `env`           | none                   | `NAME=value` lines added to both jobs' environment.                                |

By default each TypeScript package runs its `coverage` script, which must be
`vitest run --coverage`, in a pnpm workspace with oxlint installed. A package
tested some other way sets `REPORTS_TS_COVERAGE` to a command, one line, that
runs in each package folder, writes `coverage/lcov.info` there (the folder
exists and is empty when it starts) and exits non-zero when a test fails. Its
lines, functions and branches come from the lcov file; its test counts come
from the last `pass`/`fail`/`skipped` summary lines of node's test runner, and
are left out with another runner. Packages with their own lockfiles and no
root workspace, tested with `node --test`:

```text
REPORTS_TS_PACKAGES  web site
REPORTS_TS_SETUP     none
REPORTS_TS_COVERAGE  node --test --experimental-test-coverage --test-reporter=spec --test-reporter-destination=stderr --test-reporter=lcov --test-reporter-destination=coverage/lcov.info test/*.test.ts
```

With no oxlint at the root, the report runs oxlint through `npx`, at the
version osdlc/osdlc locks.

The Rust toolchain is the workspace's `rust-toolchain.toml`, or stable when it
has none. The script and the Rust actions the workflow runs come from the
same osdlc/osdlc commit as the workflow, so the ref after `@` pins all of
them. It needs no secret.

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

All actions in this directory, and the ts-packages workflows, share one
version. A release puts two tags on
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
