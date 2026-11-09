# pr-update

Brings open pull requests up to date with their base branch, with
[`@osdlc/pr-update`](https://www.npmjs.com/package/@osdlc/pr-update). It merges
the base into each PR branch (no force-push), tries pr-update's built-in
conflict resolvers, then a headless claude repair, and leaves what is still
conflicted for a person: a label, one comment, and the job summary.

The action does the work of one run. When to run it (a merge to main, a
schedule, a comment) is the caller's job; see
[`.github/workflows/pr-update.yml`](../../../.github/workflows/pr-update.yml).

## Use

```yaml
name: pr-update
on:
  push: { branches: [main] }
  schedule: [{ cron: "17 */6 * * *" }]
  workflow_dispatch:

permissions: {}

concurrency:
  group: pr-update-run
  cancel-in-progress: false # never cancel a run that is already pushing

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - id: app-token
        uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          permission-contents: write
          permission-pull-requests: write
          permission-issues: write
          permission-workflows: write
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          token: ${{ steps.app-token.outputs.token }}
      - run: |
          git config user.name "my-app[bot]"
          git config user.email "my-app[bot]@users.noreply.github.com"
      - uses: osdlc/osdlc/packages/gh-actions/pr-update@<commit-sha> # gh-actions/v1
        with:
          github-token: ${{ steps.app-token.outputs.token }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The job must check the repository out first, with the same token, and set a
git identity: the action pushes merge commits from that checkout.

## Inputs

| Input                    | Default               | Meaning                                                                                                              |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `github-token`           | required              | GitHub App token that pushes, labels and comments (see Token).                                                       |
| `anthropic-api-key`      | none                  | Key for the claude repair. Empty means no repair.                                                                    |
| `pr-update-version`      | `0.9.9`               | Exact `@osdlc/pr-update` version.                                                                                    |
| `pr`                     | none                  | One PR number. Ignores the skip label and draft setting for it, and posts a summary comment on it.                   |
| `strategy`               | `merge`               | `merge` or `rebase`. Merge never needs a force-push.                                                                 |
| `repair-agent`           | `claude`              | `claude`, `codex`, `cursor`, `pi`, or empty for no repair. claude is installed with [agent-setup](../agent-setup/). |
| `repair-timeout-seconds` | `600`                 | Kills one repair after this long; its PR is then reported as a conflict.                                             |
| `agent-version`          | agent-setup's default | CLI version for agent-setup.                                                                                         |
| `skip-label`             | `no-auto-update`      | A PR with this label is left alone. Empty disables.                                                                  |
| `conflict-label`         | `needs-manual-update` | Added to a PR that ends conflict or failed, removed when it later ends updated or up to date. Empty disables.        |
| `comment-conflicts`      | `true`                | One comment per (head sha, base sha) on a conflicted PR.                                                             |
| `include-drafts`         | `true`                | Update draft PRs.                                                                                                    |
| `include-bots`           | `false`               | Update PRs authored by a bot. A PR named by `pr` is updated either way.                                              |
| `dry-run`                | `false`               | Measure and report; push, label and comment nothing.                                                                 |
| `fail-on-conflict`       | `false`               | Fail the step when a PR ended conflict or failed (see Exit policy).                                                  |
| `cache-attempts`         | `true`                | Persist `.pr-update/attempts` between runs with actions/cache.                                                       |
| `extra-args`             | none                  | Extra `pr-update update` arguments, for example `--retry-failed`.                                                    |

Outputs: `report-path` (the pr-update JSON report), and the counts `updated`,
`up-to-date`, `conflict`, `failed`, `skipped` and `excluded`.

## Which PRs

`select-prs.sh` lists open PRs with `gh pr list --json
number,isDraft,isCrossRepository,labels,author` and passes the survivors to pr-update
as `--pr N`. It excludes:

- a PR from a fork (`isCrossRepository`): the token cannot push to it;
- a draft, only when `include-drafts` is `false`;
- a PR carrying `skip-label`;
- a PR authored by a bot (`author.is_bot`, or a login ending in `[bot]` or
  starting with `app/`), unless `include-bots` is `true`: release-plz and
  Changesets rebuild and force-push their release branches on every merge to
  main, so updating them is wasted CI.

pr-update has `overrides` with `strategy: skip` that match a label, but they
live in a config file and cannot be set from a flag, so the action filters
itself. Excluding a parent PR of a stack is fine: pr-update marks a child
`blocked` while its parent is behind, and the report lists it.

If nothing survives, pr-update is not run. With no `--pr` it would take every
open PR. With `pr` set, only that PR is looked at, a fork is still refused, and
the skip label and draft setting do not apply: asking by number overrides them.

pr-update's own guards stay on: a PR whose branch is checked out elsewhere with
unpushed commits is skipped, a PR whose parent is behind is blocked, and so on.
It runs with `--trust` (so exit 21 never stops a CI run) and `verify: none`;
CI on the PR checks what was pushed.

## Conflicts

1. pr-update tries git `rerere`, the lockfile rule and project `resolvers`.
2. If a conflict is left and repair is on, `--repair-agent` runs the agent once
   in the merge worktree, with `repair-timeout-seconds` (written to a config
   file named by `PR_UPDATE_CONFIG`, which replaces any `pr-update.yaml` in the
   repository). The agent only edits files; pr-update checks for leftover
   markers, commits and pushes.
3. Still conflicted, or the repair failed: the PR ends `conflict` or `failed`.
   The action adds `conflict-label`, and posts one comment with the paths and
   the reason, ending in `<!-- pr-update: conflict head=<sha> base=<sha> -->`.
   It does not post again for the same pair.
4. A PR that ends `updated` because the repair agent fixed a conflict gets one
   comment per merge commit (with `comment-conflicts`): the repaired files, the
   agent's note, a link to the merge commit and the resolution as `git show
   --remerge-diff` output in a collapsed block (cut at 300 lines; `git show
   --stat` where remerge-diff is unavailable), ending `<!-- pr-update: repaired
   head=<merge sha> -->`. Conflicts cleared by rerere, the lockfile rule,
   resolvers or generators, and clean updates, stay silent.
5. When the PR later ends `updated` or `up-to-date`, the label is removed.

There is no limit on the number of repairs in one run: pr-update has no such
setting. A run is bounded by the job's `timeout-minutes` and by
`repair-timeout-seconds` per repair, and the failed-attempt record keeps a
conflicted PR from being repaired again.

### The failed-attempt record

pr-update writes `.pr-update/attempts/` (one file per repo, head and base
branch, written atomically) for each PR that ends `conflict` or `failed`. The
next run skips that PR, and spends no agent tokens on it, until its head or
base sha changes. The action restores the directory with `actions/cache/restore`
and saves it with `actions/cache/save` under `pr-update-attempts-<run id>-<attempt>`
(a cache entry cannot be overwritten, so every run saves a new one and the
next restores the newest by prefix). The save step is `if: always()`, so a
failed or timed-out run still saves it. GitHub evicts a cache entry not used for
7 days, or under the repository's size limit; the only effect is one extra
retry. Entries older than 30 days are dropped by pr-update. A cache is
visible only to the branch that saved it and its base, so run the action from
the default branch. Comment `/pr-update retry` (in the osdlc workflow), or pass
`--retry-failed`, to try a recorded PR again.

### If a run is killed

The job timeout or a cancel ends the process without cleanup. pr-update does its
work in one temporary worktree, which it removes in a `finally` block on an
error but not on a kill; on a hosted runner the whole machine is discarded, so
nothing remains. A push is one atomic `git push`, so a PR is either pushed or
untouched; a repair cut off mid-way has pushed nothing. The report is not
written, so there is no summary for that run, but the attempt record is saved
by the `always()` step. The next run finds every PR the killed run finished
already up to date, which costs one cheap check each.

## Exit policy

pr-update exits 1 when a PR ended `conflict` or `failed`. That is an ordinary
outcome (a person must look), so the step does not go red for it: with a
readable report it emits a warning and succeeds. Anything else fails the step:
an exit other than 0 or 1 (config 14, tool missing 22, code host refused 23,
no repository 24, unreachable 25), a report holding `{"error": ...}`, or no
report at all. Set `fail-on-conflict: true` to fail on exit 1 as well.

## Token

Use a GitHub App token, not `GITHUB_TOKEN`: a push made with `GITHUB_TOKEN`
does not start workflows, so CI would not run on the updated PR.

| Permission                | Needed for                                                                  | If missing                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contents: write           | pushing the merge commit                                                    | Every push is rejected; each PR ends `failed`.                                                                                                       |
| Pull requests: read/write | listing PRs; labels and comments (with Issues)                              | Listing fails (exit 23). With read only, pushes work but labels and comments warn.                                                                   |
| Issues: write             | labels, comments and reactions on PRs                                       | Pushes work; labels and comments log a warning.                                                                                                      |
| Workflows: write          | a merge that brings changes under `.github/workflows` into the PR branch    | GitHub rejects that push ("refusing to allow a GitHub App to create or update workflow ... without `workflows` permission"); the PR ends `failed`. |

An App's token cannot be given a permission the App was not granted:
`permission-workflows: write` in `create-github-app-token` only narrows. Grant
Workflows, Issues and Pull requests write on the App's settings page, and the
installation owner must accept the new permissions.

## Tests

`test-dry-run.sh` runs the scripts with a fake `gh` and a fake `pr-update` on
`PATH`: no network and no secrets.

```sh
packages/gh-actions/pr-update/test-dry-run.sh
```

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
