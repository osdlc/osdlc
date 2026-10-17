---
id: D-04
type: decision
state: accepted
created: 2026-10-17
---

# D-04: The line-ending types are closed

## Decision

`OpenEol` (`'\n' | '\r\n'`) and `CloseEol` (`'' | '\n' | '\r\n'`) are closed
unions. A caller may switch over them exhaustively.

## Why

A fence line ends in `\n` or `\r\n`, or, for the closing fence, at the end of
the text. There is no other line ending the package recognizes, and adding
one would change which notes have a frontmatter block, which is a breaking
change anyway.

## Consequences

Adding a member to either type needs `2.0.0`.
