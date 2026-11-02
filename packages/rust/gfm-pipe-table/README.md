# gfm-pipe-table

Read, write and edit GitHub Flavored Markdown (GFM) pipe tables as plain
strings and byte offsets. No dependencies.

This crate is the Rust twin of the npm package
[`@osdlc/gfm-table`](https://github.com/osdlc/osdlc/tree/main/packages/ts/gfm-table):
for the same input both give the same result, checked by a shared fixture,
[`tests/fixtures/parity.json`](tests/fixtures/parity.json), that both
packages' tests run. The two share the major and minor version. The crate is
named `gfm-pipe-table` because `gfm-table` is taken on crates.io.

## Why

Code that touches markdown tables keeps getting one rule wrong: a `|` inside a
cell must be written `\|`, and a backslash before the closing pipe escapes it.
A hand-rolled `line.split('|')` breaks on the first escaped pipe, and a writer
that does not escape cells breaks the table. This crate holds that rule in one
place, for every reader and writer of a table.

It is for code that already has the table's lines: a markdown generator, a
linter, a report writer, or an editor that edits a table in place and needs
exact offsets. It also converts grids of cells to and from TSV, CSV and HTML
for the clipboard, reads CSV-like files tolerantly, and edits one field, row
or column of such a file without rewriting the rest.

It does not find tables in a document, strip container prefixes such as a
blockquote `>`, or render inline markdown inside a cell. Use a markdown parser
such as [comrak](https://crates.io/crates/comrak) or
[pulldown-cmark](https://crates.io/crates/pulldown-cmark) for that, and the
[csv](https://crates.io/crates/csv) crate for a general CSV reader and writer.

## Install

```sh
cargo add gfm-pipe-table
```

The library is `gfm_pipe_table`. Rust 1.89 or later.

## Quick start

```rust
use gfm_pipe_table::{PadTableOptions, RenderTableOptions, TableInput, pad_table, read_table,
    render_table, row_cell_texts};

// Read a row: an escaped pipe stays inside its cell.
assert_eq!(row_cell_texts("| a \\| b | c |"), ["a | b", "c"]);

// Write a table: every cell is escaped for you.
let input = TableInput {
    header: vec!["Name".into(), "Value".into()],
    align: vec![],
    rows: vec![vec!["a|b".into(), "1".into()]],
};
let markdown = render_table(&input, &RenderTableOptions::default());
assert_eq!(markdown, "| Name | Value |\n| --- | --- |\n| a\\|b | 1 |");

// Read it back.
let lines: Vec<&str> = markdown.lines().collect();
assert_eq!(read_table(&lines).unwrap().rows[0][0].text, "a|b");

// Line up the pipes.
assert_eq!(
    pad_table("| a | b |\n|:-|--:|\n| long cell | 1 |", &PadTableOptions::default()),
    "| a         |    b |\n| :-------- | ---: |\n| long cell |    1 |",
);
```

`examples/table.rs` runs the rest: `cargo run -p gfm-pipe-table --example table`.

## API

Offsets are absolute from the `base` you pass, so you can pass one line of a
larger document and use the result against the document.

| Area | Items |
| --- | --- |
| Rows | `split_row`, `row_pipes`, `row_from_pipes`, `is_delimiter_row`, `parse_align`, `TableRowSpan`, `TableCellSpan`, `ColumnAlign`, `EMPTY_ROW` |
| Whole tables | `read_table`, `row_cell_texts`, `row_cell_sources`, `render_table`, `table_grid`, `TableData`, `TableCell`, `TableInput`, `RenderTableOptions`, `TableGrid`, `TableGridIssue` |
| Padding | `pad_table`, `PadTableOptions`, `display_width` |
| Cell text | `cell_text_from_source`, `source_offset`, `text_offset`, `escape_cell`, `escape_cell_insert`, `escape_code_cell`, `literal_pipe_fixes`, `ends_with_escape`, `CellText`, `TextChange` |
| Edits | `row_line_text`, `insert_cell_splice`, `delete_cell_splice`, `pad_row_splice`, `table_lines`, `has_trailing_pipe`, `RowLine`, `LineSplice`, `Change`, `RowPad`, `TableLine` |
| Grids and clipboard | `grid_from_tsv`, `tsv_from_grid`, `grid_from_csv`, `grid_from_csv_paste`, `to_csv`, `html_from_grid`, `CELL_SOURCE_ATTR`, `paste_rect`, `PasteRect`, `rectangular`, `pad_row`, `clipboard_lines`, `CellGrid`, `CellRect` |
| Delimited files | `read_delimited`, `parse_delimited`, `sniff_delimiter`, `looks_like_header`, `Delimiter`, `DELIMITERS`, `ReadDelimitedOptions`, `DelimitedRead`, `DelimitedParse`, `DelimitedRecord`, `DelimitedFieldSpan`, `DelimitedLineEnding`, `DelimitedIssue` |
| Editing delimited files | `set_delimited_field`, `insert_delimited_row`, `delete_delimited_row`, `insert_delimited_column`, `delete_delimited_column`, `apply_delimited_changes`, `reread_delimited`, `quote_delimited_field`, `delimited_record_text`, `OverlappingChanges` |

Each item has rustdoc. `pad_table` gives the "aligned" style of
[rumdl](https://github.com/rvben/rumdl)'s MD060 rule and counts display width
as the unicode-width crate 0.2.2 does, with the data built in.

`read_delimited` reads CSV, TSV, semicolon and pipe files tolerantly. It
sniffs the delimiter (`sniff_delimiter`), detects a header
(`looks_like_header`), and reports each problem by line instead of failing.
`parse_delimited` is the reader without the sniffing. `grid_from_csv` stays
strict, for the clipboard.

Each record it reads carries its fields' byte offsets, so
`set_delimited_field`, `insert_delimited_row`, `delete_delimited_row`,
`insert_delimited_column` and `delete_delimited_column` return byte changes
(`TextChange`) that touch only what the edit must. The file keeps its
delimiter, line endings, byte order mark and the quoting of every other
field. `apply_delimited_changes` applies them, and `reread_delimited` reads
the result with the same delimiter and header decision.
`quote_delimited_field` and `delimited_record_text` write fields and lines.

```rust
use gfm_pipe_table::{ReadDelimitedOptions, apply_delimited_changes, read_delimited,
    set_delimited_field};

let text = "name,note\r\n\"Ada\",\"hi\"\r\nBob,ok\r\n";
let file = read_delimited(text, &ReadDelimitedOptions::new());
let change = set_delimited_field(&file, &file.rows[1], 1, "yes, fine");
assert_eq!(
    apply_delimited_changes(text, &[change]).unwrap(),
    "name,note\r\n\"Ada\",\"hi\"\r\nBob,\"yes, fine\"\r\n",
);
```

## Differences from the TypeScript twin

The behaviour is the same, but for a delimiter outside the Basic
Multilingual Plane and an offset `apply_delimited_changes` cannot slice at
(both below). These are the differences of idiom:

- **Byte offsets.** Every offset is a UTF-8 byte offset into the `&str`; the
  TypeScript package's are UTF-16 string indices. They agree on ASCII text.
  `CellText::offsets` has one entry per byte of the text. A splice's cursor
  `offset` past one filler character is that character's length in bytes.
  The fixture holds byte offsets, and the TypeScript runner converts.
- **`Option` for `null`.** `read_table`, `table_grid`, `rectangular`, the grid
  readers, `pad_row_splice` and `delete_delimited_row` return `None` where
  the TypeScript twin returns `null`.
- **No invalid cap.** `PadTableOptions::max_column_width` is an
  `Option<NonZeroUsize>`. The TypeScript twin throws a `RangeError` for a cap
  that is not a positive integer; the fixture names that refusal
  `invalid_max_column_width`.
- **A splice has all three fields.** `Change` is `from`, `to` and `insert`; an
  insert has `to == from` and a delete an empty `insert`. The TypeScript twin
  leaves the unused one out.
- **Signatures.** `table_lines(rows, delimiter)` takes the two fields of the
  TypeScript argument object. `paste_rect(grid, row, col, range)` takes the
  start as two numbers and returns a `PasteRect` with a `value(row, col)`
  method, or `None` when the grid covers no cell (no rows, or an empty first
  row), where the TypeScript twin returns an empty rectangle with `bottom`
  above `top` or `right` left of `left`. `looks_like_header(&[])` stands for
  the TypeScript `looksLikeHeader(undefined)`. Default arguments are written
  out: `split_row(line, 0)`, `pad_row_splice(line, span, width, "")`,
  `quote_delimited_field(value, delimiter, false)`,
  `insert_delimited_column(read, at, "")`.
- **`Delimiter` is an enum.** `DELIMITERS` lists it; `Delimiter::name` is the
  TypeScript `DELIMITER_NAMES`, and `as_char` and `from_char` convert.
  `parse_delimited`, `quote_delimited_field` and `delimited_record_text`
  take a `char`. The TypeScript twin compares its delimiter string with one
  UTF-16 unit at a time, so a delimiter outside the Basic Multilingual Plane
  never matches there; here any `char` does.
- **`DelimitedLineEnding` is an enum.** `as_str` gives the line break that
  the TypeScript twin's `lineEnding` string holds.
- **Applying changes.** `apply_delimited_changes` takes a slice of changes,
  so one change is `&[change]`, and returns
  `Err(OverlappingChanges)` where the TypeScript twin throws a `RangeError`;
  the fixture names that refusal `overlapping_changes`. An offset past the
  end of the text or inside a character panics, as slicing a `str` does;
  the TypeScript twin clamps it.
- **`pad_row_splice` on a line that is not a row.** For a line with no pipe
  and no cell, such as an empty line, it returns `None`. The TypeScript twin
  throws a `TypeError` there.

One-sided exports, which the TypeScript package has no counterpart for:

- `display_width`, which the TypeScript package keeps internal.
- `DelimitedParse`, the named result of `parse_delimited`, and
  `TableGridIssue`, `TableLine`, `RowLine`, `Change` and `PasteRect`, the
  named types of results the TypeScript package returns as object literals.
- `OverlappingChanges`, the error `apply_delimited_changes` returns where
  the TypeScript twin throws.
- `ColumnAlign::as_str`, `Delimiter::as_char`, `Delimiter::from_char`,
  `DelimitedLineEnding::as_str`.

## Stability

The crate is 0.x, so any minor release may break the API. Within that, each
item is stable or experimental; any release may change or remove an
experimental item. The experimental items are the TypeScript twin's, with
the one-sided items that go with them:

- `table_grid`, `TableGrid`, `TableGridIssue`
- `EMPTY_ROW`
- `insert_cell_splice`, `delete_cell_splice`, `pad_row_splice`, `table_lines`,
  `has_trailing_pipe`, `LineSplice`, `Change`, `RowPad`, `TableLine`
- `read_delimited`, `parse_delimited`, `sniff_delimiter`, `looks_like_header`,
  `DELIMITERS`, `Delimiter`, `DelimitedRead`, `DelimitedParse`,
  `DelimitedRecord`, `DelimitedFieldSpan`, `DelimitedLineEnding`,
  `DelimitedIssue`, `ReadDelimitedOptions`
- `set_delimited_field`, `insert_delimited_row`, `delete_delimited_row`,
  `insert_delimited_column`, `delete_delimited_column`,
  `apply_delimited_changes`, `reread_delimited`, `quote_delimited_field`,
  `delimited_record_text`, `OverlappingChanges`

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE)
at your option.
