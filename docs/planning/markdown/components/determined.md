---
name: determined
kind: app
language: ts
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: solutions/determined
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: solutions/determined
tasks:
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
depends:
  - "[markdown-render](markdown-render.md)"
  - "[markdown-ui](markdown-ui.md)"
  - "[markdown-editor](markdown-editor.md)"
  - "[markdown-astro](markdown-astro.md)"
  - "[markdown-vault-query](markdown-vault-query.md)"
  - "[gfm-table](gfm-table.md)"
  - "[etag-write](etag-write.md)"
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[path-guard](path-guard.md)"
  - "[markdown-contract](markdown-contract.md)"
  - "[markdown-link](markdown-link.md)"
depends_new:
  - "[markdown-reshape-rs](markdown-reshape-rs.md)"
  - "[markdown-corpus](markdown-corpus.md)"
  - "[markdown-tags](markdown-tags.md)"
depends_going:
  - "[markdown-relink](markdown-relink.md)"
  - "[markdown-vault](markdown-vault.md)"
  - "[vault-graph-core](vault-graph-core.md)"
  - "[markdown-tags-dev-copy](markdown-tags-dev-copy.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-reshape-rs](markdown-reshape-rs.md)"
    note: Through its Rust backend. Task 39 switches it from markdown-relink.
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: Task 13 switches its vault-graph app and graph and notes experiences.
  - edge: depends_new
    to: "[markdown-tags](markdown-tags.md)"
    note: Its private copies go away in the target.
---

The plan calls it a notes app. In dev it is many small apps and experiences over a user's vault,
such as notes, graph, search and sites.

## Notes

- Uses the dev render, edit and corpus packages through workspace:*, plus osdlc note parts from npm,
  markdown-link and markdown-contract among them.
- Task 13 switches its vault-graph app and its graph and notes experiences to the shared model and
  resolver.
