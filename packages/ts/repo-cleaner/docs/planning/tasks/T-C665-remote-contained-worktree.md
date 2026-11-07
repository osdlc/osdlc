---
id: T-C665
type: task
state: open
created: 2026-10-07
---

# T-C665: A clean worktree whose HEAD is on a remote branch can be removed

## Goal

A clean worktree whose work a fetched remote branch already holds is `delete`, so removing it loses nothing a remote does not have. Today it stays at `review`, or carries `abandon-unmerged` when no upstream is set.

## Spec

[#659](https://github.com/osdlc/osdlc/issues/659) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.
