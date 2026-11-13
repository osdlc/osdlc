---
name: "@osdlc/markdown-render-vue"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: published
version: "0.8.0"
registry: "https://www.npmjs.com/package/@osdlc/markdown-render-vue"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-render-vue
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-render-vue
tasks:
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
links:
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
  - "[osdlc/osdlc#781](https://github.com/osdlc/osdlc/pull/781)"
depends:
  - "[gfm-table](gfm-table.md)"
  - "[markdown-render](markdown-render.md)"
---

Vue 3 components over markdown-render's output: a MarkdownRender component that walks the HTML
tree into VNodes, never v-html, with built-in parts for wikilinks, tags, embeds, callouts, math,
diagrams, code and tables.

## Notes

- It was markdown-render's `./vue` entry. First release 0.8.0 on npm, from osdlc/osdlc
  (osdlc/osdlc#720).
- Its package.json is at 0.8.1 after osdlc/osdlc#781, but npm's latest is still 0.8.0.
- vue ^3.5 is its only peer. The host injects a NoteSource that resolves links and loads embeds.
