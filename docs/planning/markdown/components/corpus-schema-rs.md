---
name: Rust corpus-schema validator
kind: crate
language: rust
layer: "[spec](../layers/spec.md)"
states: [target]
status: planned
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/corpus-schema
twin: "[corpus-schema-ts](corpus-schema-ts.md)"
tasks:
  - "[32 Rust validator](../tasks/32%20Rust%20validator.md)"
depends_new:
  - "[markdown-corpus-rs](markdown-corpus-rs.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: twin
    to: "[corpus-schema-ts](corpus-schema-ts.md)"
    note: "Planned: the Rust validator runs the same conformance cases (task 32)."
  - edge: depends_new
    to: "[markdown-corpus-rs](markdown-corpus-rs.md)"
    note: "Task 32: built on the markdown-corpus crate."
---

A planned Rust validator that runs the same conformance cases as the TypeScript one, built on the
markdown-corpus crate.

## Notes

- The plan names no crate. It would live in osdlc/osdlc (decision D19). The path is a guess at the
  repo's layout, not from a source.
