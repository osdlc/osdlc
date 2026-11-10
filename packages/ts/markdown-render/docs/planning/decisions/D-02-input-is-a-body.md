---
id: D-02
type: decision
state: accepted
created: 2026-11-08
---

# D-02: The input is a body

## Decision

`renderToHtml` and the other entry points take a note body. Frontmatter is the caller's to split off.

## Why

What a frontmatter block means (YAML, TOML, properties for a database view) belongs to the host. A renderer that skipped or parsed it would guess. The slicers share the rule: they expect a body and do not skip a leading `---` block.

## Consequences

- A `---` block left in the input renders as a thematic break and a heading, as CommonMark reads it.
- The `LoadedNote` type pairs a body with its raw frontmatter for hosts that need both.
