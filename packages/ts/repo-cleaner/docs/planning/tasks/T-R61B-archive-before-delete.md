---
id: T-R61B
type: task
state: open
created: 2026-10-07
---

# T-R61B: Archive unlanded work to the remote before clean deletes it

## Goal

`clean --archive` pushes unlanded commits and uncommitted files to an archive branch, checks it, then deletes. Today the only choices are to keep the row or to allow the work to be lost.

## Spec

[#661](https://github.com/osdlc/osdlc/issues/661) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.
