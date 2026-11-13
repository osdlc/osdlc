---
name: markdown-contract
kind: crate
language: rust
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.4.3"
registry: "https://crates.io/crates/markdown-contract"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-contract
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-contract
twin: "[markdown-contract](markdown-contract.md)"
tasks:
  - "[56 Contract spec](../tasks/56%20Contract%20spec.md)"
depends:
  - "[markdown-link-rs](markdown-link-rs.md)"
edge_notes:
  - edge: depends
    to: "[markdown-link-rs](markdown-link-rs.md)"
    note: "It uses markdown-link's fence lexer."
---

The Rust twin of @osdlc/markdown-contract.

## Notes

- Release PR osdlc/osdlc#730 took it to 0.4.3.
