---
name: "@osdlc/markdown-render"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: published
version: "0.8.0"
registry: "https://www.npmjs.com/package/@osdlc/markdown-render"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-render
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-render
tasks:
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
links:
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
depends:
  - "[gfm-table](gfm-table.md)"
  - "[markdown-link](markdown-link.md)"
  - "[markdown-tags](markdown-tags.md)"
---

Turns Markdown, including Obsidian's wikilinks, embeds, callouts and tags, into HTML. It has no
framework: the Vue components are in markdown-render-vue.

## Notes

- First release 0.8.0 on npm, from osdlc/osdlc (osdlc/osdlc#720). It finds wikilinks and embeds
  with @osdlc/markdown-link's body scanner.
- The Vue components were its `./vue` entry. They are now @osdlc/markdown-render-vue.
- sksizer/dev still has its own private copy at packages/ts/markdown-render, which uses dev's
  copies of markdown-link and markdown-tags. Nothing moves out of dev yet (decision D19).
