---
id: T-DEZH
type: task
state: open
created: 2026-11-07
---

# T-DEZH: In a fork, PRs are listed for the swept remote

## Goal

The GitHub provider lists pull requests for the remote the sweep judges. PRs opened from a fork to its parent are either counted or flagged in a note; the issue leaves that choice open. Today `gh` picks `upstream` over `origin`, so a fork's branches are judged against the parent's PRs and read as having none.

## Spec

[#678](https://github.com/osdlc/osdlc/issues/678) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.
