---
name: yaml-splice
kind: crate
language: rust
layer: "[formats](../layers/formats.md)"
states: [present, target]
status: published
version: "0.3.4"
registry: "https://crates.io/crates/yaml-splice"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/yaml-splice
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/yaml-splice
---

Sets, removes and renames top-level YAML fields while every other byte stays as it was.

## Notes

- A general library, not one the plan owns, like its TypeScript binding, which config-layers
  depends on ([D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md)).
- Release PR osdlc/osdlc#730 took it to 0.3.4.
