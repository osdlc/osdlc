---
"@osdlc/pr-update": minor
---

`update` now updates a `--repo` target found as a checkout on this machine,
where before it only surveyed it and skipped its PRs. The run works in a
worktree under pr-update's cache directory
(`~/.cache/osdlc/pr-update/worktrees/<host>/<owner>/<name>/`), so the
checkout's own working tree, index and HEAD are not touched. Every git
command there runs with hooks off, so a hook the PR commits under a relative
`core.hooksPath` does not run, and the run never prunes the checkout's other
worktrees. If a target's own attempt record or lease fails, that target's PRs
are skipped with the error, and the run goes on. Its kept worktrees and failed
attempts go in pr-update's state directory, under the same
`<host>/<owner>/<name>`, and with `attempts.store: git-ref` its record and
lease are refs on that checkout's `origin`. The project root keeps
`.pr-update/` as before. A host that embeds the package chooses these places
with the new optional `Ports.targetHome`; without it, a target is used as the
project root is.

Each target now passes the trust gate before `update` runs a command in it.
A checkout is trusted by its path: run `pr-update trust` inside it. An
untrusted target is skipped with a reason starting `untrusted:`, and the other
targets go on. `--trust` covers every target.

The trust store has moved to `~/.local/state/osdlc/pr-update/trusted/`
(moved by `OSDLC_ROOT`). Trust recorded by an earlier release is not carried
over and no longer counts: run `pr-update trust` again in each repository you
had trusted. `pr-update trust` also takes a repository as `host/owner/name`,
such as `pr-update trust github.com/acme/api`.

`--repo` is checked more strictly. Its `host/owner/name` must be a key a
repository can be trusted by, so an owner or name longer than trust-repo
allows, or a host that is not a host name, exits `2`. So does a name ending
in `.git`, with a message that gives the form without it. A host's port is left out of every path and trust key:
`--repo ghe.example:8443/acme/api` is trusted by
`pr-update trust ghe.example/acme/api`.

A kept worktree's record now names the git directory that owns it. A run
served from another checkout of the same repository skips that PR as
`kept elsewhere` while it is unchanged. When the kept directory is on another
filesystem, the kept tree is made with `git worktree add` at the same commit
instead of moved, and uncommitted changes and untracked files such as build
output are not carried over. A kept tree whose git directory is gone, or that
git cannot read, is never removed as stale: its PR is skipped until
`--discard-kept`. A folder left in a kept tree's place with no record is not
moved into, and the run says how to remove it. A kept record is used only
when its path is the kept path its file name gives. If a target's own record
cannot be saved after a PR ran, the error is shown on that PR, as
`recordError` in JSON and `record not saved:` in the text.

Fixed: a run started from a git hook, which exports `GIT_DIR`, no longer
acts on the hook's repository inside its own worktrees. In the project root's
run worktree that moved the main checkout's branch. Every git call in a run
worktree or kept tree, and every command started there (verify, resolvers,
`lockfile_install`, a repair command or agent), now runs without `GIT_DIR`,
`GIT_WORK_TREE`, `GIT_INDEX_FILE` and git's other repository variables. So
does every git call in a `--repo` target, and a target's `git-ref` record and
lease name its own repository. The project root's fetch, survey and listing
are unchanged.

Fixed: `--retry-failed` no longer discards a kept worktree someone has
changed or committed to, or one git cannot read, in the project root too.
That PR is skipped with `kept worktree <path> has local changes; push them or
pass --discard-kept`, and only `--discard-kept` removes the tree.

In branch mode, a target served from a checkout other than the project
root is skipped, and the `unpushed_local` guard reads every checkout of a
repository, not only the one the run uses.
