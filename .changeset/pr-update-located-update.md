---
"@osdlc/pr-update": minor
---

`update` now updates a `--repo` target found as a checkout on this machine,
where before it only surveyed it and skipped its PRs. The run works in a
worktree under pr-update's cache directory
(`~/.cache/osdlc/pr-update/worktrees/<host>/<owner>/<name>/`), so the
checkout's own working tree is not touched. Its kept worktrees and failed
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
instead of moved, and untracked files such as build output are not carried
over. In branch mode, a target served from a checkout other than the project
root is skipped, and the `unpushed_local` guard reads every checkout of a
repository, not only the one the run uses.
