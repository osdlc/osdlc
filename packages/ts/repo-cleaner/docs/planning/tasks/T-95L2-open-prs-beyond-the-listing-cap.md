---
id: T-95L2
type: task
state: open
created: 2026-11-07
---

# T-95L2: Open PRs older than the newest 300 are not missed

## Goal

An open pull request is found however old it is, and a listing cut short at the cap is treated as incomplete. Today a branch whose open PR is older than the newest 300 reads as having no PR, so it can be deleted, which closes the PR.

## Spec

[#677](https://github.com/osdlc/osdlc/issues/677) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.
