---
'@osdlc/repo-cleaner': minor
---

A branch landed by rebase merge, cherry-pick or squash merge now counts as landed, with no pull request data.

- A third landing signal, patch equivalence, runs when a PR at the exact tip and ancestry both fail. It compares by `git cherry` patch id: commit by commit (`per-commit`), the branch squashed into one change (`squashed`), and, for a branch that moved on after a merged PR's head, that head squashed plus each later commit (`head-moved`). It applies to local branches, remote branches and worktrees, and gives the same verdict as ancestry.
- The row records `facts.landing = 'patch-equivalent'` and `facts.landing_check`. A branch that is only partly on the default branch lists the commits that are not in `facts.unmatched_commits` and in the investigation text.
- It fails closed. A failing git call, unreadable output, a shallow clone, a missing merge base, an empty change, a merge commit with changes of its own, or any commit not on the default branch means the branch is not counted as landed.
- The squashed check writes one unreferenced commit object and no ref, and needs no git identity.
- New exports: `assessLanding`, `patchEquivalent`, `Landing`, `LandingCheck`. Uses `cherry` and `commitTree` from `@osdlc/typed-git`.
