---
name: "@sksizer/markdown-ui"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-ui
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
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
- Task 17 moves it to osdlc. There is no PR yet, and the plan does not say whether its @sksizer
  scope changes.
