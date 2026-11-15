---
name: etag-write
kind: crate
language: rust
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.2.4"
registry: "https://crates.io/crates/etag-write"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/etag-write
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/etag-write
twin: "[etag-write](etag-write.md)"
---

The Rust twin of @osdlc/etag-write: atomic writes with a hash check, so a stale write never replaces
newer changes.
