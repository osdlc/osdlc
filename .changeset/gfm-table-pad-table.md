---
'@osdlc/gfm-table': minor
---

Add `padTable(table, options?)`, which pads a table's cells so its pipes line up in the source, and its option type `PadTableOptions`.

- The output is the "aligned" style of rumdl's MD060 rule: each cell padded to its column's widest cell, at least 3 columns plus the alignment colons, colons kept. Left and unaligned cells are padded on the right, right-aligned ones on the left, and centered ones on both sides.
- It counts display width as the unicode-width crate does, so East Asian wide characters and emoji take 2 columns and combining marks none. The Unicode data ships with the package, so every runtime gives the same widths.
- `maxColumnWidth`, a positive integer, caps the width a cell can widen its column to. A wider cell does not widen its column. Any other value throws a `RangeError`.
- Cell text is kept as written, escapes included. Unlike `padRow`, it adds no cells: short rows stay short. Every row takes the indent of the header row.
- Padding a padded table changes nothing.
- Some input comes back unchanged: text that is not a table, a table with a zero-width joiner, space, non-joiner or word joiner (as in MD060), and a table with a pipe after a run of backslashes such as `\\|`, which GitHub reads differently from this package.
- The caller passes only the table's lines. padTable stops at a blank line but does not otherwise find where a table ends.
