---
"@osdlc/repo-cleaner": minor
---

A clean worktree merged into the default branch by ancestry alone is now `safe-to-delete` when its branch shows it was worked on: its reflog records a commit, cherry-pick, `am`, or a merge or pull that made a merge commit, or it tracks a branch on a remote other than the default branch. The sign is in the new `facts.branch_used` (`commits`, `upstream` or `null`). A worktree that looks freshly made from the default branch stays `needs-investigation`, as before. (#582)

A plan now records, per repository, whether its sweep fetched (`fetch`, default `false` for older plans), and `applyPlan` fetches before its re-check when it did, so the re-check judges against the same current default branch. `ApplyOptions.fetch` overrides it. A failed fetch fails the run before any step. (#584)

New `ApplyOptions.keep` and `apply --keep remote_branch:<remote>/<branch>`: keep a remote branch while its other rows are applied, and refuse the run if its tip moved. The re-check throws the new `ApplyRefused` when a kept branch is gone or moved since the plan, and a `verify-remote` step, run before any delete, checks the tip again with `ls-remote`. Only the tip is compared, so PR facts that changed do not refuse it, and another clone of the same remote drops its row for the kept branch with the new reason `kept`. The receipt's step `action` gains `verify-remote`, and `dropped[].reason` gains `kept`. (#583)
