---
type: decision
schema_version: '2'
id: D-0002
title: Restack a whole stack in one run, opt-in
state: open/accepted
created: '2026-11-09'
last_reviewed: '2026-11-09'
tags:
  - pr-update
  - stacks
  - rebase
---
# Restack a whole stack in one run, opt-in

## Summary

`update --restack` updates a stack of PRs in one run, parent first. A PR
that is `blocked` only because its parent is behind is updated right after
that parent, onto the head the parent just got. A rebase replays only the
PR's own commits, with `rebase --onto <parent's new head> <parent's old
head>`. It is opt-in: without the flag, a blocked child waits for the next
run, as before.

^summary

## Context

- **A stack took one run per level.** The survey judges every PR against
  the heads it saw at the start. A child of a PR that is behind is
  `blocked`, and `update` skipped it, because its base was about to move.
  After the parent moved, a second run was needed for the child, a third for
  its child, and so on. Raised in osdlc/osdlc#753 by a host that updates
  stacks parent first in one pass and could not use the engine for that.
- **A child of a rebased parent was rebased with a plain `git rebase
  <remote>/<base>`.** The child's history still holds its parent's old
  commits. git drops those only when they are patch-identical to the
  parent's new ones, which they are not after a conflict resolution or a
  repair edited them. They were replayed, and conflicted with their own new
  versions.
- **A rehearsal pushes nothing**, so `<remote>/<base>` never moves in one.
  The executor did not record the commit it built either, so nothing could
  be built on it.

D-0001 holds that updating a child before its parent is wasted work. That
stays true. A restack run updates the child after the parent has moved, so
the work is not redone.

## Decision

1. **`restack` (`--restack`) is an `update` input, off by default.**
   - With it, `selectTargets` makes a `blocked` row a target when its direct
     parent is a target, marked with `stackParent`. Rows come parent first,
     so a whole chain qualifies level by level.
   - A blocked row whose parent is not a target (a guard skipped it, it is
     unmeasured, or it is out of scope) stays skipped, and the reason names
     the parent.
2. **Each child is decided after its parent ran.** `updateAll` takes a
   `prepare` hook. `restackTarget` reads the parent's outcome:
   - `updated` and pushed, or built in a rehearsal: the child runs with
     `onto: { parent, oid, upstream }`, where `oid` is the parent's new head
     and `upstream` its head before the run. The child's `baseOid` becomes
     `oid`, so the failed-attempt key is the new base.
   - `up-to-date`: the parent did not move, so the child runs as surveyed.
   - `conflict`, `failed`, or built but not pushed in a run that writes
     (a declined `--confirm-push`): the child is skipped with that reason,
     and so is every level above it.
3. **The executor integrates from `onto.oid` when set**, not from
   `<remote>/<base>`. A rebase runs `rebase --onto <oid> <upstream>`.
   typed-git's `rebase` gains an `upstream` option for this. A merge merges
   `oid`. Every `updated` outcome records `builtOid`, pushed or not.
4. **A scoped restack run takes the stack ancestors of what it names.**
   `--branch top-of-stack --restack` updates the whole stack under that
   branch. PRs above the named ones are not touched.
5. **The report says what happened.** A restacked result carries
   `restackedOnto` (the parent's number), and the text adds
   `(restacked onto owner/name#N)`.

## Why

- **One run for a stack** is what a host updating stacks needs, and what
  `gt restack` and `git town sync` do.
- **`rebase --onto` the parent's old head** is the only rebase that is right
  when the parent's commits changed. It needs the old head, which the run
  has: the parent's `headOid` from the survey.
- **Pushed parents only, when writing.** A child pushed onto a head its
  parent's PR does not have would show the parent's new commits in the
  child's diff. In a rehearsal there is nothing to show, so building on the
  parent's unpushed result is exactly the preview wanted.
- **Opt-in** because it changes how many branches one run rewrites, and
  `--branch` takes on ancestors it did not before. A caller asks for that.

## Options considered

### Re-survey after each level vs decide from the parent's outcome

Re-surveying (fetch, list, `merge-tree`) after each level would reuse the
survey's logic, but costs one survey per level and cannot see a
rehearsal's unpushed commit. Deciding from the parent's outcome costs
nothing and covers rehearsals. Chosen.

### Default on vs opt-in

On by default would make a bare run rewrite whole stacks where it used to
rewrite one level. Opt-in was chosen. It can become the default once it has
run on real stacks.

### `--fork-point` for the multi-run path

`git rebase --fork-point` could find a rebased parent's old head from the
remote-tracking ref's reflog, which would fix the replay in the one-level-
per-run path too. It depends on this clone's reflog having seen the old
head, which a fresh clone or CI checkout has not. Not adopted. A host that
updates stacks should use `--restack`.

## Consequences

- `UpdateTarget` gains `stackParent` and `onto`. `updateAll` gains
  `prepare`. `selectTargets` gains a fourth `options` argument.
  `UpdateOutcome`'s `updated` arm gains `builtOid`.
- typed-git's `RebaseOptions` gains `upstream`.
- Without `--restack`, a child of a parent rebased in an earlier run is
  still rebased with a plain `git rebase`, and can still replay its parent's
  old commits. See the `--fork-point` option above.

## Open questions

- A `restack` config key, so a project can make it the default without
  passing the flag every time.
- Whether `--restack` should become the default.
