---
"@osdlc/pr-update": minor
---

New command: `pr-update kept push <pr> --to <remote-or-path> [--branch <name>] [--force]`
copies a failed PR's kept worktree out of pr-update's cache. It pushes the tree's HEAD commit to a
remote of the repository, a URL or a local repository, as `pr-update/failed-<owner>-<name>-<number>`
or `--branch`. `<pr>` is a number of the project root's repository, or of `--repo`, or
`owner/name#<number>`. A branch already there is refused unless `--force`, which replaces it with
a `--force-with-lease` pinned to the commit it held. The tree is found through its record and is
not changed. Hooks are off in the repository pushed from; a local repository pushed to runs its
own receive hooks, as a server does. `--json` prints `{ repo, number, worktree, sha, to, branch,
replaced }`. It exits 1 when the PR has no kept worktree, the branch is there without `--force`,
or the push fails.

`kept` is a command group, as `mirror` and `trust` are: the noun for what is acted on, then the
verb.
