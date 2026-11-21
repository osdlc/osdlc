---
id: T-C665
type: task
state: done
created: 2026-10-07
---

# T-C665: A clean worktree whose HEAD is on a remote branch can be removed

## Goal

A clean, used worktree whose work a fetched remote branch already holds is `delete` unless a PR is open, so removing it loses nothing a remote does not have. Today it stays at `review`, or carries `abandon-unmerged` when no upstream is set.

## Spec

[#659](https://github.com/osdlc/osdlc/issues/659) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.

## Outcome

Shipped in [#919](https://github.com/osdlc/osdlc/pull/919). A clean worktree
whose HEAD is on a branch of a fetched remote, on a branch that was worked on,
is `delete`: the remote holds every commit. `evidence.recoverableFrom` names
the remote branches, and it is part of the fingerprint. A sweep that did not
fetch keeps the verdict and says `--fetch` would check. Since
[D-4CE9](../decisions/D-4CE9-the-cli-by-use-case.md) every remote the sweep
fetched counts, and a branch belongs to the longest remote name it starts
with (`origin/mirror` is not `origin`).
