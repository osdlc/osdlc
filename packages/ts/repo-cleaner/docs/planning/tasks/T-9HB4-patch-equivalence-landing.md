---
id: T-9HB4
type: task
state: done
created: 2026-10-07
---

# T-9HB4: Detect squash- and rebase-merged branches by patch equivalence

## Goal

A squash-merged branch only counts as landed today when its tip equals the merged PR's head.
When the branch moved after the merge, or has no PR, it falls to needs-investigation even
though its changes are on the default branch. Patch equivalence settles these cases from git
alone.

## Today

`classifyLocalBranch` in `packages/ts/repo-cleaner/branches.ts` and `classifyWorktree` in
`worktrees.ts` use two signals: a merged PR whose `headOid` equals the tip
(`prCapturesTip`, evidence `exact-head`), and ancestry of the landed ref. A merged PR at another
head records the gap `head-moved` and does not count. A rebase-merged or cherry-picked branch
fails ancestry too.

`@osdlc/typed-git` has no `cherry`, `commit-tree` or `merge-base` with fork-point verbs in its
verb table.

## Proposed

A third landing signal, `patch-equivalent`, checked when the first two fail:

- Per commit: `git cherry <landed> <tip>` lists every commit with `-`. This covers rebase
  merges and cherry-picks.
- Squashed: build a commit with the tip's tree on the merge base, using `git commit-tree`
  without writing a ref, then run `git cherry <landed> <that commit>`. A `-` means one commit
  on the landed ref carries the same combined change. This covers squash merges.
- Head moved: for a merged PR at head `X` and a tip past `X`, the branch counts as landed when
  `X` passes the squashed check and every commit in `X..tip` is patch-equivalent on the landed
  ref.

The row records `facts.landing = 'patch-equivalent'` and which check passed. The signal feeds
the same verdicts as ancestry.

## Approach

1. Add `cherry` and `commitTree` verbs to `@osdlc/typed-git`, with the exit codes that mean
   absence declared.
2. Add `patchEquivalent(repo, tip, git)` in a new `landing.ts`, returning which check passed or
   null.
3. Call it from branch and worktree classification after the existing two signals fail.
4. Fold the head-moved case into the same helper.
5. Document the signal in the README's "How it decides" table.

## Areas

Paths under `packages/ts/repo-cleaner` are relative to the repository that holds that package when
the work lands, and paths under `packages/ts/typed-git` are in `osdlc/osdlc`. Repo-cleaner is in
`sksizer/dev` until
[T-HC0M](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-HC0M-move-repo-cleaner-to-osdlc.md) moves it, `osdlc/osdlc` after.

| Area | Note |
|---|---|
| `packages/ts/repo-cleaner/landing.ts` | New helper |
| `packages/ts/repo-cleaner/branches.ts`, `worktrees.ts` | Call sites |
| `packages/ts/typed-git/verbs.ts` | `cherry`, `commit-tree` verbs |
| `packages/ts/repo-cleaner/tests/` | Real-git fixtures for each merge style |

## Acceptance criteria

- [x] AC-1: A three-commit branch squash-merged into `main` classifies as safe-to-delete with
      no PR data (`--no-gh`), `facts.landing = 'patch-equivalent'`.
- [x] AC-2: A rebase-merged branch classifies as safe-to-delete with no PR data.
- [x] AC-3: A branch squash-merged at head `X`, then given one more commit that was
      cherry-picked to `main`, classifies as safe-to-delete.
- [x] AC-4: The same branch with one extra commit not on `main` stays needs-investigation and
      names that commit.
- [x] AC-5: The squashed check writes no ref and leaves `git status` unchanged.
- [x] AC-6: Existing exact-head and ancestry tests pass unchanged.

## Out of scope

- Detecting a squash merge that was edited during conflict resolution. Patch ids differ, so it
  stays needs-investigation.
- Changes to sdlc's task-linkage overlay.

## Dependencies

- none

## Discovery context

Found during manual cleanup: many squash-merged agent branches stayed at needs-investigation
because their tips moved after merge. Related to [T-N29T](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-N29T-session-cleanup-as-op.md), which
settles squash merges only through exact-head PR evidence.

## Outcome

Shipped in osdlc/osdlc [#501](https://github.com/osdlc/osdlc/pull/501), first published in `@osdlc/repo-cleaner` 0.9.0. At [#501](https://github.com/osdlc/osdlc/pull/501), `tests/landing.test.ts` covered each AC: a squash merge of three commits, a rebase merge, a squash at the PR head plus a cherry-picked commit, an extra commit not on main, and no ref written. The decision it served, [D-L7N5](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-L7N5-host-cleaner.md), moved to osdlc.

This task was written in sksizer/dev, when repo-cleaner still lived there, and moved here with its id. Its paths are from then: the package's sources are now under `src/`. Its history is in [the dev copy](https://github.com/sksizer/dev/blob/27fe89ef0557a1e3adcd1120ecb5a052944ebda4/docs/planning/tasks/T-9HB4-repo-cleaner-patch-equivalence-landing.md).
