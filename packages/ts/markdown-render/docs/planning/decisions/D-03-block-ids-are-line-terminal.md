---
id: D-03
type: decision
state: accepted
created: 2026-11-08
---

# D-03: A block id is line-terminal

## Decision

`^id` is a block id only at the end of a line, after whitespace. A caret in the middle of a line is ordinary text.

## Why

That is how Obsidian registers a block reference. Treating a mid-line caret as an id would delete the author's words and mint an anchor from them.

## Consequences

- A block id on a list item stays on that item. An id after raw HTML, a definition or a footnote stays literal.
- A block id reserves its spelling before heading ids are slugged; a heading that would take it gets a numbered suffix.
