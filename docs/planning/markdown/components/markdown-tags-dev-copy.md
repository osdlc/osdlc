---
name: "@osdlc/markdown-tags (dev copy)"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present]
status: retiring
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-tags
links:
  - "[osdlc/osdlc#714](https://github.com/osdlc/osdlc/pull/714)"
depends_going:
  - "[markdown-link](markdown-link.md)"
---

A private copy of markdown-tags that the dev repo had, at version 0.1.0. It is gone: sksizer/dev
commit 41bebf68 (2026-11-13) removed it, and its users take @osdlc/markdown-tags ^0.4.3 from npm.

## Notes

- Its users were markdown-vault, markdown-render, markdown-editor and determined's notes
  experience.
- The plan does not mention this copy. It says markdown-tags moved into osdlc in osdlc/osdlc#714. It
  is shown as going away because it is an @osdlc package living in dev (problem F11) and the target
  has none.
