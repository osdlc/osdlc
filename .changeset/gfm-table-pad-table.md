---
'@osdlc/gfm-table': minor
---

Add `padTable(table, options?)`, which pads a table's cells so its pipes line up in the source, and its option type `PadTableOptions`.

- The output is the "aligned" style of rumdl's MD060 rule: each cell padded to its column's widest cell, at least 3 columns, alignment colons kept. Left and unaligned cells are padded on the right, right-aligned ones on the left, and centered ones on both sides.
- It counts display width as the unicode-width crate does, so East Asian wide characters and emoji take 2 columns and combining marks none.
- `maxColumnWidth` caps the width a cell can widen its column to. A wider cell does not widen its column.
- Cell text is kept as written, escapes included. Padding a padded table changes nothing.
- Text that is not a table comes back unchanged, and so does a table with a zero-width joiner, zero-width space, zero-width non-joiner or word joiner, as in MD060.
