---
"@osdlc/host-cleaner": minor
---

The `orca` adapter, built into the `host-cleaner` command. It adds an Orca note (id and open terminals) to each worktree `orca worktree list` reports, removes those worktrees with `orca terminal close --worktree path:<p> --all` then `orca worktree rm --worktree path:<p>` in place of `git worktree remove` (repo-cleaner's checks still run), and sweeps every git repository from `orca repo list`. With Orca unreachable, a removable worktree under `orca/workspaces/` is `blocked` with `host:orca-unreachable`. The adapter contract gains `discover(ctx)`, and `hostSweep` takes `discover` (default true). Exported as `orcaAdapter` and `createOrcaAdapter`.
