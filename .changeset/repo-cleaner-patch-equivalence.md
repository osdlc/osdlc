---
'@osdlc/repo-cleaner': minor
---

A branch landed by rebase merge, cherry-pick or squash merge is now recognised without pull request data, and needs no grant when the content check agrees.

- A third landing signal, patch equivalence, runs when a PR at the exact tip and ancestry both fail. It compares by `git cherry` patch id: commit by commit (`per-commit`), the branch squashed into one change (`squashed`), and, for a branch that moved on after a merged PR's head, that head squashed plus each later commit (`head-moved`). It applies to local branches, remote branches and worktrees.
- A patch id is a heuristic, so a match alone still requires the `abandon-unmerged` authorization. A second check, `git merge-tree --write-tree` of the default branch and the tip (git 2.38 or later), must give the default branch's own tree to drop it; the outcome is in `facts.landing_content_confirmed` and the row's reason.
- The row records `facts.landing = 'patch-equivalent'` and `facts.landing_check`. A branch that is only partly on the default branch lists the commits that are not in `facts.unmatched_commits` and in the investigation text.
- It fails closed. A failing git call, unreadable output, a shallow clone, a missing merge base, an empty change, a merge commit in the range (for the commit-by-commit check), or any commit not on the default branch means the branch is not counted as landed.
- The squashed check writes one unreferenced commit object and no ref, needs no git identity, and ignores `git replace` refs.
- New exports: `assessLanding`, `patchEquivalent`, `Landing`, `LandingCheck`. Uses `cherry`, `commitTree` and `mergeTree` from `@osdlc/typed-git`.
