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
- **GitHub credentials belong to `gh`.** The package reads no GitHub token.
- **The remote picks the host.** `origin` decides which adapter and which
  repository the updates go to. A `--repo` target names its own host, or
  takes the host of the project root's `origin`.
- **Other repositories run with hooks off.** For a `--repo` target, every git
  command, in a checkout found on the machine, a managed clone or their run
  worktrees, runs with `core.hooksPath=/dev/null`, so a hook the PR commits
  does not run. Each target passes the trust gate on its own. The project
  root's git runs as before.
- **A managed clone holds a credential helper.** Its own git config gets
  `!gh auth git-credential` for its host, so fetches and pushes sign in
  through `gh`. Your global git config is not changed.
- **Pruning deletes folders.** `mirror prune`, and the pruning at the end of
  an `update --apply`, delete folders only inside pr-update's cache and
  state directories, and in the git directory that owns a dead run's
  worktree only that worktree's record and scratch branch. They never follow a symbolic link, and on Linux and macOS
  they remove nothing from a folder another user owns or others can write
  to. Windows gets no such check.
