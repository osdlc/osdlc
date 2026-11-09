---
'@osdlc/pr-update': minor
---

Keep the failed-attempt record and a per-branch update lease on refs at the remote. `attempts.store: git-ref` (default `file`, so nothing changes) stores one ref per repo, head and base branch under `attempts.ref_prefix` (default `refs/pr-update/`), written by compare-and-swap with `@osdlc/ref-lease` so concurrent runs keep each other's failures, and takes a lease `refs/pr-update/lock/<branch>` around each PR's update (`lease.ttl_seconds`); a PR another run is updating is skipped. New exports `refAttemptStore`, `refBranchLease` and `Ports.lease`. Records are now written as each PR finishes instead of after the whole batch, so a run killed by a timeout keeps them. The repair agents now run without `GH_TOKEN`/`GITHUB_TOKEN` in their environment, and `claude` loads no project settings, hooks or MCP servers from the PR's worktree.
