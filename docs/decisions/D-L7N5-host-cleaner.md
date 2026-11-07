# D-L7N5: Machine cleanup is a `host-cleaner` package over repo-cleaner, with optional detected adapters

Accepted 2026-10-07 in sksizer/dev. Moved here on 2026-11-07, restated for
repo-cleaner 0.18. Builds on
[D-RSWP](../../packages/ts/repo-cleaner/docs/planning/decisions/D-RSWP-standalone.md).

## Decision

- **Git and forge gaps go into repo-cleaner.** They are general facts any
  user of the sweep wants. Lock liveness
  ([#499](https://github.com/osdlc/osdlc/pull/499)) and patch equivalence
  ([#501](https://github.com/osdlc/osdlc/pull/501)) have landed; the rest are
  in the Work table.

  | Gap                       | Change                                                                                                                                           |
  | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Lock liveness             | A lock whose reason names a dead pid stops blocking; any process but an idle shell inside a worktree blocks, as does an unreadable process table |
  | Patch equivalence         | A branch whose commits, one by one or squashed, are on the landed ref counts as landed                                                           |
  | Remote-contained worktree | A clean worktree whose HEAD is on a remote branch is removable unless a PR is open                                                               |
  | Sizes                     | Worktree rows carry their disk size when asked; the report ranks by size                                                                         |
  | Archive before delete     | `clean` can push unlanded work to an archive ref, verify it, then delete                                                                         |

- **Process liveness is engine, through a probe port.** repo-cleaner reads a
  generic `pid <N>` token in a lock reason, with an optional start time
  against pid reuse, and asks a `ProcessProbe` whether a pid is alive and
  which processes work inside a path. The default probe runs `ps` and `lsof`
  through the command seam. It names no host product.
- **Machine awareness is a new package here.** `packages/ts/host-cleaner`
  (`@osdlc/host-cleaner`, binary `host-cleaner`) composes repo-cleaner. It
  ships a library and a CLI, on the same package shape as the rest of
  `packages/ts/`.
- **Each host integration is an optional adapter** behind one contract.
  Each detects itself and is skipped when absent. The first adapters, in
  run order, are `orca`, `claude-code`, `cargo` and `node`.
- **One safety model.** Host rows follow repo-cleaner's: a fingerprint
  compared with repo-cleaner's exported comparison, a re-check when the run
  starts, risks granted by name, and a verified step in the receipt.
  repo-cleaner's plan and receipt keep only their own row kinds; host-cleaner
  holds its host rows beside them in one plan file and one receipt.
- **An unattended run grants no risk.** `--auto` applies only a fixed safe
  subset; everything else stays in the report for a person.
- **Scheduling is a launchd user agent** until a general trigger service
  exists. The command it runs stays the same when that changes.
- **Every shell-out goes through the command seam**, git through
  `@osdlc/typed-git`.

### Adapter contract

```ts
interface HostAdapter {
  name: string;
  /** Cheap check: a binary on PATH, an app bundle, a config directory. */
  detect(ctx: HostContext): boolean;
  /** Re-rank repo-cleaner rows with what this host knows. Chained into `annotate`. */
  annotate?: Annotate;
  /** Rows this host owns: build artifacts, sessions. */
  gather?(ctx: HostContext): HostRow[];
  /** Run one approved step for a row this adapter owns, then verify it. Returns the detail the receipt records. */
  execute?(step: HostStep, ctx: HostContext): string;
  /** Run in place of `git worktree remove` for worktrees this host manages. repo-cleaner's checks before and after it still run. */
  removeWorktree?: RemoveWorktree;
}
```

- `--adapter` and `--no-adapter` select adapters by name. An undetected
  adapter adds nothing, and the report says it was skipped.
- Adapters' `annotate` functions chain, in run order, into repo-cleaner's
  `annotate`, so their verdicts survive every re-check.
- `removeWorktree` is a new repo-cleaner hook. Before it, `clean` checks for
  live processes and, when the remove is forced, that forcing is safe; after
  it, `clean` verifies that the directory is gone and git no longer lists the
  worktree.

### Risks and the unattended subset

| Risk               | Lives in     | Covers                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discard-archived` | repo-cleaner | Delete a row's unlanded work after a verified archive push holds it. Stands in for `abandon-unmerged` and `discard-changes`. A file the archive leaves out, such as `.env*` or a key, still needs `discard-changes`. A worktree's submodule work, which the archive does not hold, keeps its own risks. |
| `close-session`    | host-cleaner | Send SIGTERM to a coding-agent session.                                                                                                                                                                                                                                                                 |

`--auto` applies only:

- a build artifact idle for more than 24 hours, with no build running in its
  checkout;
- a worktree row that is `delete` and carries no risk.

## Why

- **The split follows D-RSWP's boundary.** repo-cleaner answers "what has
  landed and can go". The machine question is different: "what on this
  machine is using space or holding a lock".
- **Liveness belongs in the engine.** Every user of agent worktrees meets
  stale locks. Without it the standalone tool stays blocked on every crashed
  agent, and the probe names no host product.
- **A package beats putting it in a host product or in scripts.** Terminal
  apps, cargo caches and agent sessions are not any one product's concern,
  and the safety model needs tests.
- **Detection keeps each integration optional.** A machine without Orca or
  Rust gets a working tool with nothing to configure.
- **One safety model is less to trust.** A second set of rules for host rows
  would be a second thing to audit.

## Options rejected

- **A verb inside sdlc** (`sdlc host cleanup`): ties the tool to sdlc and puts
  machine knowledge in a product meant to stay general.
- **Repository scripts:** untested, and nothing in the problem is specific to
  one repository.
- **Liveness in the host layer:** leaves the standalone tool blocked on stale
  locks.

## Consequences

- repo-cleaner gains a `removeWorktree` hook, a host-named blocker that
  `annotate` can set, an exported fingerprint comparison, the
  `discard-archived` risk and an archive step, each described in its README
  and CHANGELOG.
- host-cleaner's dependencies are all released packages in this workspace,
  so the package can be built now.

## Work

Tracked in [#669](https://github.com/osdlc/osdlc/issues/669).

| Item                                      | Issue                                             |
| ----------------------------------------- | ------------------------------------------------- |
| Remote-contained worktrees                | [#659](https://github.com/osdlc/osdlc/issues/659) |
| Sizes and ranking                         | [#660](https://github.com/osdlc/osdlc/issues/660) |
| Archive before delete                     | [#661](https://github.com/osdlc/osdlc/issues/661) |
| host-cleaner package and adapter contract | [#662](https://github.com/osdlc/osdlc/issues/662) |
| Build artifacts                           | [#663](https://github.com/osdlc/osdlc/issues/663) |
| Orca adapter                              | [#664](https://github.com/osdlc/osdlc/issues/664) |
| Claude Code sessions                      | [#665](https://github.com/osdlc/osdlc/issues/665) |
| Scheduled run                             | [#666](https://github.com/osdlc/osdlc/issues/666) |

## Out of scope

- Linux and Windows schedulers.
- Clearing stale `index.lock` files. They stay blockers.

## Open questions

- Whether `--auto` may ever grant `discard-archived`, once archive pushes have
  a track record. This decision says no.
- Where archive refs go on a remote that rejects pushes to new branches. The
  archive step reports the failure and deletes nothing.
- How long archive refs live on the remote. Nothing prunes them yet.

## Reopen if

A host integration cannot fit the adapter contract, for example one that
needs to run before repo-cleaner's sweep rather than after it.
