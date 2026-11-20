# repo-cleaner terms

Words the README, the help text, the code and these planning records use
with one fixed meaning. When a word here changes, every use of it changes
with it. [D-4CE9](decisions/D-4CE9-the-cli-by-use-case.md) designs the CLI
around them.

## Phases

repo-cleaner works in three named phases, and does nothing until one is
named. A bare `repo-cleaner` explains them and runs nothing.

| Phase | Command | What it does | Deletes? |
|---|---|---|---|
| **status** | `repo-cleaner status` | Looks: sorts every row into a verdict, with the reason and the git command that would delete it | Never |
| **plan** | `repo-cleaner plan -o <file>` | Saves what status found: each row with its fingerprint, and the options it ran with | Never |
| **clean** | `repo-cleaner clean`, or `clean --plan <file>` | Checks each row again, shows the steps, asks, and deletes what it may | Yes |

Every phase looks at the repository the same way; only what happens after
the look differs.

## Row

One thing repo-cleaner can delete: a **worktree**, a **local branch** or a
**remote branch**. These are the row's **kind**. A row is named on the
command line, in a plan and in a receipt by its kind and name:

| Kind | Named | Example |
|---|---|---|
| worktree | `worktree:<path>` | `worktree:/home/me/app-login` |
| local branch | `branch:<name>` | `branch:feat/login` |
| remote branch | `remote:<remote>/<name>` | `remote:origin/feat/login` |

The bare name (`feat/login`) is accepted wherever it names one row only.

## Verdicts

Every row gets exactly one verdict.

| Verdict | Means | Does clean delete it? |
|---|---|---|
| **delete** | Its work has landed, and nothing rules removal out | Yes |
| **review** | The evidence is mixed or missing; a person decides | Only when picked |
| **keep** | It must stay: the default branch, the main worktree, the worktree you are in, a branch with an open pull request | No |
| **blocked** | Something rules removal out: a lock whose owner is running, a process working in it, a nested repository, hidden index flags, its branch checked out elsewhere, a submodule that cannot be read | Never |

A verdict comes with a **why** (one line) and **notes** (what was weighed,
including any lookup that failed).

## Risks

What deleting a row could lose. A row carries each risk that applies, and
`clean` skips it until every one is allowed by name with `--allow`. A risk
is never accepted by default.

| Risk | What would be lost |
|---|---|
| **abandon-unmerged** | Commits that are on no remote and not on the default branch, a submodule's included |
| **discard-changes** | Uncommitted edits in a worktree, a submodule's included |
| **discard-archived** | Work that `--archive` pushed to an archive branch first; it stands in for the two risks above for what the archive holds |
| **confirm-open-pr** | An open pull request, which deleting its branch closes; also carried when open pull requests could not be checked |

## Scope

Which kinds of row a phase looks at.

| Scope | Flag | Rows |
|---|---|---|
| **local** | `--local` (the default) | worktrees and local branches |
| **remote** | `--remote`, `--remote=<name>`, `--remote='*'` | branches on the default remote, a named remote, or every remote |
| **all** | `--all` | local, and the default remote |

`--worktrees` and `--branches` narrow local scope to one kind. Scope flags
add up.

## Remotes and landing

**default remote.** The remote repo-cleaner uses when none is named: `origin`
if it exists, else the remote the default branch tracks, else the only
remote.

**default branch.** A remote's main line, such as `main`: what the remote's
`HEAD` points at, or `main`, then `master`, when that was never set.

**landed.** A row's work is on a default branch: merged by ancestry (with a
sign the branch was used), merged by a pull request at the row's exact
commit, or present as the same changes (patch-equivalent commits, checked
by `git merge-tree`). A clean worktree whose head is on another branch of a
fetched remote counts too: removing it loses nothing that remote lacks. A
landed row is a `delete` candidate.

**landed against.** The default branch a row is judged against. A remote's
branches are judged against that remote's own default branch; local rows
against the default remote's. **`--against <remote>`** judges every row
against that remote's default branch instead, as a fork does against its
parent: `clean --remote --against upstream`.

**fork.** A repository copied from a **parent**. Pull requests from a fork
live in its parent, so for a fork repo-cleaner also reads the parent's pull
requests whose head is the fork.

## Choosing rows (clean)

**pick.** `--pick <row>`: also run this `review` row. Picking does not allow
its risks.

**spare.** `--spare <row or glob>`: leave this row alone, whatever its
verdict. A bare branch name is that branch everywhere, a remote branch of that
name on every remote included; a glob matches row names, and a remote branch's
name without its remote. A remote branch spared by its full name is still
checked: if it moved or is gone since the plan, the run stops, because the
plan relied on it.

**allow.** `--allow <risk>` for every row, or `--allow <risk>=<row>` for one.

**archive.** `--archive`: before deleting, push unlanded commits and
uncommitted files to an archive branch on the remote, check it, then delete
with `--allow discard-archived`.

## Records

**plan.** A file that `plan` writes and `clean --plan` reads: every row the
look found, each with its **fingerprint** (the evidence its verdict rests
on), and the options the look ran with. A plan fixes what is cleaned; `clean`
checks every row again and drops any whose fingerprint moved.

**receipt.** What a `clean` run did, written as it goes: every step with its
command, its **result** (`pending`, `would-run`, `ok`, `failed`, or
`skipped` because a step it depended on failed) and how it was verified; and
every row that did not run, with its **drop reason** (`gone`, `blocked`,
`keep`, `held`, `needs-pick`, `changed`, `not-allowed`, `duplicate`,
`spared`). A step that found its remote branch already deleted is marked
**gone**, not failed.

**identity.** What names a process for as long as it runs, and no later
process that reuses its pid. A worktree lock records its owner as
`pid <N>`, optionally followed by `start <time>`; repo-cleaner reads the
owner's identity to tell a running owner from a stale lock. On Linux the
identity is the boot id and the start in kernel ticks
(`@osdlc/file-lock`'s `processIdentity`); elsewhere it is the start time.

**fingerprint.** The evidence a row's verdict rests on, recorded in a plan:
for every row, the default branch it was judged against
(`evidence.landedAgainst`); for a branch, its commit and its pull request's
number and state; for a
worktree, its head and branch, how much unlanded work it holds, whether its
lock was stale, whether it is on disk, its submodules' state, and the remote
branches that hold its head. Two looks agree on a row when its fingerprints
match.
