---
'@osdlc/gfm-table': minor
---

Edit delimited files without rewriting them. Each record from `parseDelimited` and `readDelimited` now carries `spans` (each field's `from`, `to` and whether it was quoted) and its own `from`, `to` and `end` offsets. `readDelimited` and `parseDelimited` also return `lineEnding` and `bom`, and `readDelimited` returns `headerRecord`. A line holding only `""` now reads as a record of one empty field; before, it was skipped like a blank line.

New exports `setDelimitedField`, `insertDelimitedRow`, `deleteDelimitedRow`, `insertDelimitedColumn` and `deleteDelimitedColumn` return byte changes (`TextChange`) that touch only what the edit must. The file keeps its delimiter, line endings, byte order mark and the quoting of every other field. A changed field is quoted only when its value needs it or it was quoted before. Setting a field past the end of a short row fills the row out. No edit leaves a line that reads as blank: a record left with one empty field is written `""`. `applyDelimitedChanges` applies changes, and `rereadDelimited` reads the result with the same delimiter and header decision; `quoteDelimitedField` and `delimitedRecordText` write fields and lines. All are experimental.

**Breaking:** `DelimitedRecord` has new required fields, so code that builds one by hand must add them. `PipeFix` is renamed `TextChange`, with no alias; `literalPipeFixes` returns `TextChange[]`.
