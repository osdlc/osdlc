//! Whole tables: read row lines into cells, and render cells into row lines.

use crate::cell_text::{cell_text_from_source, escape_cell};
use crate::grid::pad_row;
use crate::js;
use crate::row::{ColumnAlign, is_delimiter_row, parse_align, split_row};
use crate::splices::row_line_text;

/// A cell as written (`raw`, trimmed source) and as text (pipe escapes
/// read).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableCell {
    /// The cell's source, trimmed, with its escapes as written.
    pub raw: String,
    /// The cell's text, with `\|` read as `|`.
    pub text: String,
}

/// A table read from its row lines.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableData {
    /// The header row's cells.
    pub header: Vec<TableCell>,
    /// One alignment per header cell, from the delimiter row.
    pub align: Vec<ColumnAlign>,
    /// Body rows, each with the cells it has: rows are not padded or cut to
    /// the header.
    pub rows: Vec<Vec<TableCell>>,
}

fn row_cells(line: &str) -> Vec<TableCell> {
    split_row(line, 0)
        .cells
        .iter()
        .map(|cell| {
            let raw = js::trim(&line[cell.content.clone()]).to_owned();
            let text = cell_text_from_source(&raw).text;
            TableCell { raw, text }
        })
        .collect()
}

/// The source of each cell of one row line: trimmed, escapes as written
/// (`\|` stays `\|`).
pub fn row_cell_sources(line: &str) -> Vec<String> {
    row_cells(line).into_iter().map(|cell| cell.raw).collect()
}

/// The text of each cell of one row line: trimmed, pipe escapes read.
pub fn row_cell_texts(line: &str) -> Vec<String> {
    row_cells(line).into_iter().map(|cell| cell.text).collect()
}

/// Read a table from its lines: header, delimiter row, then body rows. Lines
/// carry no container prefix (`> `, list indent). `None` when the second
/// line is not a delimiter row as wide as the header.
pub fn read_table<S: AsRef<str>>(lines: &[S]) -> Option<TableData> {
    let [head, delimiter, body @ ..] = lines else {
        return None;
    };
    let delimiter = delimiter.as_ref();
    if !is_delimiter_row(delimiter) {
        return None;
    }
    let header = row_cells(head.as_ref());
    let align: Vec<ColumnAlign> = row_cells(delimiter)
        .iter()
        .map(|cell| parse_align(&cell.raw))
        .collect();
    if align.len() != header.len() {
        return None;
    }
    let rows = body.iter().map(|line| row_cells(line.as_ref())).collect();
    Some(TableData {
        header,
        align,
        rows,
    })
}

fn align_spec(align: ColumnAlign) -> &'static str {
    match align {
        ColumnAlign::None => "---",
        ColumnAlign::Left => ":---",
        ColumnAlign::Center => ":---:",
        ColumnAlign::Right => "---:",
    }
}

/// Cell texts for [`render_table`].
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct TableInput {
    /// Header cell texts; their count is the table's width.
    pub header: Vec<String>,
    /// One alignment per column. A column with none is [`ColumnAlign::None`],
    /// so an empty list leaves every column unaligned.
    pub align: Vec<ColumnAlign>,
    /// Body rows of cell texts.
    pub rows: Vec<Vec<String>>,
}

/// Options for [`render_table`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct RenderTableOptions<'a> {
    /// Joins the lines. Default `\n`.
    pub line_break: &'a str,
}

impl Default for RenderTableOptions<'_> {
    fn default() -> Self {
        Self { line_break: "\n" }
    }
}

/// A table's markdown from cell texts, one space of padding per cell side.
/// Every cell goes through [`escape_cell`]. Short body rows are padded with
/// empty cells to the header's width. Longer ones keep their extra cells. An
/// empty header gives `""`, since a table needs at least one column.
pub fn render_table(table: &TableInput, options: &RenderTableOptions<'_>) -> String {
    let width = table.header.len();
    if width == 0 {
        return String::new();
    }
    let line = |cells: &[String]| {
        let escaped: Vec<String> = cells.iter().map(|cell| escape_cell(cell)).collect();
        row_line_text(&escaped).text
    };
    let specs: Vec<&str> = (0..width)
        .map(|i| align_spec(table.align.get(i).copied().unwrap_or_default()))
        .collect();
    let mut lines = vec![line(&table.header), row_line_text(&specs).text];
    lines.extend(table.rows.iter().map(|row| line(&pad_row(row, width))));
    lines.join(options.line_break)
}

/// A row [`table_grid`] padded or cut.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableGridIssue {
    /// 1-based line in the lines given.
    pub line: usize,
    /// 0-based body row.
    pub row: usize,
    /// What was wrong and what was done.
    pub message: String,
}

/// A table as a grid of cell texts, for a viewer.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableGrid {
    /// Header cell texts.
    pub header: Vec<String>,
    /// One alignment per column.
    pub align: Vec<ColumnAlign>,
    /// Body rows cut or padded to the header's width, as GFM renders them.
    pub rows: Vec<Vec<String>>,
    /// Rows written with too few or too many cells.
    pub issues: Vec<TableGridIssue>,
}

/// Read a table's lines into a grid of cell texts over [`read_table`].
/// `None` when the lines are not a table.
///
/// Experimental: any release may change or remove it.
pub fn table_grid<S: AsRef<str>>(lines: &[S]) -> Option<TableGrid> {
    let table = read_table(lines)?;
    let width = table.header.len();
    let mut issues = Vec::new();
    let rows = table
        .rows
        .into_iter()
        .enumerate()
        .map(|(row, cells)| {
            if cells.len() != width {
                let message = if cells.len() < width {
                    format!("{} cells, header has {width}; padded", cells.len())
                } else {
                    format!(
                        "{} cells, header has {width}; extra cells dropped",
                        cells.len()
                    )
                };
                issues.push(TableGridIssue {
                    line: row + 3,
                    row,
                    message,
                });
            }
            let texts: Vec<String> = cells.into_iter().take(width).map(|c| c.text).collect();
            pad_row(&texts, width)
        })
        .collect();
    Some(TableGrid {
        header: table.header.into_iter().map(|cell| cell.text).collect(),
        align: table.align,
        rows,
        issues,
    })
}
