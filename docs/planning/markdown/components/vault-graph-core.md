---
name: "@sdlc/vault-graph-core"
kind: package
language: ts
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present]
status: retiring
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/vault-graph-core
tasks:
  - "[11 Link resolver](../tasks/11%20Link%20resolver.md)"
  - "[12 One TS model](../tasks/12%20One%20TS%20model.md)"
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
depends_going:
  - "[markdown-link-dev-copy](markdown-link-dev-copy.md)"
  - "[markdown-vault](markdown-vault.md)"
---

Builds a graph of notes and links from note data, with no file access. Its link resolver is a copy
of the Rust one.

## Notes

- Version 0.1.1 in dev; not on npm. Its scope is @sdlc, not @osdlc (problem F11).
- Task 12 merges it with markdown-vault into the TypeScript markdown-corpus. Task 11 takes the
  TypeScript resolver from its copy of the Rust one.
- It stays in sksizer/dev for now (decision D19). Whether task 12 still retires it is not decided.
