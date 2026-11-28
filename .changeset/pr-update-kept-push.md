---
"@osdlc/pr-update": minor
---

New command: `pr-update kept push <pr> --to <remote-or-path> [--branch <name>] [--force]`
copies a failed PR's kept worktree out of pr-update's cache. It pushes the tree's HEAD commit to a
remote of the repository, a URL or a local repository, as `kept/<owner>-<name>-<number>` or
`--branch`. The pushed branch is the person's, so it is never under `pr-update/`, which pr-update
makes and deletes: a `--branch` starting `pr-update/` is a usage error. The git directory that
owns the tree is checked first, as a run checks a managed clone or a located checkout, and is not
used when it or its `config` belongs to another user or others can write it. `<pr>` is a number of the project root's repository, or of `--repo`, or
`owner/name#<number>`. A branch already there is refused unless `--force`, which replaces it with
a `--force-with-lease` pinned to the commit it held. The tree is found through its record and is
not changed. Hooks are off in the repository pushed from; a local repository pushed to runs its
own receive hooks, as a server does. `--json` prints `{ repo, number, worktree, sha, to, branch,
replaced }`. It exits 1 when the PR has no kept worktree, its owning git directory is not used,
the branch is there without `--force`, or the push fails.

`kept` is a command group, as `mirror` and `trust` are: the noun for what is acted on, then the
verb.
