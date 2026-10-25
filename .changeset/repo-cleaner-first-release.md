---
'@osdlc/repo-cleaner': minor
---

The first release of `@osdlc/repo-cleaner` on npm. It finds what has been merged into the default branch and can go away: local branches, worktrees and remote branches, across one repository or many.

- `sweepRepo` and `sweepRepos` classify each item `safe-to-delete`, `safe-to-keep` or `needs-investigation`, with the evidence behind the verdict and the command that would act on it. A merged pull request whose head is the branch tip, or a tip reachable from `<remote>/<default>`, settles most items. A sweep deletes nothing.
- `planRepo`, `writePlan`, `readPlan` and `applyPlan` write the deletable rows as a plan and apply the ones a person approves. Each delete is compare-and-swap on the judged sha, each step is verified, the first failure stops the run and a receipt records every step. Rows that need `abandon-unmerged`, `discard-changes` or `confirm-open-pr` are dropped without that grant.
- The `repo-cleaner` command sweeps the repository you are in, or a path, or the repositories in `<config-home>/repo-cleaner/config.yaml` with `--all`. `repo-cleaner apply` applies a plan. The directories are named `repo-cleaner`, moved by the `REPO_CLEANER_*` environment variables.
- ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. `git` is required; `gh` is optional and `--no-gh` skips it. Licence `MIT OR Apache-2.0`.

The `FLEET_ROOT`, `FLEET_*` and `FLEET_MACHINE_CONFIG` variables are no longer read; there is no fallback, and the replacements are `REPO_CLEANER_ROOT`, `REPO_CLEANER_*` and `REPO_CLEANER_MACHINE_CONFIG`. The config directory paths themselves do not change.
