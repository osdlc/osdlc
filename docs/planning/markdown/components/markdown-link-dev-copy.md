---
name: "@osdlc/markdown-link (dev copy)"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present]
status: retiring
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-link
tasks:
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
---

A private copy of markdown-link that the dev repo had, at version 0.1.0. It is gone: sksizer/dev
commit 48b62783 (2026-11-08) removed it, and its users take @osdlc/markdown-link ^0.8.1 from npm.

## Notes

- Its users were markdown-vault, vault-graph-core, markdown-astro, markdown-render, sdlc
  (solutions/ontological) and parts of determined.
- Problem F11. The record stays so that links to it still resolve. dev task T-1NC5 tracked the
  move and is still marked in-progress/blocked.
