# Changelog

## 0.2.0

### Minor Changes

- 25614f6: The first release on npm. Version numbers before 0.2.0 were used only during development and were never published, so this entry lists everything the package does.
  
  GFM pipe tables as strings and character offsets, with no dependencies. A backslash escapes the next character, as in the GFM spec, so `\|` is a literal pipe in a cell.
  
  - Rows: `splitRow`, `rowPipes`, `rowFromPipes`, `isDelimiterRow` and `parseAlign` read one table line into pipes and cells. Offsets are absolute from the `base` you pass.
  - Whole tables: `readTable` and `rowCellTexts` read a table's lines, `renderTable` writes one and escapes every cell, and `tableGrid` gives a grid of cell texts for a viewer, with ragged rows reported.
  - Cell text: `cellTextFromSource`, `sourceOffset` and `textOffset` map between a cell's source and its text. `escapeCell`, `escapeCellInsert` and `escapeCodeCell` write cell source; `literalPipeFixes` and `endsWithEscape` keep pipes literal while a cell is edited.
  - Edits: `rowLineText`, `insertCellSplice`, `deleteCellSplice`, `padRowSplice`, `tableLines` and `hasTrailingPipe` change one row line's bytes and nothing else.
  - Grids and clipboard: TSV, strict RFC 4180 CSV and HTML conversion (`gridFromTsv`, `tsvFromGrid`, `gridFromCsv`, `gridFromCsvPaste`, `toCsv`, `htmlFromGrid`, `CELL_SOURCE_ATTR`), and `pasteRect`, `rectangular`, `padRow` and `clipboardLines`.
  - Delimited files: `readDelimited` reads CSV, TSV, semicolon and pipe files tolerantly. It sniffs the delimiter, detects a header and reports each problem by line. `parseDelimited`, `sniffDelimiter` and `looksLikeHeader` are its parts.
  
  Node.js 22 or later, ESM only; Bun loads the TypeScript source through the `bun` export condition. The README's Stability section lists the experimental exports. Licensed `MIT OR Apache-2.0`.

## 0.1.1

Developed in a private repository before the package moved here. Not published.

### Fixed

- Table rows may be indented by 0-3 spaces before the opening pipe.
- Cells inside a backtick code span are escaped correctly, via `escapeCodeCell`; indented
  rows are handled.

## 0.1.0

Developed in a private repository before the package moved here. Not published.

First cut. GFM pipe-table string code, moved out of the editor into its own dependency-free
package.

### Added

- Row functions: `splitRow`, `rowPipes`, `isDelimiterRow`, `parseAlign`.
- Whole tables: `readTable`, `rowCellTexts`, `renderTable`.
- Cell text: `cellTextFromSource`, `escapeCell`, `literalPipeFixes`, `endsWithEscape`.
- Edits: `rowLineText`, `insertCellSplice`, `deleteCellSplice`, `padRowSplice`.
- Grids and clipboard: TSV and CSV conversion, with a CSV paste rule.
