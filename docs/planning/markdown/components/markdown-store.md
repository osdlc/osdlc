---
name: markdown-store
kind: crate
language: rust
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/rust-ontogen](../repos/sksizer-rust-ontogen.md)"
path_present: crates/markdown-store
repo_target: "[sksizer/rust-ontogen](../repos/sksizer-rust-ontogen.md)"
path_target: crates/markdown-store
tasks:
  - "[10 Store layout](../tasks/10%20Store%20layout.md)"
depends_new:
  - "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
  - "[markdown-link-rs](markdown-link-rs.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: depends_new
    to: "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
    note: "Task 10: it uses the shared note parts instead of its own frontmatter and wikilink code."
  - edge: depends_new
    to: "[markdown-link-rs](markdown-link-rs.md)"
    note: "Task 10: it uses the shared note parts instead of its own frontmatter and wikilink code."
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: "Task 10: it writes the spec's layout."
---

Reads and writes typed records as Markdown notes from Rust code, keeping the frontmatter lossless.

## Notes

- publish = false, so not on crates.io.
- Problems F6 and F7: it lays out records differently from corpus-schema, and has its own
  frontmatter and wikilink code.
- Task 10: it writes the spec's layout and uses the shared note parts.
- Where it lives in the target is an open question (stay in rust-ontogen or move to osdlc).
  Unchanged here.
- Its Cargo.toml says it is meant to move into a rust-markdown workspace beside markdown-vault. The
  plan does not say this.
