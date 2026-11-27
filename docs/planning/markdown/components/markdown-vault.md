---
name: "@osdlc/markdown-vault"
kind: package
language: ts
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present]
status: retiring
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-vault
tasks:
  - "[12 One TS model](../tasks/12%20One%20TS%20model.md)"
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
depends_going:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-tags](markdown-tags.md)"
  - "[markdown-link](markdown-link.md)"
---

Reads an Obsidian-style vault from disk: each note's frontmatter, tags, links, embeds and backlinks.
It has its own link-resolving rule.

## Notes

- Version 0.3.2 in osdlc; not on npm. Its first release is 0.4.0.
- Problems F1 and F4: it resolves links its own way, and says vault instead of corpus.
- Task 12 merges it with vault-graph-core into the TypeScript markdown-corpus.
- It moved to osdlc/osdlc from sksizer/dev on 2026-11-22, under its present name
  ([D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md),
  amended). Its first release lists the API changes made on the way. Whether task 12 still
  retires it is not decided.
