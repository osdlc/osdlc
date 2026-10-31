# @osdlc/repo-cleaner

What has been merged into the default branch, and what can go away.

Point it at a repository and it inventories the local branches and
worktrees, and with `--remotes` the remote branches too, classifying each
as `safe-to-delete`, `safe-to-keep` or `needs-investigation` — with the
evidence behind the verdict and the literal command that would act on it.

`repo-cleaner` (or `repo-cleaner status`) never deletes anything. It prints
the commands that would. `repo-cleaner apply` deletes: it checks each row
again, shows you what it will delete and skip, and asks before it runs.

By default it works on your own machine only: worktrees and local branches,
nothing fetched and no `gh` call, compared with the `origin/<default>` you
last fetched (the header says `not fetched`). `--remotes` (or `--only
remotes`, or `--remote-url`) turns on all three things that need the
network: it fetches each remote first, asks `gh` about pull requests, and
sweeps remote branches. Remote branches are shared, often number in the
hundreds, and each one is compared with the default branch, so they make a
sweep much slower. A local report ends with a line saying what it left out.

Without `gh`, a squash-merged branch is still found by comparing patches,
but a clean worktree with no PR evidence reads `review` rather than
`delete`.

On a terminal, a long step draws a progress bar on stderr. `apply` lists
every step it will run, then ticks each one off (`✓`, or `✗` and the error)
as it finishes, with a bar for the whole run.

On a terminal, the report and the apply preview are colored: red for a
delete, blue for a prune, yellow for a review or a skipped row, green for a
keep. `NO_COLOR` turns this off. A pipe or a file gets no color unless
`FORCE_COLOR` asks for it.

```console
$ repo-cleaner --remotes
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

Three signals settle most items. The first two are enough alone; the third needs a content check too (see [Patch equivalence](#patch-equivalence)):

| Signal | Source |
| --- | --- |
| A `MERGED` pull request from this repository, into the default branch, whose head commit is the branch tip | `gh pr list`, one listing per repository |
| The branch tip is reachable from the default branch | `git merge-base --is-ancestor` |
| The branch's changes are on the default branch under other commit ids (rebase merge, cherry-pick, squash merge) | `git cherry` plus `git merge-tree`, see [Patch equivalence](#patch-equivalence) |

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
| `locked-worktree` | Someone ran `git worktree lock` and the lock's owner is alive or unknown; the reason is in `facts.lock_reason`. A lock whose owner is dead is not a blocker (see below). |
| `live-process` | A process other than an idle shell has its working directory in the worktree (`facts.live_processes`), lock or not. |
| `process-probe-failed` | The process table could not be read (no `lsof`, a timeout, an `lsof` that failed outright), so nobody can say the directory is idle. `facts.process_probe_error` has the message. |
| `hidden-index-flags` | Files marked skip-worktree or assume-unchanged hide edits from `status`. |
| `nested-repository` | An untracked or ignored directory holds a repository with its own history. |
| `branch-in-other-worktree` | Another worktree has the same branch checked out (`facts.other_worktrees`). |

### Patch equivalence

A rebase merge, a cherry-pick and a squash merge put the work on the default
branch under new commit ids, so the tip is not reachable from it and no PR
head matches. The sweep then compares by patch id (`git cherry`), which ignores
ids, messages and dates. It runs only when the first two signals do not
settle the item, for local branches, remote branches and worktrees alike.

A patch id is a heuristic, not proof, so a patch match alone does not make a
branch as safe as an ancestor. A second, independent check must agree:
`git merge-tree --write-tree <default> <tip>` must come out clean with exactly
the default branch's tree, which shows the branch's content is already there. It
needs git 2.38 or later; an older git, a conflict or any failure counts as not
agreed. The row is `safe-to-delete` either way, but only an agreed check drops
the `abandon-unmerged` authorization. Without it the row keeps requiring that
grant, and a worktree with unpushed commits stays `needs-investigation`. The row
carries three facts, and its reason says which case applied:

| Fact | Value |
| --- | --- |
| `facts.landing` | `patch-equivalent` |
| `facts.landing_check` | which check passed, below |
| `facts.landing_content_confirmed` | `true` when the merge-tree check agreed, `false` otherwise |

| `landing_check` | Meaning |
| --- | --- |
| `per-commit` | Every commit on the branch has a commit with the same patch id on the default branch. Covers rebase merges and cherry-picks. |
| `squashed` | A commit holding the branch's combined change (its tree on the merge base) has a commit with the same patch id on the default branch. Covers squash merges. |
| `head-moved` | A merged PR's head passes `squashed`, and every commit after that head passes `per-commit`. Covers a branch that moved on after its squash merge. |

`squashed` accepts any one commit on the default branch with the same net
patch, not necessarily one that came from this branch. That is acceptable only
because the content check, or the grant, stands behind it.

The squashed check builds one commit object with `git commit-tree` and no ref.
It leaves the index, the working tree and every ref alone, and needs no git
identity configured. Every git call of the check ignores `git replace` refs
(`GIT_NO_REPLACE_OBJECTS=1`).

The check decides what gets deleted, so a doubt is never evidence. None of
these count as landed:

- a commit that is not on the default branch, however many others are (the
  commits that are missing are listed in `facts.unmatched_commits` and in the
  investigation text when part of the work did land);
- a git call that fails, or output that cannot be read;
- a shallow clone, a missing merge base, a ref that does not resolve;
- an empty change: an empty commit, or a branch whose commits cancel out;
- any merge commit in the range, a plain merge of the default branch included,
  for `per-commit` (neither `git cherry` nor `git log` shows its change); the
  `squashed` check, which reads the combined change, can still pass;
- a squash merge that was edited by hand, because the patch ids differ.

A patch id says two changes are the same, not that they come from the same
branch, and it ignores whitespace. A one-line change that the default branch
also made independently, an indentation-only difference, or work that landed
and was then reverted all match by patch id; the content check does not agree
with them, so they keep needing the grant.

### Locks and running processes

A crashed coding agent leaves its worktree locked. The sweep reads one generic
token from the lock reason, `pid <N>`, optionally followed by `start <time>`,
and asks whether that process is still running. It reads nothing else of the
reason, so a free-form reason such as `keep, build running` always blocks.

- The owner is dead: the lock is not a blocker. `facts.stale_lock` is `true`,
  `facts.lock_owner` holds the pid and start time, and the row's commands begin
  with `git worktree unlock`. `apply` unlocks, removes and verifies it, and the
  receipt records the `unlock-worktree` step.
- The owner is alive, or cannot be ruled out: `locked-worktree`.
- A lock writes `pid <N>` and, to guard against pid reuse, `start <time>`. The
  time must be precise to the second: a full ISO-8601 timestamp with a time of
  day and a zone (`2026-10-25T18:22:19Z`; one with no zone is not accepted), epoch seconds (9-10 digits), epoch milliseconds
  (12-13 digits), or the `ps -o lstart` form (`Sat Oct 25 18:22:19 2026`). With
  one of those, a live pid whose own start time differs by more than two
  seconds is a reused pid and counts as dead. Anything else, a date alone, a
  short number or a partial date, cannot rule the owner out and the lock stays
  a blocker.
- Only `ps` exiting 1 with no output and no error text means "no such pid".
  Any other `ps` failure counts as alive.
- The `pid` token is trusted as a local pid. A pid from another container or
  host that shares the filesystem is looked up here, will not be found, and
  reads as dead; do not sweep a repository whose locks were written elsewhere.
- Before the unlock and again before the remove, `apply` asks again, and reads
  the process table afresh. If the owner is alive by then, or a process other
  than an idle shell works in the directory, or the table cannot be read, the
  step fails and the run stops. A row dropped at the re-sweep touches nothing;
  a step that fails at the unlock leaves the lock in place. `stale_lock` is part
  of a worktree row's fingerprint, so a lock taken after the plan was written
  drops the row too.
- If the remove fails after the unlock succeeded, the lock stays cleared:
  `@osdlc/typed-git` has no `worktree lock` verb to put it back. The failed
  step's receipt error says so.
- Separately, any process whose working directory is inside the worktree blocks
  it as `live-process`, lock or not. A shell (`sh`, `bash`, `zsh`, `fish`) is
  idle only when it has no child processes; it is then listed in
  `facts.idle_shells` and does not block. A shell with a child, or whose
  children are unknown, counts as a live process.

Both questions go to a `ProcessProbe` (`alive(pid, startedAt?)` and
`holders(path, { fresh? })`), passed as `probe` in the options of `sweepRepo`,
`sweepRepos` and `applyPlan`. The default, `defaultProcessProbe()`, runs
`ps -o lstart=`, `ps -A -o pid=,ppid=` and `lsof -d cwd` through
`@osdlc/command-seam`, and needs `ps` and `lsof` on `PATH`. It reads the
process table once per probe and reuses it for every worktree: `sweepRepo`
makes one probe per call, and `applyPlan` uses one probe for its re-sweep and
reads the table afresh for each pre-unlock and pre-remove check. Where the
table cannot be read the worktree is held back as `process-probe-failed`. A
host or test supplies its own probe.
Nothing is ever killed.

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

## Commands

```bash
repo-cleaner [status]   # the report: what is merged, what can go (the default)
repo-cleaner summary    # counts per repository: total, merged, delete, prune, review, keep
repo-cleaner plan       # the deletable rows as a plan, to stdout or -o <file>
repo-cleaner apply      # re-check, show the steps, ask, delete
```

All four take the same paths and sweep options.

```console
$ repo-cleaner summary --remotes
/Users/me/work/api  (acme/api, default main, origin)
                   total  merged  delete  prune  review   keep
  local branches      12       8       6      0       1      5
  worktrees            4       3       1      1       1      1
  remote branches     40      31      30      0       6      4

37 to delete, 1 to prune, 8 to review, across 1 repository.
```

`prune` counts worktree rows whose directory is gone, or is no longer a
checkout: deleting one runs `git worktree prune` to drop the stale link, and
a directory that is still there stays. The report labels those rows `prune`
rather than `delete`. In `--output json` they are `safe-to-delete` with
`action: "prune"`, and each summary bucket has a `prune` count, a part of its
`safe-to-delete` count.

`merged` counts rows whose work is on the default branch: by ancestry, by a
merged PR at the branch's head, or by a patch match. A branch checked out in a
worktree counts as merged by ancestry or PR alone. The default branch and the
primary worktree are counted in `total` but not judged. Each row's verdict is
in its `facts.merged`.

## Scope is opt-in

```bash
repo-cleaner                        # the repository you are standing in
repo-cleaner ~/work/api ~/work/web  # named repositories
repo-cleaner ~/Developer            # every checkout under it
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

### A remote with no checkout

```bash
repo-cleaner --remote-url git@github.com:acme/api.git
repo-cleaner apply --remote-url git@github.com:acme/api.git
```

`--remote-url <url>` sweeps a remote's branches when you have no checkout of
it. It clones the URL once, with `--no-checkout`, into
`repo-cleaner/remotes/` under the cache directory (`~/Library/Caches` on
macOS, `$XDG_CACHE_HOME` or `~/.cache` on Linux, `REPO_CLEANER_CACHE_DIR`
to move it), and sweeps that clone. Later runs reuse the clone and fetch. Only remote branches
are swept: the clone's own branches and worktree are not yours. Deletes are
pushed to the URL from the clone, compare-and-swap as always.

The clone is kept, not deleted after the run, so a plan written with
`--remote-url` can be applied later from anywhere: the plan names the clone's
directory. Remove the directory to drop it. The clone is a full one, not
`--filter=blob:none`: the patch check reads file contents, and a partial
clone fetches them one branch at a time.

The flag repeats for several remotes. It does not combine with paths,
`--branch` or `--plan`, `--only` may only name `remotes`, and an empty URL is
refused. A clone is reused only while its `origin` fetches from that URL and
pushes to it alone; `apply --plan` checks the same of a plan's clone before
deleting. The clone's directory name and every message carry the URL with
its credentials, query and fragment removed.

## Options

Every command that sweeps takes these:

| Flag | Effect |
| --- | --- |
| `--only <list>` | `worktrees`, `branches`, `remotes` (default: `worktrees,branches`) |
| `--remotes` | Also sweep remote branches. Slower: each one is compared with the default branch |
| `--branch <name\|HEAD>` | One branch of this repository: its worktree and local branch, and its remote branch with `--remotes`. Refuses the default branch |
| `--remote <name>` | Remote to measure against (default `origin`) |
| `--remote-url <url>` | Sweep this remote's branches with no checkout of your own (see [A remote with no checkout](#a-remote-with-no-checkout)); repeatable |
| `--no-gh` | With `--remotes`: classify on git evidence alone. Without `--remotes`, `gh` is never called |
| `--no-fetch` | With `--remotes`: skip the fetch; the header then says `not fetched`. Without `--remotes`, nothing is fetched |

`status` also takes:

| Flag | Effect |
| --- | --- |
| `--keep` | Include `safe-to-keep` rows in the report |
| `--commands` | Print the proposed commands of rows that need no authorization, and nothing else |
| `--output json` | The full inventory, facts included |

`--version` prints `repo-cleaner <version>` and exits; it must be the first
argument. A checkout directory named like a command (`status`, `summary`,
`plan`, `apply`, `dev`) is swept as `./status` and so on: `dev` runs the tool from a
checkout (see Running from a checkout).

## Plan and apply

```bash
repo-cleaner apply                          # sweep, show the steps, ask, delete
repo-cleaner apply --only worktrees --yes   # no question
repo-cleaner plan -o plan.json              # save the plan to review or edit
repo-cleaner apply --plan plan.json --row local_branch:feat/x
repo-cleaner plan | repo-cleaner apply --plan - --yes
```

A plan holds each deletable row with a fingerprint of the facts behind its
verdict. `apply` either sweeps and plans in memory, or reads a plan with
`--plan <file>` (`-` reads stdin). With no `--row` it applies every row judged
`safe-to-delete` and drops each row to review as `needs-review`. Name a row
with `--row <category>:<id>` to apply it, review rows included.

Before it deletes anything, `apply` sweeps again and drops a row that is gone,
no longer deletable, whose facts moved, or that carries a risk you did not
accept with `--allow <risk>` (every row) or `--allow <risk>=<category>:<id>`
(one row). It then shows, per repository, each row it will delete or prune
with the command under it, each row it will skip and why, and the counts, and
asks `Delete N items? [y/N]`:

```text
/Users/me/work/api
  delete  local_branch   fix/login-redirect
          git update-ref -d refs/heads/fix/login-redirect 3f9c2e1d…
  prune
          git -C /Users/me/work/api worktree prune
  skip    worktree       /Users/me/work/api/wt/spike
          needs-review: clean but no clear disposability signal; name it with --row to apply it

would delete: 1 local branch
dropped 1: 1 needs-review
Delete 2 items? [y/N]
```

The re-check reads only the categories the selected rows are in, so applying
a plan of local rows does not compare every remote branch again.
`--yes` skips the question. With no terminal to ask on and no `--yes`, it
refuses with exit 2 rather than deleting. `--plan -` needs `--yes` or
`--dry-run`, because stdin carries the plan. `--dry-run` prints the steps and
stops.

On yes it runs only the steps it showed: worktrees first, then local branches,
remote branches and a prune, in that order. Branch deletes are
compare-and-swap, every step is verified, and the first failure stops the run.

Every run ends with what it did:

```text
deleted: 1 worktree, 3 local branches, 2 remote branches, 1 stale worktree pruned
dropped 2: 1 needs-review, 1 duplicate
status: complete
```

The preview says `would delete:`, and a run that stops at a failed step says
how many rows it did not reach. `--output json` carries the same counts as
`summary`. Two clones of one remote list the same remote branches; `apply`
deletes each once and drops the other clone's row as `duplicate`. Remotes are
compared by the push URL git uses, with `url.*.insteadOf` applied.

A receipt records every step and is rewritten after each one. With
`--plan plan.json` it goes beside the plan, as
`plan.receipt-<timestamp>.json`. `--receipt <file>` puts it anywhere. A run
that swept, or read its plan from stdin, writes a receipt only when
`--receipt` names one; the printed steps are its record.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Swept; or `apply` ran, was declined, or had nothing to run |
| `1` | Failed against the state it found: an unreadable plan, a row not in the plan |
| `2` | Cannot run as typed: an unknown flag, a malformed `--row`, `--branch` with a path, `apply` with nobody to ask and no `--yes` |
| `10` | Nothing to sweep: no entry named a repository |
| `11` | `apply` stopped at a failed step; the receipt says which |

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
library default is off; the CLI fetches with `--remotes`, unless given `--no-fetch`.

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

## Running from a checkout

To try a change to repo-cleaner with the `repo-cleaner` already on your PATH, link a
checkout of this package:

```sh
repo-cleaner dev link ~/src/osdlc/packages/ts/repo-cleaner   # every `repo-cleaner` now runs that checkout
repo-cleaner dev status                             # which code runs, and why
repo-cleaner dev off                                # back to the installed copy
```

`REPO_CLEANER_HOME=<checkout> repo-cleaner …` does the same for one run. The checkout runs
from source under Bun, so it needs `bun` on PATH and the checkout's
dependencies installed and built. The installed copy says which checkout it
hands off to on stderr; `REPO_CLEANER_QUIET=1` silences that line.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
