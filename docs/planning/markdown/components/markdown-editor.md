---
name: "@osdlc/markdown-editor"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-editor
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: packages/ts/markdown-editor
tasks:
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
depends:
  - "[gfm-table](gfm-table.md)"
  - "[markdown-render](markdown-render.md)"
depends_new:
  - "[markdown-tags](markdown-tags.md)"
depends_going:
  - "[markdown-tags-dev-copy](markdown-tags-dev-copy.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-tags](markdown-tags.md)"
    note: "Assumed once it uses the published markdown-tags; there is no PR for it yet."
---

An Obsidian-style live-preview Markdown editor on CodeMirror 6, with a Vue 3 wrapper.

## Notes

- Private in dev at 0.5.1. It stays in sksizer/dev for now (decision D19). Task 17 planned
  to move it to osdlc; there was no PR for that.
