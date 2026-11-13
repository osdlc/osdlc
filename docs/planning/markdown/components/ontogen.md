---
name: ontogen
kind: crate
language: rust
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: published
version: "0.11.0"
registry: "https://crates.io/crates/ontogen"
repo_present: "[sksizer/rust-ontogen](../repos/sksizer-rust-ontogen.md)"
path_present: "."
repo_target: "[sksizer/rust-ontogen](../repos/sksizer-rust-ontogen.md)"
path_target: "."
depends:
  - "[markdown-store](markdown-store.md)"
edge_notes:
  - edge: depends
    to: "[markdown-store](markdown-store.md)"
    note: >-
      The code ontogen generates for its Markdown backend uses markdown-store; the ontogen crate
      itself does not list it.
---

A build-time code generator: from Rust structs it generates persistence, a store, an API and
clients. Its Markdown backend writes records through markdown-store.

## Notes

- Related crates on crates.io: ontogen-core 0.8.0, ontogen-macros 0.2.0, ontogen-jsonapi 0.3.0,
  ontogen-ts 0.2.0.
- The plan does not say how its target changes beyond markdown-store (task 10).
