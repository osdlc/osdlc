---
"@osdlc/host-cleaner": minor
---

A new package: machine cleanup over `@osdlc/repo-cleaner`. `hostSweep` runs repo-cleaner's sweep with the detected adapters' `annotate` chained in and gathers the adapters' own rows; `hostPlan`, `hostCheck` and `hostRun` carry both kinds of row through one plan, one re-check and one receipt, with fingerprints compared by repo-cleaner's rule. `--adapter` and `--no-adapter` select adapters by name. An adapter may also take over a worktree's removal. This release has the library and the adapter contract, no adapter and no command line.
