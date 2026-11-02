---
'@osdlc/gfm-table': minor
---

Edit delimited files without rewriting them. Each record from `parseDelimited` and `readDelimited` now carries `spans` (each field's `from`, `to` and whether it was quoted) and its own `from`, `to` and `end` offsets. `readDelimited` also returns `headerRecord`, `lineEnding` and `bom`, and `parseDelimited` returns `lineEnding`.

New exports `setDelimitedField`, `insertDelimitedRow`, `deleteDelimitedRow`, `insertDelimitedColumn` and `deleteDelimitedColumn` return byte changes (`DelimitedChange`) that touch only what the edit must. The file keeps its delimiter, line endings, byte order mark and the quoting of every other field. A changed field is quoted only when its value needs it or it was quoted before. Setting a field past the end of a short row fills the row out. `applyDelimitedChanges` applies changes; `quoteDelimitedField` and `delimitedRecordText` write fields and lines. All are experimental. The Rust twin `gfm-pipe-table` does not have these yet.

**Breaking (types only):** `DelimitedRecord` has new required fields, so code that builds one by hand must add them.
