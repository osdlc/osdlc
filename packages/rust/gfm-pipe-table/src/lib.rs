//! GFM pipe tables as strings and byte offsets. A backslash escapes the next
//! character, as in the GFM spec, Lezer and micromark, so `\|` is a literal
//! pipe in a cell. No parser and no dependencies: callers find tables
//! themselves and pass the row text.
//!
//! This crate is the Rust twin of the npm package `@osdlc/gfm-table`. Both
//! give the same result for the same input, checked by a shared fixture.
//! Offsets here are byte offsets into the UTF-8 `&str`; the TypeScript twin's
//! are UTF-16 string indices. They agree on ASCII text.
//!
//! - Rows: [`split_row`], [`row_pipes`], [`row_from_pipes`],
//!   [`is_delimiter_row`], [`parse_align`].
//! - Whole tables: [`read_table`], [`row_cell_texts`], [`row_cell_sources`],
//!   [`render_table`], [`table_grid`].
//! - Padding: [`pad_table`] lines up a table's pipes, as rumdl's MD060
//!   "aligned" style does, counting [`display_width`].
//! - Cell text: [`cell_text_from_source`], [`source_offset`],
//!   [`text_offset`], [`escape_cell`], [`escape_cell_insert`],
//!   [`escape_code_cell`], [`literal_pipe_fixes`], [`ends_with_escape`].
//! - Edits: [`row_line_text`], [`insert_cell_splice`], [`delete_cell_splice`],
//!   [`pad_row_splice`], [`table_lines`], [`has_trailing_pipe`].
//! - Grids and clipboard: [`grid_from_tsv`], [`tsv_from_grid`],
//!   [`grid_from_csv`], [`grid_from_csv_paste`], [`to_csv`],
//!   [`html_from_grid`], [`paste_rect`], [`rectangular`], [`pad_row`],
//!   [`clipboard_lines`].
//! - Delimited files: [`read_delimited`], [`parse_delimited`],
//!   [`sniff_delimiter`], [`looks_like_header`].
//!
//! ```
//! use gfm_pipe_table::{RenderTableOptions, TableInput, read_table, render_table, row_cell_texts};
//!
//! // Read a row: an escaped pipe stays inside its cell.
//! assert_eq!(row_cell_texts("| a \\| b | c |"), ["a | b", "c"]);
//!
//! // Write a table: every cell is escaped for you.
//! let input = TableInput {
//!     header: vec!["Name".into(), "Value".into()],
//!     align: vec![],
//!     rows: vec![vec!["a|b".into(), "1".into()]],
//! };
//! let markdown = render_table(&input, &RenderTableOptions::default());
//! assert_eq!(markdown, "| Name | Value |\n| --- | --- |\n| a\\|b | 1 |");
//!
//! // Read it back.
//! let lines: Vec<&str> = markdown.lines().collect();
//! assert_eq!(read_table(&lines).unwrap().rows[0][0].text, "a|b");
//! ```

mod cell_text;
mod delimited;
mod grid;
mod js;
mod pad;
mod row;
mod splices;
mod table;
mod width;
mod width_data;

pub use cell_text::{
    CellText, PipeFix, cell_text_from_source, ends_with_escape, escape_cell, escape_cell_insert,
    escape_code_cell, literal_pipe_fixes, source_offset, text_offset,
};
pub use delimited::{
    DELIMITERS, DelimitedIssue, DelimitedParse, DelimitedRead, DelimitedRecord, Delimiter,
    ReadDelimitedOptions, looks_like_header, parse_delimited, read_delimited, sniff_delimiter,
};
pub use grid::{
    CELL_SOURCE_ATTR, CellGrid, CellRect, PasteRect, clipboard_lines, grid_from_csv,
    grid_from_csv_paste, grid_from_tsv, html_from_grid, pad_row, paste_rect, rectangular, to_csv,
    tsv_from_grid,
};
pub use pad::{PadTableOptions, pad_table};
pub use row::{
    ColumnAlign, EMPTY_ROW, TableCellSpan, TableRowSpan, is_delimiter_row, parse_align,
    row_from_pipes, row_pipes, split_row,
};
pub use splices::{
    Change, LineSplice, RowLine, RowPad, TableLine, delete_cell_splice, has_trailing_pipe,
    insert_cell_splice, pad_row_splice, row_line_text, table_lines,
};
pub use table::{
    RenderTableOptions, TableCell, TableData, TableGrid, TableGridIssue, TableInput, read_table,
    render_table, row_cell_sources, row_cell_texts, table_grid,
};
pub use width::display_width;

/// The README's code blocks, run as doctests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
