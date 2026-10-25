# @osdlc/repo-cleaner

What has been merged into the default branch, and what can go away.

Point it at a repository and it inventories the local branches, worktrees and
remote branches, classifying each as `safe-to-delete`, `safe-to-keep` or
`needs-investigation` — with the evidence behind the verdict and the literal
command that would act on it.

The sweep never deletes anything. It emits commands, and can write the
deletable rows as a plan. `repo-cleaner apply` deletes the plan rows you
select, after checking each one again.

```console
$ repo-cleaner
/Users/me/work/api  (acme/api, default main, origin)
  local_branch   fix/login-redirect   delete  PR #412 merged
                 git update-ref -d refs/heads/fix/login-redirect 3f9c2e1d8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d
  local_branch   spike/cache          review  mixed or absent signals
  worktree       wt/412               delete  clean; PR #412 merged
                 git -C /Users/me/work/api worktree remove wt/412
  remote_branch  origin/fix/login-…   delete  PR #412 merged (auto-delete didn't fire)
                 git push --force-with-lease=refs/heads/fix/login-redirect:3f9c2e1d8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d origin :refs/heads/fix/login-redirect

1 to delete, 1 to review, across 1 repository.
```

## Install

```sh
npm install @osdlc/repo-cleaner
```

ESM only. Compiled JavaScript with type declarations, for Node 22 or newer.

## How it decides

Two signals settle most items, and either alone is enough:

| Signal | Source |
| --- | --- |
| A `MERGED` pull request from this repository, into the default branch, whose head commit is the branch tip | `gh pr list`, one listing per repository |
| The branch tip is reachable from the default branch | `git merge-base --is-ancestor` |

Ancestry is measured against `<remote>/<default>`, so work merged only into an
unpushed local default branch does not count. Without a remote, the local
default branch is used.

A merged PR that fails the head or base check is kept in `facts.pr` with
`evidence` set to `head-moved` or `other-base`. Fork PRs are ignored.

Everything else is held back. A branch that is neither merged nor an ancestor
is `needs-investigation` with the reasons spelled out, not a guess. A worktree
holding uncommitted or unpushed work is never proposed for removal whatever
else is true of it — losing an hour of someone's work costs more than any
amount of clutter.

Some worktrees are held back whatever their branch says. Each lands in
`facts.blockers`, and the row carries no command and has `deletable: false`:

| Blocker | Why |
| --- | --- |
| `locked-worktree` | Someone ran `git worktree lock`; the reason is in `facts.lock_reason`. |
| `hidden-index-flags` | Files marked skip-worktree or assume-unchanged hide edits from `status`. |
| `nested-repository` | An untracked or ignored directory holds a repository with its own history. |
| `branch-in-other-worktree` | Another worktree has the same branch checked out (`facts.other_worktrees`). |

Without `gh`, or without authentication, classification proceeds on git
evidence alone and the report says so.

Every branch delete names the full sha the sweep judged. `update-ref -d` and
the pinned `--force-with-lease` push both refuse when the branch has moved
since, so a commit pushed while you read the plan survives it.
`localDeleteCommand` and `remoteDeleteCommand` build them for hosts that add
their own rows.

Every row names, in `requires`, the risks its delete carries, so a person
approves them by name:

| Authorization | When a row needs it |
| --- | --- |
| `abandon-unmerged` | Commits not on the default branch and not captured by an exact-head merged PR; a worktree's unpushed commits. `facts.unique_commits` counts them. |
| `discard-changes` | A worktree has modified, staged or untracked files. |
| `confirm-open-pr` | The branch has an open PR. |

A row kept for structure (default branch, current HEAD, a branch held by a
worktree, the primary or caller's worktree) has `deletable: false`.

## Scope is opt-in

```bash
repo-cleaner                        # the repository you are standing in
repo-cleaner ~/work/api ~/work/web  # named repositories
repo-cleaner ~/Developer            # every checkout under it
repo-cleaner --all                  # every repository in the config file
```

A bare invocation never fans out. What an argument names is read off the disk
rather than from how it is written: a path that is itself a checkout names
that repository, and a path that is not is searched for the checkouts under
it, descending through directories that are not checkouts — an owner
directory, a folder per client — and stopping at the ones that are.

A linked worktree collapses into the repository it belongs to, so a directory
holding a checkout and three of its worktrees sweeps one repository, not four.
Those worktrees still appear — as worktree rows in that repository's own
inventory.

The report ends with what the search cost — `searched 1 entry: 214
directories read, 12 checkouts found.` — because those numbers are how an
entry pointing at the wrong directory gets caught. A search that passes
10,000 directories says so on stderr while it is still running, and the walk
stops descending three levels below the entry.

An entry that resolves to nothing is reported rather than dropped. A worklist
that silently sweeps four of the five repositories it was given is worse than
one that says which it could not find.

## Options

| Flag | Effect |
| --- | --- |
| `--all` | Sweep the repositories named in the config file |
| `--config <path>` | Config file to read |
| `--scope <list>` | `local-branches`, `worktrees`, `remote-branches` |
| `--remote <name>` | Remote to measure against (default `origin`) |
| `--no-gh` | Classify on git evidence alone |
| `--no-fetch` | Skip the fetch; the header then says `not fetched` |
| `--keep` | Include `safe-to-keep` rows in the report |
| `--commands` | Print the proposed commands of rows that need no authorization, and nothing else |
| `--output json` | The full inventory, facts included |
| `--branch <name\|HEAD>` | Sweep one branch of this repository: its worktree, local and remote branch. Refuses the default branch |
| `--write-plan` | Write the deletable rows as a plan for `apply` |
| `--plan-out <path>` | Write the plan here; implies `--write-plan` |

A checkout directory named `apply` is swept as `./apply`.

## Plan and apply

```bash
repo-cleaner --branch HEAD --plan-out plan.json
repo-cleaner apply --plan plan.json --row worktree:/path/to/wt --row local_branch:feat/x
```

A plan holds each deletable row with a fingerprint of the facts behind its
verdict. `apply` sweeps again and drops a selected row that is gone, no longer
deletable, whose facts moved, or whose `requires` was not granted with
`--authorize <name>` (every row) or `--authorize <name>=<category>:<id>` (one
row). It then removes worktrees, deletes local branches, deletes remote
branches and prunes, in that order. Branch deletes are compare-and-swap, every
step is verified, and the first failure stops the run.

A receipt records every step and is rewritten after each one. Plans and receipts go under
`repo-cleaner/plans/` and `repo-cleaner/receipts/` in
[`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs)' standalone durable home
(`repo-cleaner` directory, `REPO_CLEANER_*` override variables), unless `--plan-out` or `--receipt-dir` says
otherwise. `--dry-run` checks again and prints the steps without writing anything.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Swept; or every selected row was applied or dropped with a reason |
| `1` | Failed against the state it found: a `{name}` token nothing defines, an unreadable plan, a row not in the plan |
| `2` | Cannot run as typed: an unknown flag, a malformed `--row`, `--branch` with `--all` or a path |
| `10` | Nothing to sweep: no entry named a repository |
| `11` | `apply` stopped at a failed step; the receipt says which |

## Configuration

Only the CLI reads a config file. The library takes repositories as an
argument, so a host that already knows where its repositories are passes them
in.

```yaml
paths:
  dev: ~/Developer
repos:
  - '{dev}'
  - ~/work/api
```

`paths:` names a directory once; any `repos:` entry then refers to it as
`{name}`. A token nothing defines is an error, not an empty path.

The file is [`@osdlc/config-layers`](https://www.npmjs.com/package/@osdlc/config-layers)'s machine config — `config.yaml` in the host
OS's config home, resolved through
[`@osdlc/tiered-dirs`](https://www.npmjs.com/package/@osdlc/tiered-dirs)' standalone tier (`repo-cleaner`
directory, `REPO_CLEANER_*` override variables):

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/repo-cleaner/config.yaml` |
| Linux and other | `$XDG_CONFIG_HOME/repo-cleaner/config.yaml`, else `~/.config/repo-cleaner/config.yaml` |
| Windows | `%APPDATA%\repo-cleaner\config.yaml` |

The `FLEET_ROOT`, `FLEET_*` and `FLEET_MACHINE_CONFIG` variables are no longer read; there is no fallback, and the replacements are `REPO_CLEANER_ROOT`, `REPO_CLEANER_*` and `REPO_CLEANER_MACHINE_CONFIG`.

`REPO_CLEANER_MACHINE_CONFIG`, or `--config <path>`, relocates it. A missing,
unreadable or malformed file degrades to no repositories rather than failing
the run.

## As a library

```ts
import { sweepRepo, sweepRepos } from '@osdlc/repo-cleaner'

const sweep = sweepRepo('/Users/me/work/api', { noGh: true })
for (const item of sweep.items) {
  console.log(item.classification, item.id, item.reason)
}

const result = sweepRepos(['~/Developer'], { cwd: process.cwd() })
```

`sweepRepo` never throws for a repository it cannot read: the failure comes
back as `error`, because a fan-out must not end on its first bad entry.

`fetch: true` runs `git fetch --prune --quiet --no-write-fetch-head <remote>`
before classifying, so ancestry is read against fresh remote-tracking refs.
That fetch is the only write. A repository whose fetch fails comes back with `error` starting
`fetch failed:` and no items. `repo.fetched` says which case applied. The
library default is off; the CLI fetches unless given `--no-fetch`.

### Adding knowledge the library does not have

Every row carries the facts behind its verdict, and `investigationParts` is a
list of sentences rather than a finished string. That is deliberate: a host
that knows something git does not — an issue tracker, a task corpus — re-ranks
the returned rows and appends its own sentence, instead of reaching into
classification. `applyPlan` takes the same re-ranking as its `annotate` hook,
so the rows it checks again are the rows the host planned from.

This works because of how the ladder is ordered. Every verdict the sweep
reaches on its own evidence outranks anything a host could contribute, so a
host never has to veto one. It only sharpens the rows left at `safe-to-keep`
or `needs-investigation`.

An issue tracker's linkage, applied this way, is a host's own layer over the
sweep and `applyPlan`.

## Runtime dependencies

`git` on `PATH`, and `gh` when PR state should count. Authentication is `gh`'s
own — this package reads no token.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
