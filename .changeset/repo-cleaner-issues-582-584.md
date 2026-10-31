---
"@osdlc/repo-cleaner": minor
---

A clean worktree merged into the default branch by ancestry alone is now `safe-to-delete` when its branch shows it was worked on: its reflog records a commit, merge, pull, rebase, cherry-pick or `am`, or it tracks an upstream of its own. The sign is in the new `facts.branch_used` (`commits`, `upstream` or `null`). A worktree that looks freshly made from the default branch stays `needs-investigation`, as before. (#582)

A plan now records, per repository, whether its sweep fetched (`fetch`, default `false` for older plans), and `applyPlan` fetches before its re-check when it did, so the re-check judges against the same current default branch. `ApplyOptions.fetch` overrides it. A failed fetch fails the run before any step. (#584)

New `ApplyOptions.keep` and `apply --keep remote_branch:<remote>/<branch>`: keep a remote branch while its other rows are applied, and refuse the run if its tip moved. The re-check throws the new `ApplyRefused` when a kept branch is gone or moved since the plan, and a `verify-remote` step, run before any delete, checks the tip again with `ls-remote`. The receipt's step `action` gains `verify-remote`. (#583)
