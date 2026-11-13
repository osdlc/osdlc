---
name: "@osdlc/markdown-vault-astro"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: published
version: "0.8.0"
registry: "https://www.npmjs.com/package/@osdlc/markdown-vault-astro"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-vault-astro
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-vault-astro
tasks:
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
links:
  - "[osdlc/osdlc#719](https://github.com/osdlc/osdlc/pull/719)"
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
depends:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-link](markdown-link.md)"
  - "[markdown-render](markdown-render.md)"
depends_new:
  - "[markdown-corpus](markdown-corpus.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: Task 13 switches it to the shared corpus model.
---

Brings an Obsidian vault into Astro content collections: rewrites embeds, copies assets and resolves
wikilinks at build time.

## Notes

- Renamed from @osdlc/markdown-astro. First release 0.8.0 on npm, from osdlc/osdlc
  (osdlc/osdlc#720; #719 merged into its branch). It ships a markdown-vault-astro command.
- It also depends on @osdlc/cli-tool, a general library with no record here.
- sksizer/dev still has its own private copy at packages/ts/markdown-astro. Nothing moves out of
  dev yet (decision D19).
- Problem F1: it resolves links its own way (resolveRef takes the first match and finds embeds by
  file name). Task 13 switches it to the shared model and resolver.
