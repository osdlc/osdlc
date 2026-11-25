---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: Checkpoints name a state

## Goal

A checkpoint stays valid only while the state it marked is still on the history, and `revertTo` fails when it is not.

## Today

A checkpoint is a count of recorded steps (see [D-06](../decisions/D-06-checkpoints-are-opaque-handles.md)).
After an undo followed by a new edit, the redo branch is dropped and the count can name a different
state. `revertTo` then succeeds and returns that state.

## Approach

- [ ] Record the state a checkpoint marks, or a token that identifies it, when `checkpoint()` runs.
- [ ] Make `revertTo` fail with `INVALID_OPERATION` when that state is no longer on the undo stack.
- [ ] Keep the handle opaque, so the representation can change without a release note.

## Acceptance criteria

- [ ] A test takes a checkpoint, undoes, edits, and gets an error from `revertTo`.
- [ ] The existing pruning and `clear` tests still pass.
