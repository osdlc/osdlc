---
name: markdown-link
kind: crate
language: rust
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.8.1"
registry: "https://crates.io/crates/markdown-link"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-link
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-link
twin: "[markdown-link](markdown-link.md)"
tasks:
  - "[11 Link resolver](../tasks/11%20Link%20resolver.md)"
links:
  - "[osdlc/osdlc#649](https://github.com/osdlc/osdlc/pull/649)"
  - "[osdlc/osdlc#651](https://github.com/osdlc/osdlc/pull/651)"
  - "[osdlc/osdlc#728](https://github.com/osdlc/osdlc/pull/728)"
depends:
  - "[yaml-splice-rs](yaml-splice-rs.md)"
dev_depends:
  - "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
---

Finds and resolves links in notes. Its LinkIndex resolves a link target against a set of file paths.

## Notes

- The same open PRs change it: osdlc/osdlc#649, #651 and #728.
- Open release PR osdlc/osdlc#730 would bump it to 0.8.2.
