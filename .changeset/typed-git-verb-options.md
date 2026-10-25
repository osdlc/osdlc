---
"@osdlc/typed-git": minor
---

New verbs and verb options, on both `Git` and `AsyncGit`, for operations that needed `raw` before:

- `worktreeAdd(path, { resetBranch })` is `worktree add -B`: create the branch, or reset an existing one. Passing both `branch` and `resetBranch` throws a `TypeError`.
- `commit({ ..., paths })` appends `-- <paths…>`, with every message source, so only those paths are committed. An empty `paths` throws a `TypeError`, because git would commit everything staged.
- `push(remote, refspec, { delete: true })` is `push --delete`, and combines with `forceWithLease`.
- `hasStagedChanges()` is `diff --cached --quiet`: `true` for exit 1, `false` for exit 0, and a throw for anything else. On an unborn HEAD the index is compared against the empty tree. `git.soft.hasStagedChanges()` falls back to `false`.
- `showAtRevChecked(rev, path)` runs the same `show` as `showAtRev`, but a missing path throws the classified failure instead of returning `null`.
- `remoteSetHead(remote, { branch } | { auto: true } | { delete: true })` and `remoteSetBranches(remote, branches, { add })`. An empty `branches` throws a `TypeError`.
- `gc({ auto, aggressive, prune, quiet })`, where `prune` is a date string or `false` for `--no-prune`.

The new option types `WorktreeAddOptions`, `PushOptions`, `RemoteSetHeadOptions`, `RemoteSetBranchesOptions` and `GcOptions` are exported. `GitRequest` and `GitResults` gain the `hasStagedChanges`, `showAtRevChecked`, `remoteSetHead`, `remoteSetBranches` and `gc` kinds.
