---
name: "@osdlc/markdown-render"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-render
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-render
tasks:
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
links:
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
depends:
  - "[gfm-table](gfm-table.md)"
depends_new:
  - "[markdown-link](markdown-link.md)"
  - "[markdown-tags](markdown-tags.md)"
depends_going:
  - "[markdown-link-dev-copy](markdown-link-dev-copy.md)"
  - "[markdown-tags-dev-copy](markdown-tags-dev-copy.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-link](markdown-link.md)"
    note: "As on the osdlc/osdlc#720 branch."
  - edge: depends_new
    to: "[markdown-tags](markdown-tags.md)"
    note: "As on the osdlc/osdlc#720 branch."
---

Turns Markdown, including Obsidian's wikilinks, embeds, callouts and tags, into HTML, with Vue 3
components.

## Notes

- Private in dev at 0.5.0; not on npm.
- Near target: draft osdlc/osdlc#720 moves it to osdlc for a first release at 0.8.0, and finds links
  with @osdlc/markdown-link.
- On that branch it reads the markdown-tags conformance cases.
