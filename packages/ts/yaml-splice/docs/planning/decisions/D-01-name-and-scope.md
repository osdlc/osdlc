---
id: D-01
type: decision
state: accepted
created: 2026-10-17
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/yaml-splice`. It edits the top-level fields of one
  YAML mapping: `Set`, `Remove` and `Rename`, applied as one atomic batch.
- It works on bytes, not on a parsed tree. Every byte outside an edited span
  is copied from the input. When an edit cannot be made that way, it is
  refused with a typed `EditError`.
- It does not read values, edit nested values, or format YAML.
- The editing is the `yaml-splice` Rust crate in `packages/rust/yaml-splice`.
  This package is a binding to it, not a second implementation.

## Why

- Tools that write YAML that people also edit, such as frontmatter and config
  files, need edits that leave the rest of the file alone. Parsers that
  serialize the document again change quoting, spacing and line endings.
- One implementation means one place to fix a bug. A TypeScript port would
  have to be kept byte-identical to the crate by hand.

## Consequences

- A change to how YAML is edited goes into the crate first.
- Nested edits, if ever added, are a new kind of `FieldEdit`, made in the crate.
