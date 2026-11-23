# @osdlc/pr-update

Survey how far every open pull request has drifted from its base, and bring the
ones that are behind up to date. It can rebase or merge, one PR or a whole
stack, and it predicts conflicts before anything is checked out.

```ts
import { prUpdateConfigSchema, runSurvey, standalonePorts } from "@osdlc/pr-update";
import { spawnRunner } from "@osdlc/command-seam";

const report = runSurvey(
  { repo: [], pr: [], noFetch: false, noDrafts: false, limit: 100, remote: "origin" },
  {
    projectRoot: process.cwd(),
    dryRun: false,
    git: spawnRunner("git"),
    gh: spawnRunner("gh"),
    cfg: prUpdateConfigSchema.parse({}),
    ports: standalonePorts(),
  },
);
```

Or from a shell (`npx @osdlc/pr-update …`, or after installing the package):

```sh
pr-update survey --output json
pr-update update --apply --strategy rebase     # every open PR, parent first
pr-update update --branch --apply              # the PR of the branch you are on
pr-update update --pr 12 --apply --report out.json
```

## Install

```sh
npm install @osdlc/pr-update
```

ESM only. Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, which is the range of its
dependency `@osdlc/typed-git`. `pnpm add @osdlc/pr-update` and
`yarn add @osdlc/pr-update` work too.

## Requirements

- `git` on `PATH`, always.
- For a GitHub repository, the GitHub CLI (`gh`) on `PATH` and signed in:
  `gh auth login`.
- For a Forgejo repository, `curl` on `PATH` and a token in the
  `FORGEJO_TOKEN` environment variable.

`survey` and `update` check this before they list anything. A missing tool, an
unreadable git remote or a PR listing the host refused is an error with its own
exit code (see Exit codes), never "no open PRs". The message is the one every
tool built on `@osdlc/cli-tool` prints for that failure, for example
`pr-update: gh is not signed in to GitHub. Run \`gh auth login\`.`

## Upgrading from 0.17 or earlier

- **Run `pr-update trust` again.** The trust store has moved to
  `~/.local/state/osdlc/pr-update/trusted/` on Linux and macOS. Trust
  recorded by an earlier release, under `$XDG_STATE_HOME/pr-update/trusted/`,
  was not copied and no longer counts. In a repository you had trusted
  whose `pr-update.yaml` sets one of the gated keys (`lockfile_install`,
  `resolvers[].run`, `repair.command`, `repair.agent`, `test_command`, a
  `repair.mode` other than `headless`, or `verify: detect`), unless
  `pr-update.local.yaml` overrides it, `update` exits `21` until you run
  `pr-update trust` there again, once per machine. An older release keeps reading the
  old place.
- **An unattended `update --apply` whose GitHub `--repo` target has no
  checkout now exits `2`**, where it used to skip that target. A target on
  another code host is still skipped. `pr-update mirror disable` keeps
  the skip; `pr-update mirror enable` lets the run clone it (see
  [Where a target is served from](#where-a-target-is-served-from)).
- **`--retry-failed` no longer discards a kept worktree someone has changed**,
  or one git cannot read. Only `--discard-kept` removes it.
- **`--repo` is checked more strictly.** A form that is not `owner/name` or
  `host/owner/name` (a URL, say), a name ending in `.git`, a host that is not
  a host name, or a part Windows cannot use as a folder name, exits `2`.

## The command line

`survey`, `update`, `config`, `mirror` and `trust` are one `@osdlc/cli-tool`
command tree, so every command answers the same way:

- `--json` (or `--output json`) prints one JSON document on stdout: the
  command's output with `schemaVersion` and `kind` in front (`"kind":
  "survey"`, `"kind": "update"`). Without it the output is text.
- `pr-update --help` and `pr-update` alone list the commands;
  `pr-update <command> --help` shows a command's flags, and `--help --all` (or
  `pr-update help <command> --full`) adds the long description, the hidden
  flags, the exit codes and examples. `pr-update help --json` is the same as
  data.
- `pr-update schema` prints each command's input and output JSON Schema.
- An error is one `pr-update: <message>` line on stderr, with the command's
  usage line for a usage error. Under `--json` the error document
  (`"kind": "error"`, with `code`, `message` and `exit`) is printed on stdout
  too.

A bare `--branch` means the branch checked out in the current directory.

## Why this exists as its own package

A stack of PRs drifts all the time. Every merge to `main` puts the next PR one
commit further behind. A PR three deep in a stack can look clean while its base
is itself out of date. Checking this by eye stops working past a handful of
PRs. A survey costs one GitHub API call and one `git merge-tree` per PR, which
is cheap enough to run on every open PR.

The package runs on its own against any repository, with your own trust rules
and your own code host client. The `CodeHost` port leaves the code host client
to the caller.

It has two layers. The engine (`runSurvey`, `runUpdate`, the resolver steps,
the guards and the `Ports`) names no host, no host config file and no
project's commands. The `pr-update` binary is one host of the engine. Any other
host can embed the engine as a library and supply its own ports.

## One PR, or all of them

With no scope, `update` works on every open PR in the repository, parent
first. `--pr` (repeatable) names PRs: `--pr N` is PR `N` in every repository
of the run, and `--pr owner/name#N` is PR `N` of that one repository, which
must be in the run: named by `--repo`, or, with no `--repo`, the checkout's
own repository.
`--branch [name]` names the PR whose head is that branch. A bare `--branch`
means the branch checked out in the current directory. A branch with no open
PR, or a `--pr owner/name#N` for a repository outside the run, is a usage
error (exit `2`).

Every report names a PR `owner/name#N`, the form GitHub links and `--pr`
accepts, whether the run covers one repository or several. A PR number alone
is ambiguous once a run spans several repositories. In JSON, each PR carries
`repo` (`owner/name`) and `number`, and each repository entry `repo`.

A scoped run measures only what it needs. It lists PRs from the code host
once, then fetches and runs `merge-tree` on just the named PRs and their stack
parents. A host that updates one PR at a time does not pay for a survey of
fifty. A PR whose parent is behind is still reported `blocked`.

In branch mode, after a successful push, the checkout you ran it from is moved
to the pushed head when that loses nothing. That means the checkout is on that
branch, has no uncommitted change, and is exactly at the head the run started
from. A rebase is not a fast-forward, so the checkout is reset to the new head.
It was clean and at the old remote head, so every commit it held is on the
pushed branch. Otherwise the checkout is left alone, and the result's
`localCheckout` says why:
`{ updated: false, detail: "the working tree has uncommitted changes" }`.

`--branch` names a branch of the project root, so a `--repo` target served
from another checkout is not updated in branch mode. Its PRs are listed under
`skipped` with the reason `--branch names a branch of the project root; not
updated in <path>`.

## Other repositories: `--repo`

`--repo owner/name` (repeatable) puts another repository in the run, and
`--repo host/owner/name` names its host too. A bare `owner/name` means the
host of the project root's `origin` when that is GitHub (github.com, or any
host with `code_host.override: github`), and github.com otherwise. Each target is
lower-cased once, so `Acme/API` and `acme/api` are one target, and a
`--pr owner/name#N` matches it in any letter case. A `--repo` that names the
repository of the project root's `--remote`, in any case, is the project root.
Hosts are compared without a port, and an SSH config alias in a remote
(`git@github-work:o/r.git`) counts as the host `ssh -G` resolves it to; when
ssh cannot resolve it, a note says so and the alias is used as written. Reports and
`--pr` name a repository by `owner/name` alone, so one `owner/name` on two
hosts in one run is a usage error (exit `2`).

A target's PRs are listed on its own host. A target on the host of the
project root's `origin`, the remote the project root's code host is picked
from, is listed through that code host; one on any other host
through GitHub over `gh`, with `GH_HOST` set to that host (github.com
included, so a `GH_HOST` in your environment does not move it). A Forgejo
repository on a host other than the project root's is not supported.

### Where a target is served from

Drift is measured, and an update made, in a git repository on this machine.
For each target the run uses the first of these it finds:

1. **The project root**, for its own repository.
2. **A checkout already on this machine**, matched by its `origin`, under the
   roots listed in `repositories.yaml`, the file every osdlc tool shares
   (`~/.config/osdlc/repositories.yaml` on Linux and macOS). With no such
   file, or one with no `roots` key, the run looks beside the project root:
   in the directory that holds it, or the one above when that directory is
   named after the project root's owner (an `<owner>/<name>` layout).
   `roots: []` searches nothing.
3. **A managed bare clone** pr-update keeps for the target. Only a GitHub
   repository gets one, and only with your consent.

```yaml
# ~/.config/osdlc/repositories.yaml
roots:
  - ~/dev/repos
```

Step 3 is set by `checkout` in pr-update's machine file
([The machine file](#the-machine-file)). Both values use steps 1 and 2 first.

| `checkout` | A GitHub target with no checkout |
|---|---|
| `mirror` | is served from a managed clone, which the first `update --apply` that needs it makes |
| `local` | is skipped, and a clone that exists is not used |
| not set | is served from a clone that exists. With none, `update --apply` asks once and saves the answer, or with no terminal exits `2`; `survey` and a rehearsal report the target not measured |

Consent to clone is the first of these that is set: `--mirror-dir <dir>` on
the run, `PR_UPDATE_MIRROR_DIR=<dir>` in the environment, then `checkout:
mirror` in the machine file. The flag and the variable are consent for that
run even over `checkout: local`. `OSDLC_ROOT` and the home variables are not.
`pr-update mirror enable` and `pr-update mirror disable` write `checkout`
ahead of time.

**Known limit: unpushed work in a checkout pr-update cannot see.** A
repository checked out outside every root is not found, so the run serves it
from the clone. The `unpushed_local` guard reads only the checkouts the run
found, and `--force-with-lease` guards only against changes on the remote. So
a run can force-push over a branch whose local checkout holds commits that
were never pushed. List every directory that holds your checkouts in
`repositories.yaml`. A run served from a clone says so every time, naming the
roots it searched (`<repo>: no checkout under <roots> (…); using the clone
<path>`), so a root you meant to list shows up as missed.

### A checkout found on this machine

The search goes three levels below each root. A default root, found beside
the project root, is never your home directory or a directory above it; a
root you list in `repositories.yaml` is searched wherever it is. A linked worktree counts as its main checkout. A shallow
checkout is skipped, since it cannot measure drift. With more than one
checkout of a repository, the first by path is used and a note names the
others. The `unpushed_local` guard still reads all of them, shallow ones
included, each against its own `origin`, since any of them can hold a
branch's unpushed commits. A checkout found this way is fetched and measured through its
`origin`, whatever `--remote` says: `--remote` names a remote of the project
root. That fetch writes only the remote's branches into `origin/*`, with no
tags and no `FETCH_HEAD`. It never writes a local branch, even one the
checkout's own fetch lines map a remote branch into (`--refmap=`). It prunes
nothing, even with `fetch.prune` or `remote.origin.prune` set (`--no-prune`),
so refs the checkout's own fetch lines keep under `origin/` (such as
`origin/pr/*`) stay. A checkout a library host's `locate` returns is fetched
the same way.

A target with no checkout is still listed, reported `no local checkout —
drift not measured`, and a note on stderr names the roots that were searched
and the file that sets them, and says when the depth limit left directories
unopened. A shallow checkout gets its own note (`<path> is shallow, so it is
not used`). In JSON, each repository carries `checkout: { path, source }`, with
`source` `root`, `located` or `clone`, or `checkout: null` when there is none.

`update` updates a checkout found this way without touching its working
tree, index or HEAD. The run worktrees are made from its git directory but live in
pr-update's cache directory, under the target's host (without its port),
owner and name:

| What | Where (Linux and macOS, no variable set) |
|---|---|
| Run worktrees | `~/.cache/osdlc/pr-update/worktrees/<host>/<owner>/<name>/<run>/` |
| Kept worktrees (`--keep-failed`) | `~/.local/state/osdlc/pr-update/kept/<host>/<owner>/<name>/<number>/` |
| Failed attempts (`attempts.store: file`) | `~/.local/state/osdlc/pr-update/attempts/<host>/<owner>/<name>/` |

`OSDLC_ROOT` moves all three, as it moves the machine file. In the checkout's
git directory the run writes only git records: a `worktrees/` entry for each
run or kept worktree, the run's scratch branch (deleted at the end) and a kept
tree's branch, the objects the update builds, the `origin/*` refs its fetch
and push write, and, with `attempts.store: git-ref`, local `refs/pr-update/*`
copies of the remote's record and lease. A kept tree with a verify log adds
`/.pr-update-verify.log` to `info/exclude` once, and with submodules the
`submodule.*` URLs are set for the update and put back after it. A run that is
killed can leave its worktree's entry and scratch branch, which the next run
on that checkout removes, and `submodule.*` keys that were not put back.
[D-0005's Build notes](docs/planning/decisions/D-0005-managed-bare-mirror-checkout.md#build-notes)
list all of it.

Every git command in that checkout and its run worktrees runs with hooks off
(`core.hooksPath=/dev/null`): the worktree holds the PR's own files, and a
relative `core.hooksPath` such as `.husky` would run hooks the PR's author
wrote. They also run without an inherited `GIT_DIR` or git's other
repository variables, as does every git call and command in any run
worktree, the project root's included, so a run started from a git hook acts
on the right repository (see [SECURITY.md](SECURITY.md)). `survey` and
`update` refuse, with exit 2, a `GIT_DIR` or `GIT_WORK_TREE` that names
another repository than the directory's own, such as a dotfiles setup's. The run never runs a bare `git worktree prune` there, so your own
worktrees whose folders are missing stay listed. With `attempts.store:
git-ref`, the record and the lease are refs on the checkout's own `origin`,
taken per target. When a target's own record or lease fails (its remote
refuses `refs/pr-update/*`, say), that target's PRs are skipped with the error
and the run goes on with the others. An error while saving the record of a PR
that already ran is shown on that PR: `recordError` in JSON, `record not saved:`
in the text; anything not shown on a PR or a skip is listed in `recordErrors`. The project root keeps `.pr-update/` in
its own checkout, and its hooks and store errors behave as before.

Commands the config names run in that worktree, so each target passes the
trust gate on its own (see Config): a checkout found this way is trusted by
its path, so run `pr-update trust` inside it. An untrusted target's PRs are
listed under `skipped` with a reason that starts `untrusted:` and names the
command to run; the other targets go on. `--trust` covers every target of the
run.

### A target with no checkout: the managed clone

A GitHub target with no checkout on this machine can be served from a bare
clone pr-update keeps for it. A target counts as GitHub when it is on
github.com, or on the project root's host when that host is GitHub (an
Enterprise host with `code_host.override: github`). Any other host gets a note,
`there is no managed clone for <host>`, and no clone.

Only `update --apply` makes a clone, and only with your consent
([above](#where-a-target-is-served-from)). `--mirror-dir` and
`PR_UPDATE_MIRROR_DIR` take an absolute path, or one starting `~/`. With no
consent and no `checkout: local`, the first `update --apply` that needs a
clone asks, naming the repositories, their size, the roots it searched, any
shallow checkout of them, and the clone directory. Enter clones into that
directory and writes `checkout: mirror`; a typed directory is written as
`mirror_dir` too; no writes `checkout: local`, and such targets are skipped
from then on. The run prints the machine file it wrote. When another run
answered first, its answer is used. With no terminal to ask on, the run exits
`2` and names `--mirror-dir`, `PR_UPDATE_MIRROR_DIR`, `pr-update mirror
enable`, and `pr-update mirror disable`, which skips such targets instead.

Clones go to the first of `--mirror-dir`, `PR_UPDATE_MIRROR_DIR`, `mirror_dir`,
or `~/.cache/osdlc/pr-update/repos/`, one `<host>/<owner>/<name>.git` each,
lower-cased, with the host's port left out. The directory must be outside
every git checkout and new, empty or already pr-update's, and yours, and on
Linux and macOS no one else may write to it. A folder anyone can write to is
refused, sticky bit or not. One its group can write to is refused unless the
group is a user private group of yours: not on macOS (where every user's
primary group is the shared `staff`), and the folder's group, your primary
group and your uid are one number, as on Ubuntu, Debian and Fedora, whose
umask `002` makes every folder group-writable. `chmod go-w <dir>` fixes a
refusal; on a filesystem with no Unix permissions, such as exFAT or an SMB
share, choose another clone directory. Otherwise the run exits `2`, naming
it, and writes nothing. On Windows no ownership or mode check is made, since
NTFS ACLs are not read: put the clone directory under your user profile, as
the default is. pr-update makes the folders it creates itself (the
clone directory and its `<host>` and `<owner>` folders, the folders that hold
run and kept worktrees, its records) with mode `755` at most, whatever the
umask.
`gh` makes a clone under the umask, so before the clone is put in place
pr-update takes write for group and others off everything in it (`chmod -R
go-w`). The clone folder and its `config` must then pass the rule too, since
whoever can write that file chooses what git runs there. Each run worktree's
folder takes the umask, since `git` makes it; for it only the owner is
checked, and the folders above it must pass the rule. A clone is used only
when pr-update made it: a folder without its marker, a symbolic link in its
place, in place of its `config` or of the `<host>` or `<owner>` folder above
it, a clone or marker another user owns, or a clone, its `config` or a
folder above it someone else can write to, is left alone, and the target is
skipped saying why. A clone is made with `gh repo clone
<owner>/<name> -- --bare` (`GH_HOST` set to the target's host), with no
`upstream` remote. Its own config gets the credential helper `gh auth
setup-git` would write, so later fetches and pushes sign in through `gh`; your
global git config is not changed. It keeps the `origin/<branch>` layout, has no
branches of its own, sets `core.longpaths`, and is fetched with `--prune`.
A step that fails removes the half-made clone, and the target's PRs are
skipped with the error.

Each clone has a lock, `<name>.git.lock`, beside it. An `update` run, with or
without `--apply`, holds a clone's lock:

- from before its survey, when it takes the locks of every clone it will use,
  in sorted path order; this is also when it clones;
- until it knows the clone has no PR to update, after picking the PRs, or else
  until that clone's run worktree is made. With several targets, a clone
  whose turn comes later stays held while the targets before it are updated;
- and again while it removes the run worktree, or discards a kept worktree
  of the clone (`--discard-kept`, or a PR that moved).

`update --apply` waits up to 60 seconds for each lock, then skips the
target's PRs as `mirror busy`. Taking a lock back to remove a worktree, it
waits only when it holds no other clone's lock, and otherwise does not wait.
So a run that waits only ever waits for a lock later than every lock it holds,
and no two runs wait on each other in a cycle. A worktree whose clone's lock
it cannot get back is left in the clone, with a note naming it: a run
worktree is removed by the next run in that clone, or by `pr-update mirror
prune`; a kept worktree by running with `--discard-kept` again. A rehearsal (`update` without `--apply`) does
not wait: a clone another run holds is skipped as `mirror busy`, with a note.
`survey` and a rehearsal never clone: they use a clone that exists, fetch it
and stamp it as used, and otherwise report the target not measured with a
note naming `pr-update mirror enable`. `survey` holds the lock while it
fetches and reads the clone, and reads a clone another run holds as it is,
with a note, without waiting; if the clone is gone after that read (a prune
held the lock), what was read is dropped and the target is reported not
measured, with a note. Each use writes the clone's last-used stamp. A clone a prune removed
before a run took its lock is made again, under that lock, by `update
--apply` with consent; otherwise its target is skipped with a note saying so.

A clone is updated, kept and trusted as a found checkout is (above), except
that its trust is keyed by repository: run `pr-update trust
github.com/<owner>/<name>`.

### The `mirror` commands

| Command | What it does |
|---|---|
| `pr-update mirror enable [--mirror-dir <dir>]` | Writes `checkout: mirror`, and `mirror_dir` after checking the directory as a clone run does. It does not make the directory; the first clone does |
| `pr-update mirror disable` | Writes `checkout: local` |
| `pr-update mirror list [--mirror-dir <dir>]` | Shows the clones and the run worktrees in the cache, and changes nothing |
| `pr-update mirror prune [--older-than <days> \| --all-clones] [--dry-run] [--discard-kept] [--mirror-dir <dir>]` | Removes dead runs' worktrees, leftovers and old clones (below) |

`enable` and `disable` keep the machine file's other keys and its comments,
print the file they wrote, and exit `14`, leaving the file as it is, when it
is not valid YAML or its top level is not a map. When another run writes the
file at the same moment, `enable` and `disable` write again over it, while the
first-run question's answer gives way to the one already there. All four take
`--json`.

### Cleaning up: `mirror list` and `mirror prune`

`pr-update mirror list` (or `--json`) shows each managed clone with its
repository, size, last use (its stamp) and kept worktrees, and then every run
worktree under `~/.cache/osdlc/pr-update/worktrees/`, saying whether the run
that made it is still going and which git directory owns it. It takes no lock
and changes nothing.

`pr-update mirror prune` removes:

- the worktree of every run that is gone, at any age, whatever repository it
  belongs to. It reads the worktree's `.git` file and its record's
  `commondir` to find the checkout or clone that owns it, and removes it
  through that one with `git worktree remove`, deleting the run's scratch
  branch. In a clone it does this only while holding the clone's lock. It
  never runs a bare `git worktree prune`, so your own worktrees whose folders
  are missing stay listed. With the owner gone, only the folder goes;
- leftover `.tmp-*` clone folders and `.pr-update-probe-*` folders more than
  an hour old;
- each clone not used for `mirror_max_age_days` (default 30), going by its
  last-used stamp, or by when its marker was written if it has no stamp. At `0` it
  removes no clone, unless you pass `--older-than <days>` or `--all-clones`
  (not `--all`, which goes with `--help`).

A run is gone when no process has the pid its worktree's folder,
`<pid>.<time>`, is named for, or the process with that pid started more than
10 minutes after that time, so a pid a later process reused does not keep a
dead run's worktree. The margin is wide because start times are read
against the clock, which a clock step can move; a start time that cannot be
read counts as running. Pids belong to one machine: pr-update's cache and state
directories must not be shared between machines (a network home, a synced
folder), or one machine's prune can remove a worktree another machine's run
is using.

It never removes a clone another run holds, one with a kept worktree (unless
`--discard-kept`, which removes those first), one a live run has a worktree
in, or a folder without pr-update's marker, and it never follows a symbolic
link or removes anything from a folder another user owns or others can write
to (the clone directory's rule above). Such a folder under the cache's
`worktrees/` or the state's `kept/` is fixed with `chmod -R go-w` on that
directory, which the message names. It never waits for a lock: a clone
another run holds is left as `mirror busy`. `--dry-run` only says what would go, and takes no lock. `list` and
`prune` take `--mirror-dir`, so a clone directory left behind by a moved
`mirror_dir` can be cleaned. `prune` exits `1` when something could not be
removed; a clone whose removal stops part-way is left as a `.tmp-*` folder,
which a later prune removes.

At the end of an `update --apply` that used a clone or made a run worktree in
the cache, the run prunes the same way, as a bare `mirror prune` would, and
notes each thing removed, each thing it left for a folder someone else could
write to or a clone pr-update may not change, each thing it could not remove,
and the space freed. A pruning that fails does not change the run's exit. A
run that never touched the cache, a run a signal stopped, and a rehearsal
remove nothing.

## Three things it knows that a per-PR check cannot

Drift is measured locally. GitHub reports `mergeStateStatus: BEHIND` only
when branch protection requires an up-to-date branch. Without that rule the
field says nothing, however far a branch has drifted. So `survey` counts
commits behind with `git rev-list --left-right --count` over the
remote-tracking refs.

Being out of date passes down a stack. When PR A targets PR B's head branch, A
is stacked on B. Updating A before B is wasted work, because A's base is about
to move. `survey` builds the stack graph, sorts it parent first, and marks a
child `blocked` on the nearest ancestor that is itself behind, however many
levels up that ancestor is. By default `update` leaves a blocked child for the
next run. `--restack` updates it in the same run, right after its parent (see
below).

A rebase is not always safe. `--force-with-lease` compares against the remote,
so it does not notice a checkout holding commits nobody has pushed. Rebasing
over that would lose the work with no warning. The `guards.unpushed_local`
guard checks for this before every preference, and no override turns it off.

## A whole stack in one run

Without `--restack` or `pr_update.restack`, a stack of N levels takes N runs: each run updates the
lowest PR that is behind and leaves the PRs above it `blocked`. With
`--restack`, one run updates the whole stack, parent first:

```sh
pr-update update --restack --apply              # every stack in the repository
pr-update update --restack --branch --apply     # the stack under the branch you are on
```

A project that always restacks sets `pr_update.restack: true` instead of passing the
flag. `--restack` and `--no-restack` override it for one run.

- A blocked PR whose parent is updated in the run is updated right after it,
  onto the head the parent just got. A rebase replays only the PR's own
  commits, with `git rebase --onto <parent's new head> <parent's old head>`,
  so the parent's old commits are not replayed onto its new ones. The result
  carries `restackedOnto` (the parent's number), and the text says
  `(restacked onto owner/name#N)`.
- A rehearsal (no `--apply`) builds each level on the one below it, in the
  temporary worktree, and pushes nothing. It shows which levels would
  conflict.
- A child goes up only onto a parent that was pushed. If the parent conflicts,
  fails, or its force-push is declined at `--confirm-push`, the child and
  everything above it stay `blocked`, and `skipped` says which parent held
  them back.
- A blocked PR whose parent is not updated in the run (a guard skipped the
  parent, say) stays `blocked`.
- With `--pr` or `--branch`, the named PRs' stack ancestors are updated too,
  since a PR cannot be restacked onto a parent the run leaves behind. PRs
  above the named ones are not.
- A failure recorded for the child (see below) is checked against its new base
  sha, the head its parent just got.

A rebase that does not come from `--restack` passes `--fork-point`. Where this clone's reflog still
holds the parent's old head, a child updated in a later run leaves the parent's old commits behind
instead of replaying them. A fresh clone or CI checkout has no such reflog and rebases as before, so
a host that updates stacks should still use `--restack`.

## Conflicts, predicted before anything is checked out

`survey` predicts each PR's merge with `git merge-tree`, which merges in the
object database and never touches a working tree. That is what makes a survey
of every open PR cheap. A full checkout per PR would take minutes, not seconds,
across a large stack. A conflict prediction carries the conflicted paths and
`conflictBaseSha`, the commit the base ref pointed at when it was measured. A
caller can use it to tell whether the prediction is still current.

## Resolving a conflict without asking anyone

`update` tries a fixed list of resolvers, in order, before it gives up on a
conflict:

1. git's own `rerere` replay.
2. The built-in lockfile rule: take a side, then re-run `lockfile_install`.
3. The project's own `resolvers`: glob-matched paths, each with the shell verb
   that rebuilds them (`make docs`, for example).
4. A host's in-process `generators`.

A conflict that no resolver claims is reported with the path and the reason,
in `update`'s structured `conflicts` field. It is never guessed at.

### The fallback chain

A rebase replays every commit, so it can stop once per commit. Generated files
tend to conflict at every stop, so the resolvers run at every stop, for as long
as the rebase keeps stopping. The chain:

1. Rebase, with the resolvers at each stop.
2. A stop they cannot clear aborts the rebase, and the PR is retried as a
   merge with the same resolvers. This is `pr_update.on_rebase_conflict`:
   `merge` (the default) retries, `fail` reports the PR as a conflict
   instead, and `repair` repairs the stop (see below).
3. A merge that still has a conflict goes to `repair`, called once, which edits
   files in the open merge only. By default `repair` is never called during a
   rebase. Repairing each stop of a 20-commit rebase could mean 20 agent calls
   on 20 versions of one conflict.
4. Otherwise the PR is reported for a person. The failed-attempt record keeps
   it from being retried until its head or base moves.

When step 2 ran, the result's `strategy` is `merge`, whatever was planned, and
`strategyFallback` says what stopped the rebase. A reader must use the result's
strategy, not the requested one, because a PR planned as a rebase can be pushed
as a merge.

### Repair at rebase stops

For a repository that refuses merge commits, set `on_rebase_conflict: repair`:

```yaml
pr_update:
  on_rebase_conflict: repair
  repair:
    agent: claude
    max_rebase_stops: 3 # default
```

At a stop the resolvers cannot clear, `repair` is called with `kind: conflict`, the
conflicted paths and `replaying` (the commit's sha and subject, and the base it moves
onto; as `PR_UPDATE_COMMIT`, `PR_UPDATE_COMMIT_SUBJECT` and `PR_UPDATE_ONTO` for a
command). The prompt asks it to keep that commit's intent, not the branch's final state.
`update` runs the usual checks, then `git rebase --continue`, and the next stop gets the
resolvers and a repair again. After `repair.max_rebase_stops` repairs in one rebase, or on
a failed repair, the rebase is aborted and the PR is reported as a conflict. It never falls
back to a merge. `guards.max_rebase_commits` bounds the rebase length, so the two settings
bound the cost. `repaired` gets one entry per stop. It needs a configured repair with
`conflict` in `repair.on`, and a rehearsal never calls it, so a stop it would have
repaired is reported as a conflict.

### Repair

`repair` is the only step that uses judgement, and it is opt-in. With `repair.agent`,
`repair.command` or a host's `repair` port, `update --apply` calls it once for whatever the
resolvers left: an unclaimed `conflict` (on a merge only), and a failed verify step when `repair.on`
lists `verify-failed` (for either strategy). It is async, because an agent run takes minutes.
`repair.timeout_seconds` kills one that runs too long. The repair only edits files. `update`
rejects it if HEAD moved or a ref was created, or if conflict markers or `git diff --check` errors
remain. Otherwise `update` stages, commits, re-runs `verify` and pushes. The result lists each fix
under `repaired`. A rehearsal never calls the repair.

`repair.command` runs a shell command in the update worktree. It gets the
request as JSON on stdin and as `PR_UPDATE_KIND`, `PR_UPDATE_PR`,
`PR_UPDATE_BASE`, `PR_UPDATE_HEAD`, `PR_UPDATE_WORKTREE`, `PR_UPDATE_PATHS`
(one per line) and `PR_UPDATE_REASON`. Exit 0 claims success. The last line of
output is the note.

`repair.agent` (or `update --repair-agent <agent>`) runs a built-in headless
agent instead. Only one of the two may be set. A config that sets both is
refused with exit `14`.

| Agent | Runs |
|---|---|
| `claude` | Claude Code (`claude`) |
| `codex` | OpenAI Codex (`codex exec`) |
| `cursor` | Cursor's CLI (`agent`) |
| `pi` | the pi coding agent (`pi`) |

Each preset is one [`@osdlc/agent-call`](https://www.npmjs.com/package/@osdlc/agent-call)
call, run in the update worktree with file edits allowed, no permission
prompts, and the repair timeout. Shell is off for claude, cursor and pi; codex's
`--sandbox workspace-write` also allows workspace commands. agent-call builds every CLI's
argument list, so this package writes no per-agent flags. The agent CLI must be
installed and signed in. `repair.model` passes a model name to it. The exit
status gives `ok`, and the agent's final line gives the note. All presets share
one prompt, `repairPrompt(req)`, which states what the repair may and may not
do. A library host that runs its own agent can reuse it.

The agent runs in a worktree of the PR's branch, whose content its author controls, so each
preset keeps that branch from steering it. `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` and
`GITHUB_ENTERPRISE_TOKEN` are set empty in the agent's environment, for every agent. For `claude`
the call also passes `--setting-sources user` and an empty strict MCP set, so the branch's
`.claude/settings.json` (hooks, permissions, env), `.claude/settings.local.json` and `.mcp.json`
do not load. agent-call has no equivalent switch for `codex`, `cursor` or `pi`, so for those only
the token scrub applies: a branch's own project config for them (`.cursor/`, `.codex/`, `.pi/`)
may still load. In CI, prefer `claude`, or a `repair.command` you wrote yourself. A
`repair.command` is a shell command of yours and gets the parent environment unchanged.

An agent reads the repository and can run tools, so a `repair.agent` (like a
`repair.command`) read from the project file needs trust (see Config).
`--repair-agent` and `--repair-command` on the command line are your own
consent and need no trust. They override whatever the config names.

### Repairing with the person watching

`repair.mode` (or `update --repair-mode <mode>`) says how `repair.agent` runs. `headless` is the
default. `interactive` runs the agent's own CLI in this terminal with stdio inherited, so you can
answer its questions or stop it; it needs a terminal (a usage error without one) and repairs one
PR at a time. `terminal` opens the session through `@osdlc/agent-seat` in a detached tmux session,
named `sd-pr-update-<pr>-<pid>` in the run's notes (`tmux attach -t <name>`), and waits for it to
end. tmux is the only agent-seat host that holds a launch until the session ends, so it is the only
one `terminal` uses, and the run waits on that session before the next PR. The prompt is the same
`repairPrompt(req)`, given as the session's first message, and the agent CLI runs without the
host's GitHub tokens. When the session ends, the same checks as a headless repair decide: HEAD
unmoved, no refs, no conflict markers, `git diff --check` clean, then stage, commit, verify and
push. A session that exits non-zero, or that you quit without a fix, gives `conflict` or `failed`
as a headless repair that gave up does. `repair.mode` other than `headless` in the project file
needs trust like `repair.agent`; `--repair-mode` is your own consent. `config set pr_update.repair.mode`
works from the command line only and is refused over MCP and HTTP.

## Git submodules

The update worktree is made with `git worktree add`, which leaves submodules
empty. With `pr_update.submodules: auto` (the default) and a `.gitmodules` in
the worktree, `pr-update` runs `git submodule update --init --recursive` after
each PR's checkout, and again after a rebase or merge that moved a gitlink or
changed `.gitmodules`, before `verify`, the resolvers and `lockfile_install`
run. `submodules: off` leaves them alone. The URLs come from the PR's own
`.gitmodules`, so they are fetched with whatever credentials the run has. Because a PR's
author controls that file, the update runs with `protocol.file.allow=never` and
`protocol.ext.allow=never`: a submodule URL that is a local path or an `ext::` command fails
instead of running. Network URLs (`https`, `ssh`) are still cloned; set `submodules: off` for a
repository whose PRs you do not trust. The trust gate covers only commands the project file
names, not PR content, so it does not apply here.

A submodule that will not check out ends that PR as `failed` with
`submodule setup failed: <detail>`. It says nothing about the PR, so it is not
recorded as a failed attempt and the next run tries again. A pointer both sides
moved has no built-in resolver; the conflict names the two commits, so a person
or `repair` can pick one.

## Checking before a push

`verify` decides what must pass before an updated branch is pushed. `none`
(the default) leaves it to CI on the PR. `check` and `test` run a verb list in
the update worktree, and a failure blocks the push. The host resolves that
list through `Ports.resolveVerifyVerbs({ which, trust, repo, checkout })`. It
is asked once for each repository the run surveyed in a local checkout, named
by `repo` (`owner/name`) and `checkout` (its path), so repositories that build
differently (`make`, a package manager, `cargo`) can each get their own list.
Every call comes before the first update, so a list refused for one repository
stops the run before anything is pushed. A standalone run has no list for
`check`, and runs `test` from `test_command`:

```yaml
# pr-update.local.yaml
pr_update:
  verify: test
  test_command: bun test
```

With `verify: test` and no `test_command`, a standalone `update` fails before
it touches any PR. `test` never guesses.

### `verify: detect`

`verify: detect` is the opt-in middle ground for a person updating PRs across
many repositories, none of which has a `test_command`. It walks a fixed ladder
in each PR's own update worktree, after checkout and before verify, and runs
the first rung that matches:

1. `test_command`, when configured;
2. a `test` recipe in a `justfile` (`just test`), then a `test` target in a
   `Makefile` (`make test`);
3. `scripts.test` in `package.json`, run with the package manager its lockfile
   names (`pnpm test`, `yarn test`, `bun run test`; `npm test` for
   `package-lock.json` or no lockfile). The `npm init` placeholder is not a test;
4. `cargo test` for `Cargo.toml`, `go test ./...` for `go.mod`, `sbt test` for
   `build.sbt`.

The run prints the choice for each PR on stderr
(`pr-update: verify: detect owner/name#12: make test  (Makefile test target)`).
When no rung matches, that PR's update fails, naming what was looked for; the
other PRs go on. A failure of that kind is reported but not recorded as a failed
attempt, so it does not block a retry once a test command exists. Nothing beyond the ladder is guessed. Because the repository's
own files choose the command, `verify: detect` in the project file is gated
like `test_command`: it needs `--trust` or a recorded trust. A host that
supplies `Ports.resolveVerifyVerbs` receives `which: 'detect'` and may call the
exported `detectVerifyCommand(dir, testCommand?)` for the same ladder, and may
throw `NothingDetectedError` when it finds none. `pr_update.verify` is also
written from the command line only: `config set pr_update.verify` is refused
over MCP and HTTP, since `detect` lets the repository choose a command.

Detection runs once per PR, so a PR that adds or removes a `justfile`, `Makefile`
or `package.json` test script is judged by its own files. Every other `verify`
value resolves once per repository.

## Not retrying a failure that will repeat

An update that ends `conflict` or `failed` will fail the same way next time, unless the head or the
base has moved. So `update --apply` records each failure in `.pr-update/attempts/` (one file per
repo, head and base branch; a `--repo` target's go in pr-update's state directory, see `--repo`), keyed by repo, head branch, head sha, base branch and base sha. Once a
PR has failed `max_failed_attempts` times (default `1`) at its current key, later runs list it under
`skipped` with the reason `failed N time(s) at this head and base; waiting for either to move`, and
do not check it out. A new commit on either branch changes the key, so the next run attempts it
again. A PR whose head or base sha is unknown has no key and is never skipped. An `updated` or
`up-to-date` result clears the record for that head and base. Entries older than 30 days are dropped.

Each PR's record is written as soon as that PR finishes (a failure recorded, or an `updated` result
clearing it), not after the whole batch, so a run killed by a job timeout keeps what it learned.

`--retry-failed` attempts recorded PRs anyway and still records new failures.
`max_failed_attempts: 0` turns the check off. A rehearsal reads the record but
never writes it. It cannot call the repair, so its failures say nothing about a
real run.

### Sharing the record and a lock through refs on the remote

By default the record is per machine. A CI job and a laptop, or two CI runs, each know only their
own failures, and can update the same branch at once. With

```yaml
pr_update:
  attempts:
    store: git-ref
```

the record lives on the `--remote` (default `origin`) as refs, and `update --apply` also takes a
lease on each head branch while it updates it. `@osdlc/ref-lease` (`refStore`, `claim`, `refKey`) does every write as a
compare-and-swap (`push --force-with-lease`), so the remote decides who wins a race. The lease
is on whenever the store is `git-ref` and never otherwise; there is no separate switch.

| Ref | Holds |
|---|---|
| `refs/pr-update/attempts/<head>--<hash>` | `{ "entries": [...] }`, the file store's JSON, one ref per repo, head and base branch |
| `refs/pr-update/lock/<head>--<hash>` | `{ holder, pr, startedAt, expiresAt }`, the lease on one head branch |

`<head>` is the branch name with every character outside `A-Za-z0-9_-` turned into `_` and cut to
60 characters, and `<hash>` is 10 hex digits of the exact name (and, for attempts, the repo and base
branch), so any branch name gives a valid ref name and two names never collide. `attempts.ref_prefix`
(default `refs/pr-update/`; must start with `refs/` and stay out of `refs/heads`, `refs/tags` and
`refs/remotes`) moves both namespaces.

Records are read with one fetch of `<ref_prefix>attempts/` per run. A write that loses its
compare-and-swap reads the ref again and applies the same change to what it finds (up to five
times), so two runs that fail the same PR at once both count. Entries older than 30 days are
deleted at the start of an `--apply` run (a ref whose entries are all old is removed). A rehearsal
reads the record, never writes it and never takes a lease.

The lease: before checking a PR out, the run creates the lock ref, or replaces it when its
`expiresAt` is past or it names this same holder (a crashed earlier run of this holder). The holder
is `github-run-<GITHUB_RUN_ID>` when that is set, else `<hostname>:<pid>`, each followed by a random suffix per run. A PR whose lease another
live holder has is skipped, with the reason `another pr-update run is updating this branch
(<holder>)`, and its failure is not recorded. The lease is deleted after the push, in a `finally`,
pinned to the commit this run wrote, so a lease that expired and was taken over is never deleted
from under its new holder. Nothing renews a lease: one left by a killed run lasts until
`lease.ttl_seconds` (default `repair.timeout_seconds` plus 600, or 1800 without a repair timeout),
so set it longer than your slowest PR update.

```sh
git ls-remote origin 'refs/pr-update/*'                       # what is recorded and who holds what
git fetch origin 'refs/pr-update/*:refs/pr-update/*'          # read them locally
git show refs/pr-update/lock/<name>:lease.json                # one payload
git push origin --delete refs/pr-update/attempts/<name>       # forget one PR target's record
git push origin --delete refs/pr-update/lock/<name>           # break a stuck lease
```

Some hosts accept only `refs/heads` and `refs/tags` from a push (a ruleset or a server hook). Such a
remote refuses these refs, and the run stops with an error that names the remote and this setting.
Set `attempts.store: file` there. The file store is the default, so nothing changes until you opt in.

## Keeping a failed PR's worktree

A run that ends `conflict` or `failed` normally throws its worktree away, and a person who picks the
PR up has to fetch, rebase, re-run the resolvers and re-run verify to get back where it stopped.
`update --apply --keep-failed` (or `pr_update.keep_failed: true`; `--no-keep-failed` overrides it)
moves that PR's worktree to `.pr-update/failed/<owner>-<name>-<number>/`, on a branch named
`pr-update/failed-<owner>-<name>-<number>`, and the run goes on in a fresh one. A `--repo`
target's tree goes to `kept/<host>/<owner>/<name>/<number>/` in pr-update's state directory
instead (see `--repo`), on the same branch name. The result carries
`keptWorktree: <path>` and the text output says `kept: <path>`.

```sh
pr-update update --apply --keep-failed
git worktree list                    # the kept tree is ordinary worktree state
cd .pr-update/failed/acme-widgets-12  # finish the fix, then push it yourself
```

- The tree is the state the update ended in. A failed verify leaves the built merge or rebase result.
  A conflict is aborted, which leaves the PR's own head.
- A failed verify's log (the verb, its exit status and its output) is written to
  `.pr-update-verify.log` in the tree, and the repository's `info/exclude` lists it, so it is never
  committed by accident.
- Only `--apply` runs keep anything. A failure that says nothing about the PR (see
  `unrecorded`) is not kept, and neither is a PR whose worktree git cannot move (one holding
  submodules); the result's `keepError` says why.
- When the kept directory is on another filesystem than the run worktree, git cannot move it.
  The kept tree is then made fresh with `git worktree add` at the same commit, with the verify
  log written into it. Uncommitted changes and untracked files in the run worktree, such as
  build output, are not carried over. The run tells the two cases apart by renaming an empty
  probe folder into the kept directory first.
- A kept tree's record names the git directory that owns it. A target can be served from
  different checkouts on different runs, so a run served from another one leaves the tree alone
  and lists the PR under `skipped`, reason `kept elsewhere: <path> is a worktree of <git dir>`,
  while the PR is unchanged or under `--retry-failed`. A PR that has moved has its old tree
  removed through the git directory that owns it, as does `--discard-kept`.
- A later run lists a PR with a kept worktree under `skipped`, reason
  `failed worktree kept at <path>`, while its head and base sha are unchanged. A PR that has moved
  is attempted again and its old tree is discarded, as is a PR named by `--retry-failed`. A tree
  someone has changed or committed to, or one git cannot read, is not discarded either way: the
  PR is skipped with `kept worktree <path> has local changes; push them or pass --discard-kept`,
  and only `--discard-kept` removes it. A record is used only when its path names the kept
  tree's own folder, and names starting with `.` in these folders are skipped.
- A restack child (`--restack`) is held back the same way when a person changed its kept tree,
  its owner is gone, or another checkout owns it. Whether its tree is current is not judged,
  since its base is its parent's new head: an untouched tree is left, and a new keep replaces it.
- `.pr-update/failed/` is inside the working tree, so a repository's own files can put a record
  there. A record is refused when its branch is not `pr-update/failed-<owner>-<name>-<number>`,
  its path is not that PR's kept folder, it names a git directory (a checkout's own records never
  do), or `git worktree list` in the checkout does not show its folder on its branch. A refused
  record and its folder are left as they are, the output's `keptRefused` lists the record with
  why, the text says `kept record <file> left alone: <why>`, and the PR is updated as if nothing
  were kept.
- `update --apply --discard-kept` removes every kept worktree of the surveyed repositories, then
  runs as usual. The output's `discarded` lists what was removed.

## Seeing a force-push before it happens

`update --apply --confirm-push` stops before each rebase force-push. It prints
the PR, the commits that will be on the branch (`git log
<remote>/<head>..HEAD`), how many commits the push replaces, and `git diff
--stat <remote>/<head> HEAD`, then asks `Force-push to <head>? [y/N]`. Only
`y` or `yes` pushes. Anything else leaves the branch as it was and reports
`push declined`. A prompt that fails (the terminal went away) counts as no and
is not recorded as a failed update. A merge push is a fast-forward and is not
asked about, and a dry run never asks.

The flag needs `--apply` and a terminal on stdin and stderr. A library caller
sets `confirmPush: true` in the args and may supply `Ports.confirmPush` to ask
some other way than the terminal.

## A report a host can read

`update --report <file>` writes the run's result as JSON (the same document
`--json` prints, `schemaVersion` and `kind` included) through a temp file and a
rename, so a reader never sees half of it. Any report left by an earlier run is
removed first, so a file that is there belongs to this run. It is written
whenever the run produced a result, on a clean exit and on a conflict or failure
alike. Each PR's entry carries its `repo` and `number`, `status`, the `strategy`
that ran, `strategyFallback`, `repaired`, `conflicts` and `localCheckout`, so a
host can act on each outcome without parsing text. `skipped` lists the PRs left
alone, each with its `repo`, `number` and `reason`. `notFound` lists the `--pr`
selectors no surveyed PR matched (`#N` or `owner/name#N`). `repos` lists the
repositories surveyed, exactly as `survey` reports them. A run that throws
writes `{ "error": "<message>" }` instead. A run refused before it starts (a
flag usage error, or no trust) writes none.

There is no interactive checklist. `--confirm-push` is the way to ask before a
force-push.

## Config

The binary reads the `pr_update:` and `code_host:` blocks of `pr-update.yaml`
in the project root, layered under `pr-update.local.yaml` (the gitignored,
per-checkout overlay). It reads no other file, and every other top-level key is
skipped unread. Every key has a default, so `survey` and `update` work with no
config file at all.

| Source | Wins over |
|---|---|
| A CLI flag | everything below |
| `pr-update.local.yaml` | `pr-update.yaml` |
| `pr-update.yaml` | the built-in defaults |

`PR_UPDATE_CONFIG=path/to/file.yaml` replaces that pair with the named file and
its overlay (`file.local.yaml`). A path that does not exist is an error. A key
the blocks do not define, at any depth, and a malformed value both exit `14`.

`pr-update config list|get|set|unset|path|explain|scaffold` reads and edits
those files. They are `@osdlc/cli-tool`'s shared `config` commands, so they
behave as in every tool built on it, `--json` included. `--local` writes the
overlay; the default is `pr-update.yaml` (`--project`). A value is read as
JSON, else as the bare string (`config set strategy merge`,
`config set max_failed_attempts 3`). `set` validates the merged result before
it writes, and keeps comments and layout. A change that would leave the config
invalid is a usage error (exit `2`) and writes nothing. Only the result is
checked, so `set` or `unset` can repair a file that is invalid now. The write
is a compare-and-swap: when the file changed between the read and the write
(an editor saved it), it is left as it is and the command exits `1` with code
`config-conflict`; run it again. A file
that is not YAML at all, or a `PR_UPDATE_CONFIG` naming a missing file, exits
`14`; `config path` still lists the files. `set` and `unset` take `--dry-run`.
An unknown key exits `2`. `get` of a key with no value, and `unset` of a key
the file does not set, exit `1`. `config` alone lists. `explain` shows each layer
(default, project, local), the value it sets and which won. A key without a
section prefix means `pr_update.<key>`: `pr-update config set strategy merge`
equals `pr-update config set pr_update.strategy merge`, and every answer
prints the qualified key.

A standalone run also reads `attempts.store` (`file` or `git-ref`, default `file`),
`attempts.ref_prefix` (default `refs/pr-update/`) and `lease.ttl_seconds` (default derived, see
above). A host that embeds the package supplies `Ports.attempts` and `Ports.lease` instead.

These settings are gated: `lockfile_install`, `resolvers[].run`,
`repair.command`, `repair.agent`, `test_command`, a `repair.mode` other than
`headless`, and `verify: detect`. Each makes the tool start a command, or an
agent that can run tools, that the repository chose, or run the agent without
the headless call's isolation. When one is set in the project file, unless
`pr-update.local.yaml` overrides it, `update` exits `21` until you consent. Pass `--trust`
for one run, or run `pr-update trust` once to record the repository (kept under
`~/.local/state/osdlc/pr-update/trusted/` on Linux and macOS, moved by `OSDLC_ROOT`
or `XDG_STATE_HOME`). `trust` is cli-tool's shared command:
`--show` reports the repository's trust, `--list` every trusted repository and
`--untrust` removes the record.

Trust recorded by an earlier release, before the store moved, no longer
counts; see [Upgrading](#upgrading-from-017-or-earlier).

`pr-update trust` keys on the working directory's repository root. Given
`host/owner/name` (`pr-update trust github.com/acme/api`), it records that
repository instead, for a run that reaches it through a clone rather than a
checkout of yours. Name the host without a port and the repository without
`.git`: a `--repo ghe.example:8443/acme/api` is trusted by
`pr-update trust ghe.example/acme/api`. `--show`, `--untrust` and `--list` take the same
form. A checkout found under your roots is trusted by its path, like the
project root; a grant by name does not cover it.

Every `--repo` target passes this gate before `update` runs a command in it
(`lockfile_install`, `resolvers`, a `verify` other than `none`, `repair.command`
or `repair.agent`, from any config layer or flag). An untrusted target is
skipped, not refused: the run exits `21` only for the project root.

### The machine file

What a repository may not decide, because it is about this machine, lives in
pr-update's machine file, not in `pr-update.yaml`:
`~/.config/osdlc/pr-update/config.yaml` on Linux and macOS (`OSDLC_ROOT` or
`XDG_CONFIG_HOME` moves it with the rest of the osdlc directories, and
`PR_UPDATE_MACHINE_CONFIG`, an absolute path, names the file itself). It is
for the managed clones of targets with no checkout on the machine (see
[A target with no checkout](#a-target-with-no-checkout-the-managed-clone)).
`pr-update mirror enable` and `pr-update mirror disable` write it
([The `mirror` commands](#the-mirror-commands)).

| Key | Meaning |
|---|---|
| `checkout: local \| mirror` | `local` never clones: a target with no checkout is skipped. `mirror` clones it. Unset until you answer |
| `mirror_dir: <path>` | Where clones go: an absolute path, or one starting `~/`. Default `repos/` in pr-update's cache directory |
| `mirror_max_age_days: <n>` | A clone unused this long is removed by `mirror prune` and at the end of an `update --apply` that used the cache. Default 30; `0` turns that off (dead runs' worktrees are still removed) |

An unknown key, a bad value or a YAML error there is reported, when a run
reads the file, with the file's path, and skipped. A file pr-update cannot
write an answer into, because it is not valid YAML or its top level is not a
map of keys, makes `update --apply` exit `14` before it asks the clone
question, and `mirror enable` and `mirror disable` exit `14` too; the file is
left as it is. None of these keys is accepted in `pr-update.yaml`, its `.local`
overlay or a host's `pr_update:` block: there they are unknown keys (exit
`14`), so a cloned repository cannot choose where the tool writes on your
disk.

Only one of `repair.command` and `repair.agent` may be set, checked on the
merged config. A `pr-update.local.yaml` that wants an agent where the project
file names a command must also set `command: null`, or the merged config names
both and is refused.

### Caller-named config

The engine's loader takes the file name and the env variable from its caller.
The binary passes `{ name: 'pr-update.yaml', envVar: 'PR_UPDATE_CONFIG' }`. A
host that keeps these blocks inside its own config file passes that file's
`ConfigFileSpec` to `loadConfigLayers(file, projectRoot)` and gets the same
schema, defaults and layering, or hands it to `main(argv, ctx, { configFile })`
to run the whole binary against it. A host may also mount `prUpdateSection` in
its own section list, or build a `PrUpdateConfig` from whatever config format
it already has. Nothing here requires a config file.

## The `Ports` a host supplies

Three things this package does not know for itself, two optional extra
conflict resolvers, an optional record of failed updates, and an optional push
confirmation:

| Port | What it answers |
|---|---|
| `locate(repo, target?)` | Where `owner/name` (lower-cased; `target` adds the host) is checked out on this machine: a path, read through the run's `--remote`, or `{ path, source, remote, others? }`, read through `remote`; `null` for none. `source` is `located` for a checkout of the person's, fetched without pruning and trusted by its path, or `clone` for a clone the host keeps for the run, fetched with `--prune` and trusted by `host/owner/name`. A bare path counts as `located`. `others` lists the repository's other checkouts, which the `unpushed_local` guard also reads. Asked once per target per run |
| `targetHome(target)` (optional) | Where a checkout `locate` returned as `{ path, source, remote }` keeps its run worktrees, kept worktrees, failed-update record and lease. Without it, such a checkout is used as the project root is, with `.pr-update/` inside it |
| `runVerb(verb, cwd)` | Run one shell verb, for resolvers and verify |
| `resolveVerifyVerbs({ which, trust, repo, checkout })` | The trust-gated verb list `verify: check` or `verify: test` runs before a push, asked once per repository |
| `generators` (optional) | In-process rebuild steps, each with `claims(path)` and `run(worktree)` |
| `repair(req)` (optional) | The last step, async: edit the worktree to fix a `conflict` or `verify-failed` |
| `attempts` (optional) | The failed-update record: `get(key)`, `recordFailure(key, reason)`, `clear(repo, head, base)`, and optionally `prune()` |
| `lease` (optional) | `acquire({ head, pr })` returns `{ ok: true, release }` or `{ ok: false, holder }`; taken around each PR's update in an `--apply` run |
| `confirmPush(preview)` (optional) | Under `confirmPush: true`, whether to make one rebase force-push; the terminal prompt when absent |

`standalonePorts(cfg, projectRoot)` gives a `pr-update` CLI run defaults for the three required ports
(locate, runVerb, resolveVerifyVerbs) and for repair and attempts.
Its `locate` finds a checkout under the `repositories.yaml` roots as above, scanning them once for
the ports object, so make one per run. It builds `repair` from `repair.agent` or `repair.command`, stores attempts in
`<projectRoot>/.pr-update/attempts/` (`fileAttemptStore`), or, with `attempts.store: git-ref`, as
refs on the `--remote` (`refAttemptStore`) with a per-branch `lease` (`refBranchLease`). Its
`targetHome` puts every other target in pr-update's directories, as under `--repo` above. It answers `verify: test` with
`test_command`, and refuses `verify: check`. A standalone run has no host registry to look up
`check` in, so set `verify: 'none'`, or embed this package as a library and supply real ports.
`runUpdate` updates every target with a checkout, not only the project root. Before it runs a
command in a target's worktree it asks `UpdateEnv.targetTrust(target)`, which gives null to go
on or the reason to skip the target. Without `targetTrust` no target is checked: each may run
its commands, and the host's own trust rules apply only through `Ports.resolveVerifyVerbs`.
`commandRepair(command, timeoutSeconds)` and `agentRepair(agent, options)` are the command and
agent repairs, for a host that does its own trust check. `planRepair` shows the call a preset would
make without running it.

## Code hosts

`survey` and `update` list PRs through the `CodeHost` port
(`@osdlc/code-host`, `listPrDetails`), so no GitHub client is imported
here. The `pr-update` binary picks the host with `selectCodeHost`. A
`github.com` remote, or a repository with no `origin`, uses GitHub over `gh`.
Any other remote is taken as a self-hosted Forgejo, over `curl`, with the token
in `FORGEJO_TOKEN`. `code_host.override: github` or `forgejo` in the config
forces the choice, for example for a GitHub Enterprise host. The token's
variable name is not configurable here. It is always `FORGEJO_TOKEN`.

`--remote` (default `origin`) names the remote whose URL gives the repository,
the one fetched, the one whose remote-tracking refs (`<remote>/<branch>`) drift
and conflicts are measured against, and, for `update`, the one pushed to. It
does not change which code host is chosen: that always reads `origin`. A
`--repo` target is listed by its host instead (see
[Other repositories](#other-repositories---repo)).

A host that embeds the engine as a library supplies `SurveyEnv.codeHost`, and
none of this applies to it. When `SurveyEnv.codeHost` is absent, the library
uses GitHub over `gh`. It does not read the remote, so an embedding that never
named a host never starts talking to Forgejo. `selectedCodeHostFor` is the
CLI's factory, if a library caller wants the same choice.

Whatever the host, a listing it could not complete (not signed in, no
network, a refused token) makes `runSurvey` throw a `FailureError` from
`@osdlc/result`. It carries the code host's `CodeHostFailure` (its `kind`,
`message` and `hint`). It is never an empty list. The CLI prints it as
`pr-update: <message> <hint>` and exits with the code for its kind. A host
that cannot be built throws the same way, from `selectedCodeHostFor`.

With several `--repo` targets, one repository that cannot be listed does not
abort the others. Every repository is surveyed. The failed one is recorded on
its `repos` entry (`failure: { kind, message, hint }`, and no PRs) in both
`survey` and `update` output, and printed on stderr as
`pr-update: <repo>: <message> <hint>`. The run then exits with the code of the
first failure (a later one with a different code is printed but does not
change it). With a single repository the failure is thrown.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean run (`survey` always; `update` when no PR ended `conflict` or `failed`) |
| `1` | Something went wrong that no other code names, for example: the run finished but a PR ended `conflict` or `failed`; `mirror prune` could not remove something; `config set` lost a race with another write; `PR_UPDATE_MACHINE_CONFIG` is not absolute; or an unexpected error |
| `2` | The command cannot run as typed, for example: a malformed flag, `--repo` or `--pr`, a `--branch` with no open PR, a `--pr owner/name#N` for a repository outside the run, one `owner/name` on two hosts, an unusable clone directory, an `update --apply` that must ask whether to clone and has no terminal, or a `GIT_DIR` or `GIT_WORK_TREE` that names another repository than the directory's own |
| `14` | A config file is invalid or unreadable, or the machine file cannot take an answer about cloning (not valid YAML, or not a map), in `update --apply`, `mirror enable` or `mirror disable` |
| `21` | `update` refused for want of trust in the project root. An untrusted `--repo` target is skipped instead |
| `22` | A tool the run needs is not installed: `git`, and `gh` (GitHub) or `curl` (Forgejo) |
| `23` | The code host refused the caller or answered unusably: not signed in, no `FORGEJO_TOKEN` or a refused one, no such repository, an HTTP error |
| `24` | There is no repository to work on: no readable git remote, one that names no repository, or not a git checkout (pass `--remote` or `--repo`) |
| `25` | The code host could not be reached, timed out or rate-limited the caller; try again later |
| `128+N` | `update` was stopped by signal N (`130` for Ctrl-C, `143` for `SIGTERM`). It runs no end-of-run prune |

`22` to `25` are not pr-update's own. They are the failure codes every tool
built on `@osdlc/cli-tool` shares (`EXIT_FAILURE`), so a script that handles one
handles the others. `21` is this tool's. Any other failure of a tool the run
shells out to is an ordinary `1`.

With `update --report`, a run that failed before it had a result writes
`{ "error": "<message and hint>", "failure": { "kind", "message", "hint" } }`
(`failure` only for a classified failure; `hint` only when there is one). A
refusal before the run starts (a missing tool, a missing remote, no trust)
writes no report.

## When not to use

- You want a hosted bot that keeps PRs current without a machine of yours
  running: use Kodiak or Mergify.
- You only need to update one PR by hand: GitHub's "Update branch" button or
  `git rebase` does it.
- You manage a stack you author yourself and want a branch-stack workflow
  end to end: use Graphite or git-town.
- Your host is neither GitHub nor Forgejo and you do not supply a `CodeHost`
  adapter: there is nothing to list PRs with.

## Prior art

From the author's knowledge, read on 2026-10-20 and not re-checked against
current docs. The design record,
[D-0001](docs/planning/decisions/D-0001-engine-hosts-and-one-judgement-seam.md), has the
full table.

- GitHub "Update branch" merges or rebases the base into one PR from the web
  UI. This package borrows the two strategies, and adds conflict resolution and
  stacks.
- Kodiak and Mergify keep PRs current with their base through a hosted bot and
  a merge queue. This package borrows "update only what is behind, in order"
  and runs locally instead.
- Renovate rebases its own PRs and regenerates lockfiles by re-running the
  package manager. The lockfile rule and `resolvers` follow that: a derived
  file is regenerated, not merged.
- `git rerere` replays a recorded resolution. It is the first resolver.
- Graphite `gt restack` and git-town `sync` restack a branch stack parent
  first. The stack order, blocked children and `--restack`
  (`rebase --onto` the parent's new head) follow the same idea. See
  [D-0002](docs/planning/decisions/D-0002-restack-a-whole-stack-in-one-run.md).

## Running from a checkout

To try a change to pr-update with the `pr-update` already on your PATH, link a
checkout of this package:

```sh
pr-update dev link ~/src/osdlc/packages/ts/pr-update   # every `pr-update` now runs that checkout
pr-update dev status                             # which code runs, and why
pr-update dev off                                # back to the installed copy
```

`PR_UPDATE_HOME=<checkout> pr-update …` does the same for one run. The checkout runs
from source under Bun, so it needs `bun` on PATH and the checkout's
dependencies installed and built. The installed copy says which checkout it
hands off to on stderr; `PR_UPDATE_QUIET=1` silences that line.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
