# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release.

## What to expect

This is a small project. We aim to reply within a week, tell you whether we
accept the report, and credit you in the release notes if you want that.

## Threat model

This package runs `git` and, through `@osdlc/code-host`, `gh` or `curl`. With
`--apply` it checks out branches in a temporary worktree, rewrites them and
force-pushes them (with a lease). A wrong argument can change a repository.
Reports about values reaching those tools in a form the caller did not intend
are in scope.

- **No shell is involved for git and the code host.** Each value is passed as
  one argument.
- **Commands and agents from config run.** `lockfile_install`,
  `resolvers[].run`, `repair.command` and `test_command` run in a shell, and
  `repair.agent` starts an agent CLI. A value read from the project file
  needs trust: the run exits `21` until you pass `--trust` or run
  `pr-update trust`. Values from your local overlay or the command line are
  your own consent.
- **A repair agent can run tools.** It edits the update worktree. The engine
  rejects a repair that moves HEAD, creates a ref or leaves conflict markers,
  but it does not sandbox the agent.
- **Recorded resolutions are replayed, in managed clones only, within one
  run.** In `update --apply` in a managed clone, unless `pr_update.rerere` is
  false, git's rerere replays a resolution recorded earlier in the same run
  into a later rebase stop or a sibling PR with the same conflict. What can be
  replayed is pr-update's own: a resolution a resolver or an accepted repair
  made in this run, in this clone, for a PR that was pushed or for the PR in
  flight. A run uses rerere only while it holds the clone's rerere lock
  (`pr-update-rerere.lock` in the clone), taken without waiting; a run that
  cannot get it uses no rerere. The holder empties `rr-cache/` when it takes
  the lock, whenever a PR ends without a push, and when it lets go, and the
  lock of a killed holder is taken over by a run that empties the cache first,
  so no run replays another's unpushed resolution. When the cache cannot be
  emptied, the run uses no rerere from then on. A replayed
  path no resolver claims is reported (`replayed`), and `verify` is its only
  check: with `verify: none`, a replay is pushed unchecked. An agent that
  writes into `rr-cache/` itself during the run is not stopped. In the project
  root and a located checkout, rerere is off for every merge, rebase and
  commit pr-update runs, so the person's own resolutions are never replayed
  into a PR.
- **A located checkout's git config runs as you.** A `--repo` target's
  checkout found on this machine is fetched and pushed with its own
  `.git/config`, so what it sets (`core.sshCommand`, `credential.helper`,
  `pushurl`, `core.fsmonitor`) runs as the person running pr-update, before
  and outside the trust gate. So a checkout is used only when its work tree,
  its git directory and its `config` file belong to you and no one else can
  write to them (the folder rule of the clone directory: not `o+w`, and not
  `g+w` unless the group is your private group; never on macOS). A default
  root outside your home directory that others can write to, such as `/tmp`,
  gives no default root. git's own `safe.directory` check is not relied on:
  it is off under `safe.directory=*`, and missing in git 2.34.0 and 2.34.1.
  Windows gets no such check. A root you list in `repositories.yaml` is
  yours to keep to checkouts you trust.
- **GitHub credentials belong to `gh`.** The package reads no GitHub token.
- **The remote picks the host.** `origin` decides which adapter and which
  repository the updates go to. A `--repo` target names its own host, or
  takes the host of the project root's `origin` when that is GitHub, else
  github.com.
- **Hooks are off wherever a PR's files are checked out.** Every git command
  in a run worktree or kept tree, the project root's included, runs with
  `core.hooksPath=/dev/null`, set after any `-c core.hooksPath` a parent git
  passed on in `GIT_CONFIG_PARAMETERS`. So a hook the PR commits under a
  relative `core.hooksPath` such as `.husky` does not run at `worktree add`,
  at the checkout of the PR's head or at the push, and neither does your own
  pre-push hook on pr-update's pushes. For a `--repo` target, every git
  command in a checkout found on the machine or a managed clone runs that way
  too. Each target passes the trust gate on its own. The project root's own
  fetch, survey, PR listing and branch mode's sync, in your checkout, keep
  its hooks.
- **git finds programs on the absolute `PATH` entries only where a PR's
  files are checked out.** git and `gh` themselves are always found that way.
  git also looks programs up on `PATH` itself, from the folder it runs in:
  `ssh` for a fetch or push over ssh, a `!` credential helper such as the
  `!gh auth git-credential` that `gh auth setup-git` writes, `gpg` to sign,
  the shell's lookup for `core.sshCommand`. So with a relative entry such as
  `.` on `PATH`, any of them could be a file the PR commits. Every git command
  pr-update runs in a run worktree or kept tree, the project root's included,
  and every one in a `--repo` target (the git that `gh repo clone` runs, and
  the target's `git-ref` record and lease, included) gets a `PATH` holding
  only the absolute entries of yours. With none left, it is `/usr/bin:/bin`
  on Linux and macOS, never an empty `PATH`, which a shell reads as the
  current folder. The project root's own fetch, survey, PR listing and branch
  mode's sync run in your checkout with your `PATH`. Commands from config
  (verify, resolvers, `lockfile_install`, a repair command or agent) run
  the PR's code by design, under the trust gate, with your `PATH`, and so do
  your own git commands in a kept tree (a kept tree is evidence to copy with
  `kept push`, not a place to work).
- **pr-update's worktrees and other repositories ignore `GIT_DIR`.** A run
  started from a git hook inherits `GIT_DIR`, which would make every git it
  runs act on the hook's repository; in a linked worktree that moves the
  main checkout's branch. So `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and
  git's other repository variables are unset for every git call in a
  `--repo` target (the git that `gh repo clone` runs included), for every git
  call in a run worktree or kept tree, the project root's included, and for
  every command started there: verify, resolvers, `lockfile_install` and a
  repair command or agent. A target's `git-ref` record and lease name the
  target's own repository instead. The project root's fetch, survey, PR
  listing and branch mode's sync keep them, since they run where you ran pr-update. So `survey` and
  `update` refuse to start, with exit 2, when these variables find another
  repository than the directory's own, as a dotfiles setup's do.
- **PR content picks submodule URLs.** With `submodules: auto`, the update
  clones the submodules a PR's `.gitmodules` names, over the network with the
  run's credentials. Local paths and `ext::` URLs are refused; `https` and
  `ssh` ones are not. See [Git submodules](README.md#git-submodules).
- **A managed clone holds a credential helper.** Its own git config gets
  `!<gh> auth git-credential` for its host, so fetches and pushes sign in
  through `gh`. `<gh>` is the absolute path of `gh`, found on the absolute
  `PATH` entries only, so the helper never runs a `gh` a PR commits, even
  when your own git command in a kept tree runs it with `.` on `PATH`.
  Without one, no helper is set. Your global git config is not changed.
- **A kept record does not choose what is deleted.** `--keep-failed` leaves a
  failed PR's tree where it ran, in `worktrees/` in pr-update's cache
  directory, and writes its record in `kept/` in its state directory, outside
  every working tree, so a repository's files cannot put one there. A record is
  acted on only when its branch is the one pr-update gives that PR, its path is
  a folder directly in that repository's `worktrees/` folder and not a symbolic
  link, and `git worktree list` in the git directory it names shows a worktree
  there on a branch other than a run's scratch branch, so a record can never
  make a live run's worktree look kept. What is in a kept tree never keeps it:
  it is pr-update's. `mirror prune --discard-kept` removes a clone's kept trees
  through that clone, under its lock, only when the tree's own `.git` file
  names that clone, so a moved or copied clone does not decide it. Any other
  record is left alone and reported. A git directory that cannot be read is
  not taken for one that is gone. `kept push` runs no git in the tree: it reads
  the tree's commit from that git directory's worktree list, and pushes from
  there with hooks off. Before any git runs in that git directory, it is
  checked as a run checks a managed clone or a located checkout: it and its
  `config` must be the person's, and no one else may write them. Its default
  branch is `kept/<owner>-<name>-<number>`, never a `pr-update/` one, so no
  later run in the checkout pushed to replaces or deletes it. A local repository it pushes to runs its own receive
  hooks, as a server does, on the PR's commit.
- **No file others can write to.** The `pr-update` command takes write for
  group and others out of its umask when it starts, and git, `gh` and every
  command it runs inherit it, so none of them creates a file or folder others
  can write to. A managed clone is made in a staging folder only its user can
  open, hardened, and only then moved into place, with git's background
  maintenance turned off in it. The umask also covers what pr-update and its
  commands write in the person's own checkout, so a checkout shared by a group
  should set `core.sharedRepository=group`. A host that calls `runUpdate` from
  the library keeps its own umask and must set it.
- **Pruning deletes folders.** `mirror prune`, and the pruning at the end of
  an `update --apply`, delete folders only inside pr-update's cache and
  state directories and the clone directory, which must carry pr-update's
  marker, and in the git directory that owns a dead run's worktree only that
  worktree's record and its `pr-update/` branches. They never follow a symbolic link, and on Linux and macOS
  they remove nothing from a folder another user owns or others can write
  to. Windows gets no such check. Before anything is removed, that folder
  rule, the owner's `git worktree list` and the clone's lock must allow it.
  Everything pr-update made is its own to remove once no live run uses it;
  what is in it (commits, a stash, changes) does not keep it. A worktree is
  removed with one `git worktree remove --force`, and one git refuses (locked
  with `git worktree lock`) stays, with its clone, as a failure. Only
  `pr-update/` branches are deleted in a person's checkout. A clone also stays while its
  `worktrees/` folder holds a record that list does not show, since git leaves
  out a record it cannot read without a word. What cannot be read stays and
  is reported, and `--dry-run` decides the same way, reading a clone's lock
  as a claim would.
