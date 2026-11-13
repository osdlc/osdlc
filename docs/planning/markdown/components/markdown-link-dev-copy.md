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

A private copy of markdown-link in the dev repo, at version 0.1.0. Several dev packages use it
through workspace:* instead of the published 0.8.1.

## Notes

- The plan names markdown-vault, vault-graph-core and markdown-astro as its users. dev's manifests
  show more: markdown-render, sdlc (solutions/ontological) and parts of determined also use it.
- Problem F11. Task 13 moves its users off it. dev task T-1NC5 tracks the move and is marked
  in-progress/blocked.
