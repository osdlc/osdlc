---
name: "@osdlc/markdown-astro"
kind: package
language: ts
layer: "[render](../layers/render.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-astro
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-astro
tasks:
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
  - "[17 Render and sites](../tasks/17%20Render%20and%20sites.md)"
links:
  - "[osdlc/osdlc#719](https://github.com/osdlc/osdlc/pull/719)"
  - "[osdlc/osdlc#720](https://github.com/osdlc/osdlc/pull/720)"
depends:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-render](markdown-render.md)"
depends_new:
  - "[markdown-link](markdown-link.md)"
  - "[markdown-corpus](markdown-corpus.md)"
depends_going:
  - "[markdown-link-dev-copy](markdown-link-dev-copy.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-link](markdown-link.md)"
    note: "As on the osdlc/osdlc#720 branch."
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: Task 13 switches it to the shared corpus model.
---

Brings an Obsidian vault into Astro content collections: rewrites embeds, copies assets and resolves
wikilinks at build time.

## Notes

- Version 0.1.0 in dev; not on npm.
- osdlc/osdlc#719 moved it, but it merged into the branch of draft #720, not into main. The
  architecture still calls #719 open.
- Problem F1: it resolves links its own way (resolveRef takes the first match and finds embeds by
  file name). Task 13 switches it to the shared model and resolver.
