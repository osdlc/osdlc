---
name: "@sksizer/markdown-ui"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-ui
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: packages/ts/markdown-ui
tasks:
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
depends:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-editor](markdown-editor.md)"
  - "[markdown-render](markdown-render.md)"
---

Markdown viewing and editing chrome as a Nuxt layer: a surface that switches between reading, live
editing and source.

## Notes

- Private in dev at 0.6.0. It builds on @determined/ui.
- It stays in sksizer/dev for now (decision D19). Task 17 planned to move it to osdlc; there was
  no PR for that, and the plan does not say whether its @sksizer scope changes.
