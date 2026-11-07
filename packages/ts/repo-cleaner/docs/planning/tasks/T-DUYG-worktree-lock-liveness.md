---
id: T-DUYG
type: task
state: done
created: 2026-10-07
---

# T-DUYG: A worktree lock held by a dead process no longer blocks removal

## Goal

A crashed or finished coding agent leaves its worktree locked. The sweep treats every lock as a
blocker, so these worktrees never become removable and pile up. A lock whose owner is dead should
not block. A worktree that a live process is working in should block, lock or not.
[D-L7N5](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-L7N5-host-cleaner.md) places this
check in the engine.

## Today

`readBlockers` in `packages/ts/repo-cleaner/worktrees.ts` adds `locked-worktree` for any lock,
whatever its reason. The worktree is then `needs-investigation` and not deletable. Claude Code
subagent worktrees carry a lock reason of the form
`claude agent agent-<id> (pid N start ...)`. When that process exits, the lock stays.

Nothing in the sweep looks at running processes. A worktree with a live agent in it and no
lock looks the same as an abandoned one.

`applyPlan` removes a worktree with `git worktree remove`, which refuses a locked worktree.

## Proposed

- A `ProcessProbe` port in repo-cleaner with two calls: `alive(pid, startedAt?)` and
  `holders(path)`, which lists processes whose cwd is inside `path` with their command name.
- A default probe over `ps` and `lsof`, run through `@osdlc/command-seam`. A test or host can
  inject its own through the sweep and apply options.
- A lock reason with a `pid <N>` token is read as an owner claim. An optional start time after
  it guards against pid reuse. The engine parses no other part of the reason.
- A lock whose owner is dead becomes `facts.stale_lock` and is not a blocker. A lock with no pid
  token, or a live owner, stays a blocker.
- A new blocker, `live-process`, for any holder that is not an interactive shell. Shells
  (`sh`, `bash`, `zsh`, `fish`) are listed in `facts.idle_shells` and do not block.
- Apply unlocks a stale-locked worktree before removing it. It checks the owner is still dead
  just before the unlock, and records the unlock in the receipt.

## Approach

1. Add `processes.ts` with the `ProcessProbe` type, the default implementation and the
   lock-reason parser. Export them from `index.ts`.
2. Thread an optional `probe` through `SweepOptions`, `gatherWorktrees`, `classifyWorktree` and
   `ApplyOptions`.
3. Change `readBlockers` to consult the probe for the lock owner and for holders.
4. Add `worktreeUnlock` to `@osdlc/typed-git` if it is missing. Add an `unlock-worktree` step
   kind in apply, placed before the row's `remove-worktree` step.
5. Add `stale_lock` to the worktree fingerprint so a lock taken between plan and apply drops
   the row.
6. Update the README's blocker table and the CHANGELOG.

## Areas

Paths under `packages/ts/repo-cleaner` are relative to the repository that holds that package when
the work lands, and paths under `packages/ts/typed-git` are in `osdlc/osdlc`. Repo-cleaner is in
`sksizer/dev` until
[T-HC0M](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-HC0M-move-repo-cleaner-to-osdlc.md) moves it, `osdlc/osdlc` after.

| Area | Note |
|---|---|
| `packages/ts/repo-cleaner/processes.ts` | New probe port and default implementation |
| `packages/ts/repo-cleaner/worktrees.ts` | Blocker logic |
| `packages/ts/repo-cleaner/apply.ts`, `receipt.ts`, `plan.ts` | Unlock step, fingerprint |
| `packages/ts/typed-git/verbs.ts` | `worktree unlock` verb if missing |
| `packages/ts/repo-cleaner/tests/` | Probe fakes and fixtures |

## Acceptance criteria

- [x] AC-1: A worktree locked with reason `claude agent agent-x (pid 99999 start 2026-01-01)`
      where pid 99999 is dead (fake probe) classifies as safe-to-delete when otherwise clean and
      landed, with `facts.stale_lock` set.
- [x] AC-2: The same lock with a live pid stays blocked with `locked-worktree`.
- [x] AC-3: A lock with a free-form reason and no `pid` token stays blocked.
- [x] AC-4: A live pid whose start time differs from the lock's start time counts as dead.
- [x] AC-5: A clean, landed, unlocked worktree with a live non-shell holder is blocked with
      `live-process`. With only a shell holder it is not blocked and `facts.idle_shells` lists
      the shell.
- [x] AC-6: Apply on a stale-locked row unlocks, removes and verifies. If the owner is alive at
      apply time, the row is dropped and nothing is touched.
- [x] AC-7: No new raw `child_process` call; `ps` and `lsof` run through the command seam.

## Out of scope

- Parsing any tool-specific lock format beyond the `pid <N>` token.
- Stale `index.lock` or other git lock files. They stay blockers.
- Killing any process.

## Dependencies

- none

## Discovery context

Found during a manual cleanup of 126 agent worktrees, most held by locks from exited Claude Code
subagents. Builds on the blocker list from [T-96DZ](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-96DZ-cleanup-worktree-blockers.md).

## Outcome

Shipped in osdlc/osdlc [#499](https://github.com/osdlc/osdlc/pull/499), first published in `@osdlc/repo-cleaner` 0.5.2, after the package moved. Each AC has a named test in osdlc's `packages/ts/repo-cleaner/tests/liveness.test.ts` (AC-1 to AC-7). The decision it served, [D-L7N5](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-L7N5-host-cleaner.md), moved to osdlc.

This task was written in sksizer/dev, when repo-cleaner still lived there, and moved here with its id. Its history is in [the dev copy](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-DUYG-repo-cleaner-worktree-lock-liveness.md).
