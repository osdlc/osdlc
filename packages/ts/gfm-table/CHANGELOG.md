# @osdlc/gfm-table

## 0.4.0

### Minor Changes

- b835ae4: `insertCellSplice` at column 0 of a row indented one to three spaces now reads the row's leading pipe as opening it and puts the new cell after that pipe, as it does for an unindented row (`  | a |` becomes `  |  | a |`). Before, it took the row for one with no opening pipe and added a second one.
  New export `rowCellSources(line)`: each cell of one row line, trimmed, with its escapes and inline markup as written.

## 0.3.1

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.3.0

### Minor Changes

- 035499a: Add `padTable(table, options?)`, which pads a table's cells so its pipes line up in the source, and its option type `PadTableOptions`.
  
  - The output is the "aligned" style of rumdl's MD060 rule: each cell padded to its column's widest cell, at least 3 columns plus the alignment colons, colons kept. Left and unaligned cells are padded on the right, right-aligned ones on the left, and centered ones on both sides.
  - It counts display width as the unicode-width crate does, so East Asian wide characters and emoji take 2 columns and combining marks none. The Unicode data ships with the package, so every runtime gives the same widths.
  - `maxColumnWidth`, a positive integer, caps the width a cell can widen its column to. A wider cell does not widen its column. Any other value throws a `RangeError`.
  - Cell text is kept as written, escapes included. Unlike `padRow`, it adds no cells: short rows stay short. Every row takes the header's 0-3 leading spaces, whether or not the header has an opening pipe.
  - Padding a padded table changes nothing.
  - Some input comes back unchanged: text that is not a table, a table with a zero-width joiner, space, non-joiner or word joiner (as in MD060), and a table with a pipe after a run of backslashes such as `\\|`, which GitHub reads differently from this package.
  - The caller passes only the table's lines. padTable stops at a blank line or at a line indented 4 or more columns (a code block in GFM), and keeps that line and the ones after it as they are. It does not otherwise find where a table ends.

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
