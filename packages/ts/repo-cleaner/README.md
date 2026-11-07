# @osdlc/repo-cleaner

What has been merged into the default branch, and what can go away.

Point it at a repository and it lists the worktrees and local branches, and
with `--remote` the remote branches too, and judges each one: `delete`,
`review`, `keep` or `blocked`, with the evidence behind the verdict, the risks
deleting it carries, and the literal command that would delete it.

`repo-cleaner` never deletes anything; it prints the commands that would.
`repo-cleaner clean` deletes: it checks each row again, shows you what it
will delete and skip, and asks before it runs.

By default it works on your own machine only: worktrees and local branches,
nothing fetched and no pull-request lookup, compared with the
`origin/<default>` you last fetched (the header says `not fetched`).
`--remote` turns on all three things that need the network: it fetches each
remote first, asks GitHub or GitLab about pull requests, and judges remote
branches. Remote branches are shared, often number in the hundreds, and each
one is compared with the default branch, so they make a sweep much slower. A
local report ends with a line saying what it left out.

Without a pull-request lookup, a squash-merged branch is still found by
comparing patches, and a clean worktree merged by ancestry is `delete` once
its branch shows it was worked on (see [How it decides](#how-it-decides)); one
that looks freshly made stays `review`.

```console
$ repo-cleaner --remote
/Users/me/work/api  (acme/api, default main, origin)
  branch    fix/login-redirect     delete   PR #412 merged
            git update-ref -d refs/heads/fix/login-redirect 3f9c2e1d8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d
  branch    spike/cache            review   mixed or absent signals; needs --allow abandon-unmerged (drops 2 commits)
            git update-ref -d refs/heads/spike/cache 9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b
  worktree  /Users/me/work/wt/412  delete   clean; PR #412 merged
            git -C /Users/me/work/api worktree remove /Users/me/work/wt/412
  remote    origin/fix/login-…     delete   PR #412 merged (auto-delete didn't fire)
            git push --force-with-lease=refs/heads/fix/login-redirect:3f9c2e1d8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d origin :refs/heads/fix/login-redirect

3 to delete, 1 to review, across 1 repository.
```

On a terminal, the report and the preview are colored: red for a delete,
blue for a prune, yellow for a review, a blocked or a skipped row, green for a
keep. `NO_COLOR` turns this off; a pipe or a file gets no color unless
`FORCE_COLOR` asks for it. A long sweep step draws a progress bar on stderr,
and `clean` draws its steps as a list that updates in place, with a bar for the
whole run underneath:

```text
  ██████████ ✓ delete  branch:feat/a
  █████░░░░░ › delete  branch:feat/b
  ░░░░░░░░░░   delete  remote:origin/feat/b
  ░░░░░░░░░░   prune   worktree:/Users/me/work/wt/old
  ████████░░░░░░░░░░░░░░░░░░░░░░ 1/4
```

A list taller than the terminal scrolls to keep the running step in view, and
a failed step's error is printed in full under the list.

## Install

```sh
npm install @osdlc/repo-cleaner
```

ESM only. Compiled JavaScript with type declarations, for Node 22 or newer.

For the command, install it globally:

```sh
npm install -g @osdlc/repo-cleaner
```

If the shell then says `Unknown command` or `command not found`, npm put the
command in a directory that is not on `PATH`. `npm prefix -g` prints where
it went; the command is in its `bin`. This is common with a Node version
manager (proto, nvm, fnm, volta): each Node version has its own global
directory, and a shell setup that names one version's `bin` directly misses
the others. Let the manager set `PATH` instead. In fish, with proto:

```fish
# ~/.config/fish/config.fish, in place of a fish_add_path …/node/<version>/bin line
proto activate fish | source
```

nvm users in fish can use a fish port such as `nvm.fish`; fnm has
`fnm env --use-on-cd --shell fish | source`. Then open a new shell and check
with `type repo-cleaner`.


## Commands

```bash
repo-cleaner [target...]          # the report: what is merged, what can go; deletes nothing
repo-cleaner plan  [target...]    # save the sweep's rows and their evidence, to run later (-o <file>)
repo-cleaner clean [target...]    # check again, show the steps, ask, delete
repo-cleaner cache                # list or remove the clones kept for remote URL targets
repo-cleaner dev                  # run repo-cleaner from a development checkout
```

Every command takes `--help`, and `--help --extended` for the full reference:
what each option means, the words the report uses, and which combinations are
refused. A checkout directory named like a command is swept as `./<name>`.

### Targets

A target is what to sweep:

| Target | Swept |
| --- | --- |
| a checkout | that repository; a linked worktree sweeps the repository it belongs to |
| a directory | every checkout found under it, three levels deep at most |
| a remote URL (`https://`, `ssh://`, `file://`, `user@host:path`) | its remote branches only, through a clone kept in the cache directory (see [A remote with no checkout](#a-remote-with-no-checkout)) |

No target sweeps the checkout you are in. A bare invocation never fans out.
What a target names is read off the disk rather than from how it is written:
a path that is itself a checkout names that repository, and a path that is
not is searched for the checkouts under it, descending through directories
that are not checkouts and stopping at the ones that are. A directory holding
a checkout and three of its worktrees sweeps one repository, not four; the
worktrees appear as rows of that repository.

The report ends with what the search cost — `searched 1 target: 214
directories read, 12 checkouts found.` — because those numbers are how a
target pointing at the wrong directory gets caught. A search that passes
10,000 directories says so on stderr while it is still running. A target that
resolves to nothing is reported rather than dropped.

### Sweep options

The report, `plan` and `clean` take these:

| Option | Meaning |
| --- | --- |
| `--remote` | Also judge remote branches. Turns on the network: fetches each remote first and asks GitHub or GitLab about pull requests. Slower. |
| `--offline` | With `--remote`: do not fetch. Judge against the remote-tracking refs already on disk, remote branches included, so judging needs no access to the remote. Pull requests are still looked up; add `--provider none` for no network at all. The refs can be stale: see [`--offline` reads what is already on disk](#--offline-reads-what-is-already-on-disk). |
| `--only <kinds>` | Only these kinds of row: `worktree`, `branch`, `remote`, comma-separated. Default: `worktree,branch`, plus `remote` with `--remote`. Naming `remote` implies `--remote`. |
| `--branch <name\|HEAD>` | Only the rows of one branch: its worktree, its local branch, and its remote branch with `--remote`. `HEAD` is the branch checked out at the target. Never the default branch. |
| `--against <remote>` | The remote whose default branch counts as "merged into". Default: `origin`, then the first remote. |
| `--provider <name>` | With `--remote`: where pull requests come from. `auto` (by the remote's host), `github`, `gitlab`, or `none` to judge on git evidence alone. |
| `--no-progress` | No progress line on stderr. |

### The report

`repo-cleaner [target...]` lists each row with its verdict, why, the risks it
carries, and the command that would delete it.

| Option | Meaning |
| --- | --- |
| `--all` | Also show `keep` rows. By default only `delete`, `review` and `blocked` rows are listed. Only with `--format text`. |
| `--format text` | The report. The default. |
| `--format summary` | Counts per repository: total, merged, delete, prune, review, blocked, keep. |
| `--format commands` | Only the commands of `delete` rows that carry no risk, ready to copy. |
| `--format json` | Everything, evidence included, for scripts. |

```console
$ repo-cleaner --format summary --remote
/Users/me/work/api  (acme/api, default main, origin)
                   total  merged  delete  prune  review  blocked   keep
  local branches      12       8       6      0       1        0      5
  worktrees            4       3       1      1       0        1      1
  remote branches     40      31      30      0       6        0      4

37 to delete, 1 to prune, 7 to review, 1 blocked, across 1 repository.
```

`prune` counts worktree rows whose directory is gone, or is no longer a
checkout: deleting one drops the stale record, with `git worktree remove
<path>` for a directory that is gone (that worktree's record alone) and the
repository-wide `git worktree prune` for one left without its `.git`, and a
directory that is still there stays. `merged` counts rows whose work is on
the default branch, by ancestry, by a merged PR at the branch's head, or by a
patch match; the default branch and the primary worktree are counted in
`total` but not judged.

### `repo-cleaner plan`

Sweeps and saves every row, each with a fingerprint of the evidence behind its
verdict, so it can be reviewed now and run later with
`clean --plan`. `-o, --out <file>` sets where it goes; the default, `-`, is
stdout, and the totals line goes to stderr.

### `repo-cleaner clean`

Sweeps (or reads `--plan`), checks every row again, shows the steps, asks,
then deletes, compare-and-swap, verifying each step and stopping at the first
failure. Without `--pick` it runs every row judged `delete`.

| Option | Meaning |
| --- | --- |
| `--pick <row>` | Work on exactly these rows. See [Pick and spare](#pick-and-spare). Repeatable. |
| `--spare <row>` | Leave this row alone, and make sure it is what you saw. Repeatable. |
| `--allow <risk>` | Accept this risk for every row that carries it. |
| `--allow <risk>=<row>` | Accept it for that one row only. |
| `--plan <file\|->` | Run a saved plan instead of sweeping now (`-` reads stdin). Rows whose evidence changed since the plan are dropped, not deleted. |
| `-y, --yes` | Do not ask. Without it, and with no terminal to ask on, `clean` refuses. |
| `--dry-run` | Check and show the steps, then stop. |
| `--receipt <file>` | Write a record of every step, rewritten after each one. Default: next to a `--plan` file; none otherwise. |
| `--format text\|json` | How the steps and the outcome are shown. |

```text
/Users/me/work/api
  delete  branch:fix/login-redirect
          git update-ref -d refs/heads/fix/login-redirect 3f9c2e1d…
  prune   worktree:/Users/me/work/wt/old
          git -C /Users/me/work/api worktree remove /Users/me/work/wt/old
  skip    worktree:/Users/me/work/wt/spike
          needs-pick: review: clean but no clear disposability signal; pick it to run it

would delete: 1 local branch, 1 stale worktree pruned
skipped 1, not deleted: 1 needs-pick (name with --pick)
Delete 2 items? [y/N]
```

`clean` throws away anything typed while the sweep ran, so a key pressed
early cannot answer the question, and says so when it did.

### Pick and spare

**`--pick <row>`** means "work on exactly these rows". It does two things:

1. **It narrows the run.** Only the picked rows are considered; everything
   else is left alone.
2. **It opts in rows that never run otherwise.** Without `--pick`, `clean`
   deletes only rows judged `delete`. A `review` row, or a `keep` row with an
   action (a branch with an open pull request), is deleted only when it is
   named, so a borderline row never goes as part of a batch.

Picking does not approve anything: a picked row that carries a risk still
needs `--allow` for it. A `blocked` row, or a `keep` row with no action, is
skipped and shown with the reason.

**`--spare <row>`** means "leave this row alone, and make sure it is what I
saw". The usual case: delete a merged worktree and its local branch, but keep
the branch on the remote as a backup.

- A spared row is not deleted, even if it is judged `delete`.
- A spared remote branch is still checked. If it is gone or its tip moved
  since the plan, the run stops before deleting anything: you spared it for
  what it held, so if that changed, the rest of the plan rests on a wrong
  assumption. The run's first step checks the tip again with `git ls-remote`,
  so one that moves after the check stops the run too. Under `--offline`, a
  branch the remote already deleted passes as already gone, since its
  tracking ref outlived it; one whose tracking ref was pruned after the plan
  still stops the run.
- Sparing a worktree also spares its branch, which was only free to delete
  because the worktree was going.

### Rows, verdicts and risks

A **row** is one thing that could be deleted, named `<kind>:<name>`. A bare
name or path works when only one row has it.

| Row | What it is | Deleted with |
| --- | --- | --- |
| `worktree:<path>` | a linked worktree | `git worktree remove`; when its directory is already gone, the same on its record alone, or `git worktree prune` when the directory is left without its `.git` |
| `branch:<name>` | a local branch | `git update-ref -d refs/heads/<name> <sha>` |
| `remote:<remote>/<name>` | a branch on a remote | `git push --force-with-lease=…:<sha> <remote> :refs/heads/<name>` |

A **verdict** is what the sweep concluded about a row:

| Verdict | Meaning | What `clean` does |
| --- | --- | --- |
| `delete` | Its work is on the default branch, or it is otherwise safe to lose | Deletes it, once its risks are allowed |
| `review` | The signals are mixed, or it holds work | Deletes it only when picked and its risks are allowed |
| `blocked` | Something rules removal out, such as a lock, a running process, or a submodule that cannot be read | Never deletes it; fix the cause and sweep again |
| `keep` | Structural (the default branch, the current checkout, the primary worktree), or in use (an open pull request) | Never deletes a structural row; deletes one in use only when picked and `confirm-open-pr` is allowed |

The report shows `prune` for a `delete` row whose worktree directory is
already gone: only the stale record goes.

A **risk** is what deleting a row would lose. Each row lists its risks, and
you approve them by name with `--allow`:

| Risk | Meaning |
| --- | --- |
| `abandon-unmerged` | Commits not on the default branch and not captured by an exact-head merged PR, or a worktree's (or its submodules') commits and stashes that no remote has. `evidence.uniqueCommits` counts the commits. |
| `discard-changes` | Uncommitted or untracked files in the worktree or any of its submodules. |
| `confirm-open-pr` | The branch has an open pull request, or open pull requests could not be checked (the CLI is missing or signed out, or the listing failed) so one cannot be ruled out; deleting the remote branch closes it. |

A worktree's submodules are part of it: one `--allow` on the worktree row
covers the same risk in every submodule. A stash in the worktree itself is
shared with the main checkout and survives, so it carries no risk.

A branch whose worktree is judged `delete` is not held by it: the sweep judges
the branch on its own and records the worktree's path in `evidence.worktree`,
so one run removes the worktree and then deletes the branch. `clean` deletes
such a branch only when the same run removes its worktree, and drops it as
`held` otherwise. With `--only branch` no worktree is swept, so the branch
stays held.

### Refused combinations

A combination of options is refused when it contradicts itself, or when one of
its options would have no effect: a flag that is silently ignored leaves you
believing something that is not true. repo-cleaner never guesses, and no
option silently overrides another.

Refused before anything is deleted, with exit 2. Most are refused before
anything is swept; a row named two ways (a bare name and its id), and an
`--allow` for a row, are checked against the plan, after the sweep:

| Combination | Why |
| --- | --- |
| The same row in `--pick` and `--spare` | Asks for the row to be deleted and kept |
| `--allow <risk>=<row>` for a spared row, or for a row outside `--pick` | Approves deleting something that will not be deleted |
| A picked or spared row of a kind `--only` leaves out | The row cannot be in the run |
| A picked or spared row that is not one of `--branch`'s rows | The same |
| `--branch` with more than one target, with a remote URL, or naming the default branch | `--branch` means one branch of one checkout, and the default branch is never a candidate |
| `--plan` with targets or sweep options | The plan already fixed what is swept |
| `--plan -` without `--yes` or `--dry-run` | stdin carries the plan, so nothing can ask |
| `--yes` with `--dry-run` | One deletes without asking, the other deletes nothing |
| `--receipt` with `--dry-run` | Nothing runs, so there is nothing to record |
| `--offline` or `--provider` without `--remote` | Nothing is fetched or looked up without it |
| `--remote` with an `--only` that leaves `remote` out | They ask for opposite things |
| A remote URL target with `--only worktree` or `--only branch`, with `--offline`, or mixed with checkout targets | A remote URL has only remote branches, and it is fetched to be swept |
| `--all` with any `--format` but `text` | `--all` shows keep rows in the text report only |

Refused after the sweep, before deleting, with exit 1:

- a picked, spared or allowed row the plan does not have;
- a row name that matches rows in more than one repository: sweep or plan
  only the repository it is in (a bare name can also be given as its full id,
  when the matches are of different kinds);
- a spared remote branch that moved since the plan, or that the re-check no
  longer finds.

Allowed, because nothing contradicts:

| Combination | What happens |
| --- | --- |
| The same row picked twice | It runs once |
| `--allow <risk>` with `--allow <risk>=<row>` | The broader one covers it |
| `--allow` for a risk no row that runs carries | Runs; the preview lists it as `unused` |
| Picking a `blocked` or `keep` row | It is skipped and shown with the reason; the rest runs |
| `--only remote` without `--remote` | Asking for remote branches implies the network |

### A remote with no checkout

```bash
repo-cleaner git@github.com:acme/api.git
repo-cleaner clean git@github.com:acme/api.git
```

A remote URL target sweeps a remote's branches when you have no checkout of
it. It clones the URL once, with `--no-checkout`, into
`repo-cleaner/remotes/` under the cache directory (`~/Library/Caches` on
macOS, `$XDG_CACHE_HOME` or `~/.cache` on Linux, `REPO_CLEANER_CACHE_DIR` to
move it), and sweeps that clone. Later runs reuse the clone and fetch. Only
remote branches are swept: the clone's own branches and worktree are not
yours. Deletes are pushed to the URL from the clone, compare-and-swap as
always. A local bare repository is named as `file:///path/to/repo.git`.

The clone is kept, not deleted after the run, so a plan of a remote URL can
run later from anywhere: the plan names the clone's directory.
`repo-cleaner cache` lists the clones with their URL and size;
`repo-cleaner cache remove <url>` drops one, and `cache remove --all` drops
every one, a clone left by a stopped run included. A plan whose clone was
removed cannot run; sweep again. The clone is a full one, not
`--filter=blob:none`: the patch check reads file contents.

A clone is reused only while its `origin` fetches from that URL and pushes to
it alone; `clean --plan` checks the same of a plan's clone before deleting.
The clone's directory name and every message carry the URL with its
credentials, query and fragment removed.

## How it decides

Three signals settle most items. The first two are enough alone; the third needs a content check too (see [Patch equivalence](#patch-equivalence)):

| Signal | Source |
| --- | --- |
| A `MERGED` pull request from this repository, into the default branch, whose head commit is the branch tip | `gh pr list` (or `glab` for GitLab), one listing per repository |
| The branch tip is reachable from the default branch | `git merge-base --is-ancestor` |
| The branch's changes are on the default branch under other commit ids (rebase merge, cherry-pick, squash merge) | `git cherry` plus `git merge-tree`, see [Patch equivalence](#patch-equivalence) |

Ancestry is measured against `<remote>/<default>`, so work merged only into an
unpushed local default branch does not count. Without a remote, the local
default branch is used.

A merged PR that fails the head or base check is kept in `evidence.pr` with
`proof` set to `head-moved` or `other-base`. Fork PRs are ignored.

Everything else is held back. A branch that is neither merged nor an ancestor
is `review` with the reasons spelled out, not a guess. A worktree
holding uncommitted or unpushed work is never proposed for removal whatever
else is true of it — losing an hour of someone's work costs more than any
amount of clutter.

A clean worktree whose HEAD is merged by ancestry alone, with no merged PR
or patch match, needs one more sign, because a worktree that `git worktree
add -b` just made from the default branch is merged that way too, and
removing it would lose the ignored files of work about to start. The sign is
in `evidence.branchUsed`: `commits` when the branch's reflog records a commit,
cherry-pick, `am`, or a merge or pull that made a merge commit (a
fast-forward only moves the branch), and `upstream` when the branch
tracks a branch on a remote, other than the default branch (a branch made
with `--track` from `main` or `origin/main` does not count). With either, the worktree
is `delete`; with neither (`null`) it stays `review`.

Some worktrees are held back whatever their branch says and whatever is
allowed. Each lands in `row.blockers`, the row's verdict is `blocked`, and it
carries no command and no action:

| Blocker | Why |
| --- | --- |
| `locked-worktree` | Someone ran `git worktree lock` and the lock's owner is alive or unknown; the reason is in `evidence.lockReason`. A lock whose owner is dead is not a blocker (see below). |
| `live-process` | A process other than an idle shell has its working directory in the worktree (`evidence.liveProcesses`), lock or not. |
| `process-probe-failed` | The process table could not be read (no `lsof`, a timeout, an `lsof` that failed outright), so nobody can say the directory is idle. `evidence.processProbeError` has the message. |
| `hidden-index-flags` | Files marked skip-worktree or assume-unchanged hide edits from `status`. |
| `nested-repository` | An untracked or ignored directory holds a repository with its own history. |
| `branch-in-other-worktree` | Another worktree has the same branch checked out (`evidence.otherWorktrees`). |
| `submodule-unreadable` | A submodule could not be read, so nobody can say it is safe to lose (see [Submodules](#submodules)). |

### Submodules

A linked worktree's submodules keep their git dirs inside the worktree's own
git dir (`.git/worktrees/<id>/modules/<name>`), not the main checkout's. Removing
the worktree, or pruning it once its directory is gone, deletes them: a commit
made in a submodule and never pushed goes with it, and so does a stash or a
local branch. Plain `git worktree remove` refuses every worktree with a
checked-out submodule, or with a submodule git dir a `git submodule deinit`
left behind, whatever state it is in. It takes `--force`, and `--force` also
skips git's own check for modified and untracked files.

So the sweep reads every submodule itself, nested ones through their parents,
and every left-over submodule git dir, and records what it found in
`evidence.submodules`. A submodule is judged as part of its worktree: the same
risks apply wherever they are, and one `--allow` on a worktree row covers its
submodules too.

| Found in a submodule | Effect on the worktree row |
| --- | --- |
| Commits on HEAD or a local branch that no remote-tracking ref holds, or a stash | `review`, carries `abandon-unmerged`; the reason names each submodule and what it holds |
| Modified, staged or untracked files | `review`, carries `discard-changes`; `evidence.submoduleDirtyFiles` counts them |
| Skip-worktree or assume-unchanged files, nested repositories | `hidden-index-flags`, `nested-repository`, with the submodule's path in front |
| A git call that failed | `submodule-unreadable` blocker |

A worktree whose submodules are all clean and pushed is judged as any other,
and when it is `delete` its command is `git worktree remove --force`
(`evidence.forcedForSubmodules` is `true`, and the reason says why). Just before that
remove, `clean` checks the worktree's own files and every submodule again,
since git will not, and refuses the step if it would lose anything not allowed. A submodule's
state is part of the plan fingerprint, so a submodule that moved since the plan
drops the row first.

A worktree whose directory is gone is read through its git dir: unpushed work
in a left-over submodule git dir makes the prune row a `review` that carries
`abandon-unmerged`.
A worktree whose directory is gone is removed by its own record. One whose
directory is left without its `.git` takes the repository-wide `git worktree
prune`, which drops every gone worktree, not only the planned one. So such a
row runs last, and only while every other gone worktree that prune would drop
goes in the same run; otherwise `clean` drops it (`blocked`, with the reason).
A run never drops the record of a gone worktree it did not select.

Commits count as pushed only when a remote-tracking ref of the submodule holds
them. A superproject that records a submodule commit reachable from no branch
on the submodule's remote (fetched by sha, or on a branch since deleted) carries
`abandon-unmerged` until a fetch brings it under one.

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
agreed. The row is `delete` either way, but only an agreed check drops the
`abandon-unmerged` risk. Without it the row keeps carrying that risk, and a
worktree with unpushed commits stays `review`. The row carries three pieces of
evidence, and its reason says which case applied:

| Evidence | Value |
| --- | --- |
| `evidence.landing` | `patch-equivalent` |
| `evidence.landingCheck` | which check passed, below |
| `evidence.landingContentConfirmed` | `true` when the merge-tree check agreed, `false` otherwise |

| `landing_check` | Meaning |
| --- | --- |
| `per-commit` | Every commit on the branch has a commit with the same patch id on the default branch. Covers rebase merges and cherry-picks. |
| `squashed` | A commit holding the branch's combined change (its tree on the merge base) has a commit with the same patch id on the default branch. Covers squash merges. |
| `head-moved` | A merged PR's head passes `squashed`, and every commit after that head passes `per-commit`. Covers a branch that moved on after its squash merge. |

`squashed` accepts any one commit on the default branch with the same net
patch, not necessarily one that came from this branch. That is acceptable only
because the content check, or `--allow abandon-unmerged`, stands behind it.

The squashed check builds one commit object with `git commit-tree` and no ref.
It leaves the index, the working tree and every ref alone, and needs no git
identity configured. Every git call of the check ignores `git replace` refs
(`GIT_NO_REPLACE_OBJECTS=1`).

The check decides what gets deleted, so a doubt is never evidence. None of
these count as landed:

- a commit that is not on the default branch, however many others are (the
  commits that are missing are listed in `evidence.unmatchedCommits` and in the
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
with them, so they keep needing `--allow abandon-unmerged`.

### Locks and running processes

A crashed coding agent leaves its worktree locked. The sweep reads one generic
token from the lock reason, `pid <N>`, optionally followed by `start <time>`,
and asks whether that process is still running. It reads nothing else of the
reason, so a free-form reason such as `keep, build running` always blocks.

- The owner is dead: the lock is not a blocker. `evidence.staleLock` is `true`,
  `evidence.lockOwner` holds the pid and start time, and the row's commands begin
  with `git worktree unlock`. `clean` unlocks, removes and verifies it, and the
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
- Before the unlock and again before the remove, `clean` asks again, and reads
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
  `evidence.idleShells` and does not block. A shell with a child, or whose
  children are unknown, counts as a live process.

Both questions go to a `ProcessProbe` (`alive(pid, startedAt?)` and
`holders(path, { fresh? })`), passed as `probe` in the options of `sweep`,
`check` and `run`. The default, `defaultProcessProbe()`, runs
`ps -o lstart=`, `ps -A -o pid=,ppid=` and `lsof -d cwd` through
`@osdlc/command-seam`, and needs `ps` and `lsof` on `PATH`. It reads the
process table once per probe and reuses it for every worktree: `sweep` makes
one probe per repository, and `run` uses one probe for its re-sweep and
reads the table afresh for each pre-unlock and pre-remove check. Where the
table cannot be read the worktree is held back as `process-probe-failed`. A
host or test supplies its own probe.
Nothing is ever killed.

When the provider's CLI is missing or signed out, or a lookup fails, the
sweep keeps going on what git alone can tell it: see
[When a lookup fails](#when-a-lookup-fails).

Every branch delete names the full sha the sweep judged. `update-ref -d` and
the pinned `--force-with-lease` push both refuse when the branch has moved
since, so a commit pushed while you read the plan survives it.

## When a lookup fails

A sweep asks three things of the outside world: `git fetch` for the remote's
current state, `git ls-remote` for its branches, and `gh` or `glab` for pull
requests. Any of them can fail: the network is down, the repository was
renamed or deleted, the signed-in account cannot see it, a rate limit.

The rule is that a failed lookup costs only what it would have told you. The
rows that did not need it are judged as usual, the rows that did are judged
without it, and the repository carries a `note` saying what was missing. Only
a failed fetch costs the whole repository.

| What failed | What you get |
| --- | --- |
| `gh pr list` / `glab api` (the PR listing) | Every row is judged on git evidence. Remote branches with no known PR need `--allow confirm-open-pr` to delete. One note on the repository. |
| `gh` / `glab` not installed or not signed in | The provider is never asked, so this is treated like a failed listing: every row is judged on git evidence, remote branches with no known PR need `--allow confirm-open-pr` to delete, and a note on the repository says why. Pass `--provider none` if the remote has no forge, so there is nothing to check. |
| `git ls-remote`, after a fetch that worked | Remote branches are read from the refs that fetch just wrote. A note on the repository and on each remote row. |
| `git fetch` | The repository is an error with no rows. Every row would otherwise be judged against an older default branch than the one you asked for. |

### Example: a repository `gh` cannot see

The remote names a repository that was deleted, or that your account cannot
read. In 0.18 and earlier the repository came back as an error, and none of
it was judged:

```console
$ repo-cleaner --remote --offline
~/work/app  (acme/app, default main, origin, not fetched)
  error: GitHub has no such pull request, issue or repository, or you cannot see it.

0 to delete, 0 to review, across 1 repository (1 unreadable).
```

Now the merged branch is still found, and the note says what was missing.
When the remote names no forge (a local path, or a host `auto` could only
guess was GitHub), the note also suggests `--provider none`:

```console
$ repo-cleaner --remote --offline
~/work/app  (acme/app, default main, origin, not fetched)
  note: Listing PRs with `gh pr list` failed (GitHub has no such pull request, issue or repository, or you cannot see it.); judged on git evidence alone.
  branch  feat/login         delete   fully merged into origin/main
          git update-ref -d refs/heads/feat/login 44d2db93…
  remote  origin/feat/login  delete   fully merged into origin/main; needs --allow confirm-open-pr
          git push --force-with-lease=refs/heads/feat/login:44d2db93… origin :refs/heads/feat/login

2 to delete, 0 to review, across 1 repository.
```

### Why the remote branch needs `confirm-open-pr`

Deleting the head branch of an open pull request closes that pull request.
When the listing works, `repo-cleaner` knows which branches have one. When it
failed, or could not run because `gh` is missing or signed out, it cannot
tell, so it does not delete a remote branch on its own say:

```console
$ repo-cleaner clean --remote --offline --yes
repo-cleaner clean: ~/work/app: Listing PRs with `gh pr list` failed (GitHub has no such pull request, …); judged on git evidence alone.
skipped  remote:origin/feat/login — not-allowed (needs confirm-open-pr)
ok       branch:feat/login — git update-ref -d refs/heads/feat/login 44d2db93… (ref does not resolve)

deleted: 1 local branch
skipped 1, not deleted: 1 not-allowed (--allow confirm-open-pr)
status: complete
```

The local branch went; the remote branch stayed. To go on, pick one:

- Fix the lookup (install `gh`, sign in, check the remote URL) and run again.
- Pass `--provider none` if this remote has no forge at all, so there is no
  pull request to lose.
- Check for open pull requests yourself, then pass `--allow confirm-open-pr`.

The same happens when `gh` is not installed or not signed in. Nothing was
asked, so nothing can rule out an open pull request:

```console
$ repo-cleaner --remote --offline
~/work/app  (acme/app, default main, origin, not fetched)
  note: Could not check for open PRs: `gh` is not installed, so deleting a remote branch needs confirm-open-pr. Install `gh`, or pass `--allow confirm-open-pr` once you have checked.
  branch  feat/login         delete   fully merged into origin/main
          git update-ref -d refs/heads/feat/login 255acd56…
  remote  origin/feat/login  delete   fully merged into origin/main; needs --allow confirm-open-pr
          git push --force-with-lease=refs/heads/feat/login:255acd56… origin :refs/heads/feat/login

2 to delete, 0 to review, across 1 repository.
```

`--provider none` is how you say the remote has no forge: then there is no
lookup, no note and no gate.

### `--offline` reads what is already on disk

`--offline` does not fetch, and reads remote branches from the
remote-tracking refs (`refs/remotes/<remote>/`) instead of asking the remote
with `git ls-remote`. So judging works with no network and with a remote that
no longer exists. In 0.18 and earlier it still called `git ls-remote`, and a
remote that could not be read failed the whole repository:

```console
$ repo-cleaner --remote --offline --provider none     # 0.18 and earlier
~/work/api  (default main, origin, not fetched)
  error: git ls-remote: The remote '/srv/git/api.git' does not exist or is not a git repository. …
```

```console
$ repo-cleaner --remote --offline --provider none     # now
~/work/api  (default main, origin, not fetched)
  branch  feat/login         delete   fully merged into origin/main
          git update-ref -d refs/heads/feat/login 255acd56…
  remote  origin/feat/login  delete   fully merged into origin/main
          git push --force-with-lease=refs/heads/feat/login:255acd56… origin :refs/heads/feat/login

2 to delete, 0 to review, across 1 repository.
```

`--offline` still asks `gh` or `glab` about pull requests. Add
`--provider none` to judge with no network at all. `clean` always contacts
the remote for its remote steps: it pushes the deletes and checks spared tips
with `git ls-remote`.

The refs on disk can be stale. A remote-tracking ref stays until the next
`git fetch --prune`, so a branch the forge deleted after its pull request
merged still shows as a row. `clean` handles that: when the delete is refused
and the remote no longer lists the branch, the step reports it as already
gone, removes the stale tracking ref, and the run goes on. The summary counts
it apart from what the run deleted:

```console
$ repo-cleaner clean --remote --offline --provider none --only remote --yes
ok       remote:origin/feat/cart — git push … origin :refs/heads/feat/cart (ls-remote lists nothing)
ok       remote:origin/feat/search — git push … origin :refs/heads/feat/search (already gone from origin)

deleted: 1 remote branch, 1 remote branch already gone
status: complete
```

A remote branch you `--spare` (see [Pick and spare](#pick-and-spare)) gets
the same treatment. If an offline plan's tip check finds it gone, the step
reports `already gone from origin; spared` and the run goes on. If its
tracking ref was pruned after the plan, the re-check no longer finds the row
and refuses the run; plan again. A plan made online read its tips live, so a
spared branch that has gone since refuses the run.

### In the library

The same information is on the result, for a host to show or act on:

- `RepoSweep.notes`: one sentence for each lookup the repository was judged
  without. Empty when everything answered.
- `RepoInfo.provider.listError`: the provider's own reason, when its listing
  failed.
- `Preview.notes` (`check`) and `RunOptions.onNotes` (`run`): the same notes
  from their re-checks, which sweep again and can meet a failure the first
  sweep did not.
- `RunSummary.gone`: remote branches a delete step found already gone.

```ts
import { sweep } from '@osdlc/repo-cleaner'

const result = sweep(['.'], { remote: true, offline: true, provider: 'github' })
for (const repo of result.repos) {
  if (repo.error !== null) {
    console.log(`${repo.path}: could not be swept: ${repo.error}`)
    continue
  }
  for (const note of repo.notes) console.log(`note: ${note}`)
  console.log(`listError: ${repo.repo?.provider?.listError ?? '(none)'}`)
  for (const row of repo.rows) console.log(row.id, row.verdict, row.risks.join(', ') || '-')
}
```

```text
note: Listing PRs with `gh pr list` failed (GitHub has no such pull request, …); judged on git evidence alone.
listError: GitHub has no such pull request, issue or repository, or you cannot see it.
worktree:/Users/me/work/app keep -
branch:feat/login delete -
branch:main keep -
remote:origin/feat/login delete confirm-open-pr
remote:origin/main keep -
```

The local branch needs no grant: deleting it closes no pull request. The
remote branch carries `confirm-open-pr`, so `check` drops it unless that risk
is allowed.

A `PrProvider` you write reports a failure by returning `null` or by
throwing; either becomes `listError` and a note. Return an empty list only
when the forge answered and there are no pull requests.

The decision behind this is
[D-UVUH](docs/planning/decisions/D-UVUH-failed-lookups.md).

## Plan and clean

```bash
repo-cleaner clean                                   # sweep, show the steps, ask, delete
repo-cleaner clean --only worktree --yes             # no question
repo-cleaner plan -o plan.json                       # save the plan to review or edit
repo-cleaner clean --plan plan.json --pick branch:feat/x
repo-cleaner plan | repo-cleaner clean --plan - --yes
```

A plan holds every row with a fingerprint of the evidence behind its verdict,
and the sweep options it was made with. Without `--pick` only the rows that
could be deleted run; the blocked and structural rows are there so a pick of
one is skipped with its reason. `clean`
either sweeps and plans in memory, or reads a plan with `--plan`. A plan of an
older version is refused, not translated: sweep again.

Before it deletes anything, `clean` sweeps again, with the plan's options, and
drops a row that is gone (`gone`), that can no longer be deleted (`blocked`,
`keep`, or `held` for a branch whose worktree this run does not remove), that
was not picked and is no longer `delete` (`needs-pick`), whose evidence moved
(`changed`), or that carries a risk you did not `--allow` (`not-allowed`). The
re-check reads only the kinds the selected rows are in, so running a plan of
local rows does not compare every remote branch again, and it fetches when the
plan's sweep did, so it judges against the same, current default branch.

On yes it runs only the steps it showed: spared remote tips first, then
worktrees, local branches and remote branches, in that order. Branch
deletes are compare-and-swap, every step is verified, and the first failure
stops the run. Every run ends with what it did:

```text
deleted: 1 worktree, 3 local branches, 2 remote branches, 1 stale worktree pruned
skipped 2, not deleted: 1 needs-pick (name with --pick), 1 duplicate
status: complete
```

Two clones of one remote list the same remote branches; `clean` deletes each
once and drops the other clone's row as `duplicate`, or as `spared` when the
branch is spared through the other clone. Remotes are compared by the push URL
git uses, with `url.*.insteadOf` applied.

A receipt records every step and is rewritten after each one. With
`--plan plan.json` it goes beside the plan, as
`plan.receipt-<timestamp>.json`. `--receipt <file>` puts it anywhere. A run
that swept, or read its plan from stdin, writes a receipt only when
`--receipt` names one; the printed steps are its record.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Swept; or `clean` ran, was declined, or had nothing to do |
| `1` | Failed against the state it found: an unreadable plan, a row not in it, a spared branch that moved |
| `2` | Cannot run as typed: an unknown flag, a malformed row, a refused combination, `clean` with nobody to ask and no `--yes` |
| `10` | Nothing to sweep: no target named a repository |
| `11` | `clean` stopped at a failed step; the receipt says which |

## As a library

```ts
import { check, plan, render, run, sweep } from '@osdlc/repo-cleaner'

const result = sweep(['/Users/me/work/api'], { remote: true })
for (const row of result.repos[0]?.rows ?? []) {
  console.log(row.id, row.verdict, row.why, row.risks)
}

const preview = check(plan(result), {
  pick: ['branch:spike/cache'],
  allow: [{ risk: 'abandon-unmerged', row: 'branch:spike/cache' }],
})
process.stdout.write(render.preview(preview))
const receipt = run(preview)
```

| Export | What it does |
| --- | --- |
| `sweep(targets, opts?)` | Resolve the targets and judge every row. Options as on the command line: `only`, `remote`, `offline`, `against`, `provider`, `branch`, plus `cwd`, `cacheDir`, `annotate`, `onProgress`, `onWarn`, and the injectable `git`, `gh`, `glab` runners and `probe` |
| `plan(sweep)` | Every row, fingerprinted, with the sweep's options |
| `check(plan, approval, opts?)` | Resolve `{ pick, spare, allow }` against the plan, sweep again, and return a `Preview`: the steps, the rows dropped and why, the allows no row needed, and `notes`, what the re-check judged without. Deletes nothing |
| `run(preview, opts?)` | Sweep once more and take the preview's steps, writing a `Receipt` (to `receiptPath` after every step, when given). `onNotes` hears what its own re-check judged without |
| `inspectWorktree(path, opts?)` | One worktree judged as a sweep judges it, submodules included |
| `readPlan`, `writePlan` | Plans on disk |
| `render` | The command line's formats: `text`, `json`, `summary`, `commands`, `preview`, `receipt` |
| `defaultProcessProbe`, `providers` | The defaults a host can wrap or replace |
| `RepoCleanerError` | Every refusal, with a `code`: `conflict`, `bad-input`, `not-found`, `ambiguous`, `spared-changed`, `bad-plan` |

A row is a `WorktreeRow`, `BranchRow` or `RemoteRow`, told apart by `kind`:

```ts
interface Row {
  kind: 'worktree' | 'branch' | 'remote'
  id: RowId // 'worktree:/p', 'branch:feat/x', 'remote:origin/feat/x'
  name: string // the path, the branch, `<remote>/<branch>`
  verdict: 'delete' | 'review' | 'keep' | 'blocked'
  action: 'remove' | 'prune' | 'delete' | null // null: never deleted
  why: string
  risks: Risk[] // gathered over the row's submodules
  blockers: Blocker[] // non-empty exactly when verdict is 'blocked'
  commands: string[]
  notes: string[] // what is unclear, or what to do about a blocker
  evidence: WorktreeEvidence | BranchEvidence | RemoteEvidence
}
```

`evidence` is typed for each kind: a worktree's `path`, `branch`, `head`,
`dirtyFiles`, `unpushedCommits`, lock and process evidence, and `submodules`;
a branch's `sha`, `upstream`, `track`; every kind's `merged`, `pr`,
`uniqueCommits` and landing evidence.

`sweep` never throws for a repository it cannot read: that one comes back
with `error` set, because a fan-out must not end on its first bad entry. A
lookup that only adds evidence (a pull request listing, or `ls-remote` after
the fetch) costs that evidence and not the repository: its rows are judged
without it, and the repository's `notes` say what was missing. It
throws a `RepoCleanerError` for options that contradict each other, as the
command line refuses them, before reading anything. `check` throws for an
approval that contradicts itself, names a row the plan does not have, or
spares a remote branch that moved; nothing has been touched when it does.

### Adding knowledge the library does not have

Every row carries the evidence behind its verdict, and `notes` is a list of
sentences rather than a finished string. That is deliberate: a host that knows
something git does not — an issue tracker, a task corpus — passes `annotate`
to `sweep`, `check` and `run`, and re-ranks the rows or appends its own
sentence, instead of reaching into classification. Because the same hook runs
in every re-check, the rows a run checks are the rows the host planned from.

This works because of how the ladder is ordered. Every verdict the sweep
reaches on its own evidence outranks anything a host could contribute, so a
host rarely has to veto one. It mostly sharpens the rows left at `keep` or
`review`. A worktree the host holds back keeps its branch: the sweep applies
that rule after the hook.

## Providers (prototype)

Pull request evidence comes from a provider. Classification reads the same
fields whichever one answered: number, state, head branch, head commit, target
branch.

| Provider | CLI | Listing |
| --- | --- | --- |
| `github` | `gh` | `gh pr list --state all`, up to 300 |
| `gitlab` | `glab` | `glab api projects/<path>/merge_requests?state=all`, 100 a page, up to 300 |

With `--remote`, `--provider auto` (the default) reads the remote's host: a host with `gitlab`
in its name is GitLab, any other is GitHub, which is what the tool did before
providers existed. Name one with `--provider github|gitlab` for a host the
name does not give away, or `--provider none` to skip pull requests. A plan
records the choice, so `clean` re-checks with the same provider.

GitLab maps onto the same evidence: `opened` and `locked` are `OPEN`, `merged`
is `MERGED`, `closed` is `CLOSED`, `sha` is the head commit and `target_branch`
the base. A merge request from a fork (source project is not the target
project) is dropped, as a cross-repository PR is on GitHub. The project path is
read off the remote URL with its groups (`group/sub/name`), and `glab` is asked
for that host with `--hostname`.

Not done yet:

- Gitea, Forgejo and Bitbucket.
- Mapping a self-hosted host to a provider in config; today it is the host
  name or `--provider`.
- Auth edge cases. A token without API scope, or a rate limit, is a failed
  listing: the rows are judged on git evidence with a note (see
  [When a lookup fails](#when-a-lookup-fails)). `glab` signed in only to a
  different host than the remote's reads as not signed in for that host,
  which gates remote deletes the same way.
- Squash metadata. GitLab reports `squash_commit_sha`; it is not used, so a
  squashed MR proves landing only by its head commit, as on GitHub.
- GitLab under a sub-path (`https://host/gitlab/group/proj`). The URL does not
  say where the install ends and the project begins, so the whole path is read
  as the project, `glab` is asked for a project that does not exist, and the
  listing fails. The rows are judged on git evidence with a note, and a remote
  branch needs `--allow confirm-open-pr` to delete.

## Runtime dependencies

`git` on `PATH`, and `gh` (or `glab` for GitLab) for pull request evidence.
Without it, deleting a remote branch needs `--allow confirm-open-pr`, or
`--provider none` for a remote with no forge (see
[When a lookup fails](#when-a-lookup-fails)). Authentication is the CLI's
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
