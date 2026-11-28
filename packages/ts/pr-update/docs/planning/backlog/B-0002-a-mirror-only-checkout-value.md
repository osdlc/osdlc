---
type: backlog
schema_version: '3'
id: B-0002
tags:
  - pr-update
  - checkout
  - mirror
last_reviewed: '2026-11-22'
---
# A "mirror only" checkout value

[D-0005](../decisions/D-0005-managed-bare-mirror-checkout.md) gives the
machine key `checkout` two values. `mirror` uses the project root or a
checkout `locate` finds, and falls back to the managed clone. `local` skips a
repository with no checkout. A third value would always use the managed
clone, even when a checkout exists.

What it adds:

- The same behaviour on every machine, whatever the person has cloned.
- Nothing written inside the project root's checkout. (Since D-0005's Build
  note "The ownership contract" this holds without the new value: every
  target's run worktree, the project root's included, is under the cache.)

What it costs:

- The `unpushed_local` guard turns off where it could work. With a real
  checkout, the run sees unpushed commits on a PR's head and skips that PR.
  From the clone it cannot, and a force-push can overwrite them.
- A second copy of each repository on disk.

Why not now (owner, 2026-11-22): using the checkout a person already has is
the safer default, and D-0005's standalone `locate` makes that work beyond the
project root. Revisit if someone needs a run that never writes inside the
project root's checkout.
