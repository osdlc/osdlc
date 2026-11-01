---
"@osdlc/repo-cleaner": minor
---

A full sweep no longer holds back the branch of a worktree it can remove. When a worktree is `safe-to-delete`, its branch is judged on its own and can be deleted in the same run: `apply` removes the worktree, then deletes the branch. Before, the branch stayed `keep` ("checked out in a worktree") until the next run. The branch row records the worktree in `facts.worktree`, and `apply` skips the branch as `not-deletable` unless the same run removes that worktree. This also fixes `--branch`, which could plan a branch delete while skipping its worktree; that delete then failed with "refused: checked out".
