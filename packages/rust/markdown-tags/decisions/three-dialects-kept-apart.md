# Three dialects, kept apart

## Decision

Tag lexing has three dialects, `obsidian`, `unicode` and `ascii`, and a caller
names the one it wants. They are not merged into one rule, and none is a
superset of another.

## Why

Tools disagree on what an inline tag is, and the differences are real, not
cosmetic:

- `#2024` is a tag to a search index and not to Obsidian.
- `#santé` loses its `é` under an ASCII rule that a link graph may want.
- A `#` inside a code sample is a tag to a scan that does not know Markdown,
  and not to a reader.

A single rule would drop tags one caller needs or invent tags another caller
must not have. Each caller was already carrying its own rule, so the dialects
name rules that already existed.

## Consequences

- Every function takes a dialect, and the default is documented
  ([obsidian-is-the-default.md](./obsidian-is-the-default.md)).
- A change to a rule is a change to one dialect, with cases in the shared
  conformance suite for all three.
- A new dialect is a new variant and a minor version, which is why the Rust
  enum is `#[non_exhaustive]`.
