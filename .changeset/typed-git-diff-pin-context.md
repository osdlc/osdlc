---
"@osdlc/typed-git": minor
---

`diffText` and `diffAddedFile` pass `--inter-hunk-context=0` and remove `GIT_DIFF_OPTS` from git's environment, so `diff.interHunkContext` and a `-u<n>` in `GIT_DIFF_OPTS` no longer change the lines of context: `diffText(rev, { context: 0 })` gives the changed lines alone. `GitVerb.env` values may be `undefined`, which removes the variable from the child's environment, as command-seam's `env` does. The docs now list every git setting that still changes the patch text (`diff.algorithm`, `diff.indentHeuristic`, `diff.renames` without `findRenames`, `diff.renameLimit`, `diff.ignoreSubmodules`, `core.quotePath`, `diff.orderFile`, `diff.suppressBlankEmpty`, `core.abbrev`, a funcname driver and binary attributes), say that `findRenames` also overrides `diff.renames=copies`, and say that `context` does not change `diffAddedFile`'s text. A bad `context`, `depth` or `jobs` of `NaN` or `Infinity` now names that value in the `TypeError`, not `null`.
