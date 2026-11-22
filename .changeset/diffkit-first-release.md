---
'@osdlc/diffkit': minor
---

First public release. `diffkit prep` and `runPrep` read a pull request, a branch or the working tree and print one deterministic JSON manifest for a reviewer: the files worth reading, the files to set aside and why, review groups by package root, and reading-order flags. File facts come from `@osdlc/code-stats`. No model is called.

- **Breaking:** the manifest is `schema: 2`. It reads its file facts from a `@osdlc/code-stats` change report and classifies nothing itself. `change` is the change as code-stats resolves it (`kind` is `pr`, `range`, `merge-base` or `worktree`, with `base` and `head` commits). Dropped files are `generated`, `vendored` or `formatting-only`, and a lockfile is `generated`. A pull request whose commits are not in the checkout is an error that says to run `gh pr checkout`.
- **Breaking:** the `stats` subcommand and the library API only it used are removed. Use `@osdlc/code-stats` for change statistics. `PrepError` and `DEFAULT_GROUP_SIZE` are removed: `runPrep` raises `DiffkitError`, and the default group size is `DEFAULT_THRESHOLDS.groupSize`.
- **Breaking:** `splitEven` is no longer exported.
- **Breaking:** the package ships a compiled `dist/` for Node `^22.22.2`, `^24.15.0` or `>=26.0.0`, ESM only. The `diffkit` binary runs under Node. The `bun` export condition is gone.
- **Breaking:** `zod` is a peer dependency at `^4`, no longer a dependency.
- `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot` and `buildGroups` are experimental. Their shape may change in any release.
- Every export has TSDoc and a runnable example.
- The flags no longer follow a symlink when they read the checkout, so a tracked link cannot make a run read a file outside the repository.
- `--base <ref>` with `--worktree` diffs the merge base of `<ref>` and `HEAD` against the working tree.
- The package is licensed `MIT OR Apache-2.0`.
