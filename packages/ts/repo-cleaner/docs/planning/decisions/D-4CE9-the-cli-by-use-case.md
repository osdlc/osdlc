---
id: D-4CE9
type: decision
state: proposed
created: 2026-11-20
---

# D-4CE9: The CLI, by use case

## Why this record

The CLI grew one flag at a time, and it shows. "Remote" means three things
(judge remote branches, use the network, look up pull requests), `--only`
takes a comma list of internal kind names, there is no way to choose which
remotes to clean, and no single obvious way to say "clean my local
branches", "clean the remote" or "clean both". A bare `repo-cleaner` quietly
runs one phase, so a first run never learns that there are phases at all.

This record designs the CLI from what people come to it to do, ignoring the
current flags. The package is pre-release, so it keeps no compatibility with
0.20: old flags are removed, not aliased. Each use case below is meant to
become a recipe in the README and an executable test, so the documentation
and the behaviour cannot drift apart.

## The model

`repo-cleaner` works in named phases, and does nothing until one is named.

| Phase | Command | What it does | Deletes? |
|---|---|---|---|
| Look | `repo-cleaner status` | Sorts each worktree and branch into a verdict, with the reason | Never |
| Save (optional) | `repo-cleaner plan -o plan.json` | Saves what `status` would show, each row with its evidence | Never |
| Delete | `repo-cleaner clean` or `repo-cleaner clean --plan plan.json` | Checks each row again, shows the steps, asks, deletes what is safe | Only `delete` rows, unless you pick more |

The four verdicts: `delete` (its work is already on the default branch),
`review` (unclear), `keep` (still in use) and `blocked` (cannot be removed).

Every phase is asked the same four questions:

| Question | Flags | Default |
|---|---|---|
| **Where** to look | targets: paths or remote URLs | the directory you are in |
| **What** to clean | `--local`, `--remote`, `--all`; `--worktrees`, `--branches`; `--remotes <names>` | `--local` |
| **How sure** to be | `--fetch`, `--offline`, `--against <remote>`, `--provider <name>` | local: no network; remote: fetch and look up PRs |
| **Which rows** (`clean` only) | `--branch`, `--pick`, `--spare`, `--allow`, `-i` | every `delete` row in scope |

## How it works

Every phase looks the same way. `status` stops there, `plan` saves what it
found, and only `clean` goes on to delete, checking everything again first.
With no phase named, nothing runs.

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 420}}}%%
flowchart TD
    start(["repo-cleaner"]) --> named{"A phase named?"}
    named -->|"no"| intro(["Explain the phases and how to run each.<br/>Nothing runs"])
    named -->|"status, plan or clean"| find["Find the repositories:<br/>a checkout is itself, a directory is searched,<br/>a remote URL is cloned into a cache"]
    find --> rows["Gather the rows in scope:<br/>worktrees, local branches, remote branches"]
    rows --> judge["Judge each row on its evidence<br/>(see the next chart)"]
    judge --> phase{"Which phase?"}
    phase -->|"status"| report(["Show each row: verdict, reason,<br/>and the git command that would delete it.<br/>Nothing deleted"])
    phase -->|"plan"| plan(["Save the rows and their evidence to a plan file,<br/>for clean --plan later. Nothing deleted"])
    phase -->|"clean"| select["Select the rows: every delete row,<br/>plus review rows you --pick,<br/>minus rows you --spare"]
    select --> risk{"Risk not<br/>allowed?"}
    risk -->|"yes"| skip(["Skipped. Never deleted"])
    risk -->|"no"| show["Show the steps"]
    show --> confirm{"Go ahead?"}
    confirm -->|"--dry-run, or no<br/>at the prompt"| done(["Done. Nothing deleted"])
    confirm -->|"-y, or yes"| recheck["Check the row again,<br/>against the repository as it is now"]
    recheck -->|"changed"| skip
    recheck -->|"unchanged"| act["Delete it, only if it still points<br/>at the commit that was checked"]
    act --> verify{"Gone?"}
    verify -->|"yes"| receipt(["Recorded in the receipt"])
    verify -->|"no"| failed["Step failed: skip only what<br/>depends on it, carry on"]
    failed --> receipt
```

How one row gets its verdict:

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 420}}}%%
flowchart TD
    row(["A worktree, local branch or remote branch"]) --> b1["Look for blockers: a lock whose owner is running,<br/>a process working in it, a nested repository,<br/>hidden index flags, its branch checked out elsewhere,<br/>a submodule that cannot be read"]
    b1 --> b2{"Any?"}
    b2 -->|"yes"| blocked(["blocked<br/>never deleted"])
    b2 -->|"no"| p1["Look for reasons to keep it: the default branch,<br/>the main worktree, the worktree you are in,<br/>an open pull request"]
    p1 --> p2{"Any?"}
    p2 -->|"yes"| keep(["keep"])
    p2 -->|"no"| l1["Look for its work on the default branch:<br/>merged by ancestry (and the branch was used),<br/>a merged pull request at this exact commit,<br/>or the same changes as commits already there"]
    l1 --> l2{"Found?"}
    l2 -->|"yes"| delete(["delete"])
    l2 -->|"no, or unclear"| review(["review<br/>a person decides"])
    delete --> risks
    review --> risks
    keep --> risks
    risks["Name the risks that deleting it would carry:<br/>abandon-unmerged: commits found nowhere else<br/>discard-changes: uncommitted edits<br/>confirm-open-pr: an open pull request cannot be ruled out"]
```

## Use cases

Each use case is a sentence a person would say, the command, and what
happens. A `$` line is a command to type.

### Starting out

**U0. "What is this, and how do I use it?"**

```console
$ repo-cleaner
repo-cleaner finds worktrees and branches whose work has landed, and deletes them safely.

It works in phases. Nothing is deleted until clean, and only what is safe.

  1. status   Look: each worktree and branch, with a verdict and the reason.
                $ repo-cleaner status            this repository
                $ repo-cleaner status --all      local and remote branches
  2. plan     Optional: save what status found, to run later or hand on.
                $ repo-cleaner plan --all -o plan.json
  3. clean    Delete what is safe: checks each row again, shows the steps, asks.
                $ repo-cleaner clean             asks first
                $ repo-cleaner clean -y          does not ask
                $ repo-cleaner clean --plan plan.json

Nothing ran. Name a phase; `repo-cleaner <phase> --help` shows its options.
```

Exits 2: nothing ran. `repo-cleaner --help` shows the same overview with
the shared options, and exits 0.

### Looking

**U1. "What can I clean up here?"**

```console
$ repo-cleaner status
```

This repository's worktrees and local branches, each with a verdict, the
reason and the exact git command that would delete it. No network. Run from
anywhere inside the checkout.

**U2. "…and on the remote too."**

```console
$ repo-cleaner status --remote      # origin's branches only
$ repo-cleaner status --all         # local, and origin's branches
```

Fetches the remote first and looks up pull requests, because a remote branch
can only be judged against the remote as it is now.

**U3. "Across every project I have."**

```console
$ repo-cleaner status ~/Developer
```

A directory that is not a checkout is searched for checkouts. Every phase
takes the same targets.

### Cleaning

**U4. "Just clean it up." (immediate, still safe)**

```console
$ repo-cleaner clean -y
```

Deletes every local row judged `delete`, without asking. `review`, `keep`
and `blocked` rows are never touched. Before each delete it checks the row
again and deletes only the commit it saw.

**U5. "Clean, but show me first."**

```console
$ repo-cleaner clean
```

Shows the steps and asks `Delete 3 rows? [y/N]`. With no terminal to ask on
(a script, an agent), it refuses unless `-y` is given.

**U6. "Only local", "only the remote", "both".**

```console
$ repo-cleaner clean --local -y     # worktrees and local branches (the default)
$ repo-cleaner clean --remote -y    # origin's branches only
$ repo-cleaner clean --all -y       # both
```

Narrower: `--worktrees`, `--branches`. Scope flags add up: `--worktrees
--remote` is worktrees and origin's branches.

**U7. "I just merged my PR: clean up that branch everywhere."**

```console
$ repo-cleaner clean --branch feat/login --all -y
$ repo-cleaner clean --branch HEAD --all -y      # the branch checked out here
```

Its worktree, its local branch and its remote branch, each if it is
`delete`.

**U8. "What exactly would it do?"**

```console
$ repo-cleaner clean --all --dry-run
```

The same checks and the same step list as a real run; deletes nothing.

### Choosing remotes

**U9. "Clean a remote other than origin."**

```console
$ repo-cleaner clean --remotes upstream -y
```

`--remotes` names the remotes whose branches to clean, and implies remote
scope. With `--all` it adds local rows too.

**U10. "Clean my fork's branches that landed upstream."**

```console
$ repo-cleaner clean --remotes fork --against upstream -y
```

`--against` names the remote whose default branch counts as landed (default:
the repository's default remote, usually `origin`). Here, a branch on `fork`
whose work is on `upstream/main` is `delete`.

Pull requests opened from a fork to its parent live in the parent, and the
GitHub provider does not read them
([#909](https://github.com/osdlc/osdlc/pull/909)): the fork's listing is
marked incomplete, so each fork branch carries `confirm-open-pr`. Until that
changes (open question 3), add `--allow confirm-open-pr` once you have
checked there is no open PR.

**U11. "Every remote."**

```console
$ repo-cleaner status --remotes '*'
```

Every configured remote, each fetched and judged against the `--against`
remote's default branch.

### Deciding the unclear ones

**U12. "Let me choose."**

```console
$ repo-cleaner clean -i
```

A checklist of the rows: `delete` rows ticked, `review` rows unticked,
`keep` and `blocked` rows shown but not selectable. Ticking a row with a risk
asks for the risk by name. Needs a terminal.

**U13. "Delete this one too; I've checked it."**

```console
$ repo-cleaner clean --pick feat/spike -y
$ repo-cleaner clean --pick feat/spike --allow abandon-unmerged -y
```

A `review` row runs only when picked. A row that would lose something
carries a named risk, and is skipped until that risk is allowed:

| Risk | What would be lost |
|---|---|
| `abandon-unmerged` | Commits that are on no remote and not on the default branch |
| `discard-changes` | Uncommitted edits in a worktree |
| `confirm-open-pr` | An open pull request, which deleting its branch closes |

**U14. "Never touch these."**

```console
$ repo-cleaner clean --all --spare 'release/*' --spare staging -y
```

`--spare` takes a row or a glob.

### Working with others and with machines

**U15. "Plan now, clean later, or hand it to someone."**

```console
$ repo-cleaner plan --all -o plan.json
$ repo-cleaner clean --plan plan.json -y
```

The plan records each row's evidence. `clean --plan` checks every row again
against the repository as it is then, and drops any that changed. The plan
fixes what is cleaned, so targets and scope flags are refused with
`--plan`; `--pick`, `--spare` and `--allow` still choose among its rows.
`--plan -` reads the plan from stdin. The receipt is written beside the plan
file.

**U16. "An agent or a script needs to read it."**

```console
$ repo-cleaner status --format json
$ repo-cleaner clean --all -y --format json
```

No prompts without a terminal, a JSON report or receipt on stdout, and exit
codes that say what happened (below).

**U17. "No network."**

```console
$ repo-cleaner status --all --offline
```

Judges remote branches from the remote-tracking refs on disk. `clean` still
asks the remote before deleting a remote branch, and refuses if it cannot.

**U18. "A remote I have no checkout of."**

```console
$ repo-cleaner clean https://github.com/acme/app.git --dry-run
```

Remote branches only, through a clone kept in a cache.

## The grammar

```text
repo-cleaner                                                       explain the phases; run nothing
repo-cleaner status  [target...] [what] [how sure] [output]        look
repo-cleaner plan    [target...] [what] [how sure] -o <file>       save a plan
repo-cleaner clean   [target...] [what] [how sure] [which] [go]    delete
repo-cleaner clean   --plan <file|-> [which] [go]                  delete what a plan saved
repo-cleaner cache   [list | remove <url>...]                      the clone cache
```

| Group | Flag | Meaning |
|---|---|---|
| what | `--local` | Worktrees and local branches. The default when no scope flag is given. |
| | `--remote` | Branches on the default remote (usually `origin`). |
| | `--all` | `--local` and `--remote`. |
| | `--worktrees`, `--branches` | Only worktrees, or only local branches. |
| | `--remotes <name,...>` | Branches on these remotes; `*` is every remote. Implies `--remote` scope; refused with `--local` alone. |
| how sure | `--fetch` | Fetch before judging local rows. Off by default. |
| | `--offline` | No network: no fetch, no PR lookup. |
| | `--against <remote>` | Whose default branch counts as landed. Default: the default remote. |
| | `--provider <auto\|github\|gitlab\|none>` | Where pull requests come from. Default `auto`. |
| which | `--branch <name\|HEAD>` | One branch's rows: its worktree, local branch and remote branches. |
| | `--pick <row>` | Also run this `review` row. Repeatable. |
| | `--spare <row\|glob>` | Leave these rows alone. Repeatable. |
| | `--allow <risk>[=<row>]` | Accept a risk, for every row or one. Repeatable. |
| | `-i`, `--interactive` | Choose rows from a checklist. |
| go | `-y`, `--yes` | Delete without asking. |
| | `--dry-run` | Check and show the steps; delete nothing. |
| | `--receipt <file>` | Where the receipt goes. Default: beside a `--plan` file, else none. |
| output | `--format <text\|json\|summary\|commands>` | Default `text`. `commands`: only the safe delete commands, for a script. |
| | `--all-rows` | `status` also shows `keep` rows. |
| | `--no-progress` | No progress line on stderr. |

A row is named `branch:<name>`, `worktree:<path>`, `remote:<remote>/<name>`,
or just `<name>` when that is unambiguous.

The network follows the scope: local rows need none, so `status` and `clean`
of local rows use none unless `--fetch` is given. Remote rows are judged
against the remote as it is now, so they fetch each remote in scope and look
up pull requests, unless `--offline` is given.

### Rules that keep it safe

1. Nothing runs until a phase is named. `status` and `plan` never delete.
   Only `clean` does, and only `delete` rows, unless a `review` row is
   picked.
2. A risk is never accepted by default; it is named with `--allow`.
3. `clean` checks every row again just before acting, and each delete is
   compare-and-swap on the commit it saw.
4. Without a terminal and without `-y`, `clean` refuses instead of
   guessing. `-i` needs a terminal.
5. A narrower flag never widens: `--branch` and `--pick` select within the
   scope, never outside it.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Looked, saved, cleaned, nothing to do, or the prompt was declined |
| 1 | The state found refused it: an unreadable plan, a row not in it |
| 2 | Cannot run as typed: no phase named, an unknown flag, a refused combination |
| 10 | No target named a repository |
| 11 | A step failed; the receipt says which, and what was skipped because of it |

## What changes from 0.20

Nothing is kept for compatibility: each old form is removed, not aliased.

| 0.20 | Now |
|---|---|
| `repo-cleaner` runs the report | `repo-cleaner status`; the bare command explains the phases, runs nothing and exits 2 |
| `--remote` adds remote branches | `--all`; `--remote` means remote branches only |
| `--only worktree,branch` / `--only worktree` / `--only branch` / `--only remote` | `--local` / `--worktrees` / `--branches` / `--remote`; `--only` is removed |
| one remote only (`origin`, or the default branch's) | `--remotes <name,...>`, `*` for every remote |
| local rows never fetch | the same, and `--fetch` to opt in |
| `--all` shows keep rows | `--all-rows`; `--all` is scope |
| `--spare <row>` | also takes a glob |
| (none) | `-i`, `--interactive` |

## How this drives development

- Each use case becomes a recipe in the README, in this order, replacing the
  option-by-option tour. The option reference stays in `--help --extended`.
- Each recipe has a test in `tests/recipes.test.ts` that builds a small
  repository (with extra remotes for U9–U11), runs the command exactly as the
  README writes it, and checks the outcome, the way `@osdlc/file-lock` runs its
  README examples. A recipe that stops working fails the build.
- Work is split into tasks:
  - the phases: bare command, `status`;
  - scope: `--local`, `--remote`, `--all`, `--worktrees`, `--branches`;
  - several remotes: `--remotes`, and `--against` across them;
  - `--fetch`;
  - `--spare` globs;
  - `-i`;
  - the recipes and their tests.
- Several remotes builds on [#909](https://github.com/osdlc/osdlc/pull/909)
  (closing #677 and #678), which already lists pull requests for the swept
  remote rather than whichever remote `gh` picks.

## Open questions

1. **`--remotes` beside `--remote`.** Two flags for one idea: scope (`--remote`)
   and which remotes (`--remotes`). The alternative is one flag that takes an
   optional value (`--remote` alone for the default remote, `--remote=fork` for
   another), which reads well but cannot take a space-separated value without
   swallowing a following target path.
2. **`--against` with several remotes.** One landed-in remote for all of them
   suits the fork workflow (U10). A per-remote default (each remote's own
   default branch) suits mirrors. The proposal uses one.

3. **A fork's pull requests to its parent.** Today they are not read, so a
   fork's branches carry `confirm-open-pr` (U10). Reading the parent's PRs
   whose head is the fork would let U10 run without `--allow`, at the cost of
   a second listing per fork.

## Reopen if

A use case comes up that none of the above covers without a new concept.
