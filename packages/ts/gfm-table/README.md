# @osdlc/gfm-table

Read, write and edit GitHub Flavored Markdown (GFM) pipe tables as plain
strings and character offsets. No dependencies.

## Why

Code that touches markdown tables keeps getting one rule wrong: a `|` inside a
cell must be written `\|`, and a backslash before the closing pipe escapes it.
A hand-rolled `line.split('|')` breaks on the first escaped pipe, and a writer
that does not escape cells breaks the table. This package holds that rule in
one place, for every reader and writer of a table.

It is for code that already has the table's lines: a markdown generator, a
linter, a report writer, or an editor that edits a table in place and needs
exact offsets. It also converts grids of cells to and from TSV, CSV and HTML
for the clipboard, and reads CSV-like files tolerantly.

When not to use it:

- To parse a whole markdown document, use a markdown parser such as
  [micromark](https://github.com/micromark/micromark) with its GFM table
  extension, or [remark](https://github.com/remarkjs/remark). This package
  does not find tables in a document, and does not strip container prefixes
  such as `> ` or list indentation. The caller passes the table's lines.
- To render inline markdown inside a cell. Cell text keeps its inline markup;
  only the table-level `\|` escape is read.
- For a general CSV library with streaming, typed columns or a writer with
  options, use one such as [csv-parse](https://csv.js.org/parse/) or
  [Papa Parse](https://www.papaparse.com/).

## Install

```sh
npm install @osdlc/gfm-table
```

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { readTable, renderTable, rowCellTexts } from '@osdlc/gfm-table'

// Read a row: an escaped pipe stays inside its cell.
rowCellTexts('| a \\| b | c |') // ['a | b', 'c']

// Write a table: every cell is escaped for you.
const markdown = renderTable({ header: ['Name', 'Value'], rows: [['a|b', '1']] })
// | Name | Value |
// | --- | --- |
// | a\|b | 1 |

// Read it back.
readTable(markdown.split('\n'))?.rows[0]?.[0]?.text // 'a|b'
```

## API

Offsets are absolute from the `base` you pass, so you can pass one line of a
larger document and use the result against the document.

- Rows: `splitRow`, `rowPipes`, `rowFromPipes`, `isDelimiterRow`,
  `parseAlign`, with the types `TableRowSpan`, `TableCellSpan` and
  `ColumnAlign`.
- Whole tables: `readTable`, `rowCellTexts`, `renderTable` and `tableGrid`,
  with the types `TableData`, `TableCell`, `TableInput`, `RenderTableOptions`
  and `TableGrid`.
- Cell text: `cellTextFromSource`, `sourceOffset`, `textOffset`,
  `escapeCell` (a cell written at once), `escapeCellInsert` (text typed into
  a cell), `escapeCodeCell` (a cell inside a backtick code span),
  `literalPipeFixes` and `endsWithEscape`, with the types `CellText` and
  `PipeFix`.
- Edits: `rowLineText`, `insertCellSplice`, `deleteCellSplice`,
  `padRowSplice`, `tableLines` and `hasTrailingPipe`, with the types
  `LineSplice` and `RowPad`. Each splice changes only its own bytes.
- Grids and clipboard: `gridFromTsv`, `tsvFromGrid`, `gridFromCsv`,
  `gridFromCsvPaste`, `toCsv`, `htmlFromGrid`, `CELL_SOURCE_ATTR`,
  `pasteRect`, `rectangular`, `padRow` and `clipboardLines`, with the types
  `CellGrid` and `CellRect`.
- Delimited files: `readDelimited` reads CSV, TSV, semicolon and pipe files
  tolerantly. It sniffs the delimiter (`sniffDelimiter`), detects a header
  (`looksLikeHeader`), and reports each problem by line instead of failing.
  `parseDelimited` is the reader without the sniffing. `gridFromCsv` stays
  strict, for the clipboard.

Each export has TSDoc in the source. Your editor shows it.

```ts
import { readDelimited } from '@osdlc/gfm-table'

const file = readDelimited('name;qty\napple;3\npear\n')
file.delimiter // ';'
file.header // ['name', 'qty']
file.issues // [{ line: 3, message: '1 fields, header has 2' }]
```

## How it compares

- micromark, remark and markdown-it parse whole documents into a tree, and
  remark (with `mdast-util-gfm-table`) writes a table back from its tree. They
  do not give splices that edit one cell without touching the rest of the
  line. Use them to find a table in a document; use this package to read,
  write or edit the table's lines.
- [markdown-table](https://github.com/wooorm/markdown-table) writes tables,
  with column alignment and padding. It does not read tables or give offsets.
- CSV libraries read and write CSV in full. This package has only what a table
  editor needs for the clipboard and for opening a CSV-like file: strict RFC
  4180 for paste, and a tolerant reader that reports problems by line.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

The experimental exports:

- `tableGrid`, `TableGrid`
- `EMPTY_ROW`
- `insertCellSplice`, `deleteCellSplice`, `padRowSplice`, `tableLines`,
  `hasTrailingPipe`, `LineSplice`, `RowPad`
- `readDelimited`, `parseDelimited`, `sniffDelimiter`, `looksLikeHeader`,
  `DELIMITERS`, `DELIMITER_NAMES`, `Delimiter`, `DelimitedRead`,
  `DelimitedRecord`, `DelimitedIssue`, `ReadDelimitedOptions`

## Runtimes and platforms

Node.js 22 or later, ESM only. Bun works too, and loads the TypeScript source
through the `bun` export condition. The package does pure string work, with no
file system, process or platform code, so it runs on any operating system.
Its tests run on Linux and macOS.

## License

`MIT OR Apache-2.0`, at your option.
