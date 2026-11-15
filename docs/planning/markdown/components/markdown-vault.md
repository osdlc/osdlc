---
name: "@osdlc/markdown-vault"
kind: package
language: ts
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present]
status: retiring
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/markdown-vault
tasks:
  - "[12 One TS model](../tasks/12%20One%20TS%20model.md)"
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
depends_going:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-tags-dev-copy](markdown-tags-dev-copy.md)"
  - "[markdown-link](markdown-link.md)"
---

Reads an Obsidian-style vault from disk: each note's frontmatter, tags, links, embeds and backlinks.
It has its own link-resolving rule.

## Notes

- Version 0.2.2 in dev; not on npm.
- Problems F1 and F4: it resolves links its own way, and says vault instead of corpus.
- Task 12 merges it with vault-graph-core into the TypeScript markdown-corpus.
- It stays in sksizer/dev for now (decision D19). Whether task 12 still retires it is not decided.
