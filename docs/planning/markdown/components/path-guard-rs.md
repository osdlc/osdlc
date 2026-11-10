---
name: path-guard
kind: crate
language: rust
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.3.3"
registry: "https://crates.io/crates/path-guard"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/path-guard
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/path-guard
twin: "[path-guard](path-guard.md)"
---

The Rust twin of @osdlc/path-guard: the same lexical check and symlink-aware containment proof, run
against the same conformance suite. markdown-vault-fs uses it for every file it touches.

## Notes

- Open release PR osdlc/osdlc#730 would bump it to 0.3.4.
