---
name: slug-collate
kind: crate
language: rust
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.2.0"
registry: "https://crates.io/crates/slug-collate"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/slug-collate
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/slug-collate
---

Turns a title into a filename-safe slug, folding accents instead of dropping letters, and gives a
fixed, locale-free order for strings and paths in place of localeCompare.

## Notes

- markdown-link-rs, markdown-corpus-rs and markdown-relink depend on it (their Cargo.toml).
- The plan has no task for it. The layer is a guess: it works on the text that names notes.
- D-SM4K does not say whether it is a general library or one the markdown plan owns.
