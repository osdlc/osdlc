//! Pad a table's cells so its pipes line up in the source, in the "aligned"
//! style of rumdl's MD060 rule.

use std::num::NonZeroUsize;

use crate::js;
use crate::row::{ColumnAlign, row_pipes};
use crate::splices::row_line_text;
use crate::table::read_table;
use crate::width::display_width;

/// Options for [`pad_table`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct PadTableOptions {
    /// The widest cell, in display columns, that counts toward its column's
    /// width. A wider cell does not widen its column. Where it is wider than
    /// the column it keeps one space on each side, so the pipes after it in
    /// its row do not line up. Default: no limit.
    ///
    /// The TypeScript twin takes a number and throws a `RangeError` for one
    /// that is not a positive integer; here the type holds only those.
    pub max_column_width: Option<NonZeroUsize>,
}

/// Whether `text` holds a character whose width depends on the terminal and
/// font, so rumdl leaves the table as it is: ZWSP, ZWNJ, ZWJ or WORD JOINER.
fn has_unmeasured(text: &str) -> bool {
    text.contains(['\u{200b}', '\u{200c}', '\u{200d}', '\u{2060}'])
}

/// Whether `line` is indented 4 or more columns, an indented code block in
/// GFM: 0-3 spaces then a tab, or 4 spaces.
fn is_code_indent(line: &str) -> bool {
    let spaces = line.bytes().take_while(|&b| b == b' ').count();
    spaces >= 4 || line.as_bytes().get(spaces) == Some(&b'\t')
}

/// The header's leading spaces, 0 to 3, which every row takes.
fn indent(line: &str) -> &str {
    let spaces = line.bytes().take(3).take_while(|&b| b == b' ').count();
    &line[..spaces]
}

/// The minimum column width: a delimiter cell needs 3 dashes.
const MIN_WIDTH: usize = 3;

fn colons(align: ColumnAlign) -> usize {
    match align {
        ColumnAlign::Center => 2,
        ColumnAlign::None => 0,
        ColumnAlign::Left | ColumnAlign::Right => 1,
    }
}

fn delimiter_cell(align: ColumnAlign, width: usize) -> String {
    let dashes = "-".repeat(width - colons(align));
    match align {
        ColumnAlign::Center => format!(":{dashes}:"),
        ColumnAlign::Left => format!(":{dashes}"),
        ColumnAlign::Right => format!("{dashes}:"),
        ColumnAlign::None => dashes,
    }
}

fn padded_cell(raw: &str, raw_width: usize, align: ColumnAlign, width: usize) -> String {
    let gap = width.saturating_sub(raw_width);
    match align {
        ColumnAlign::Right => format!("{}{raw}", " ".repeat(gap)),
        ColumnAlign::Center => {
            let left = gap / 2;
            format!("{}{raw}{}", " ".repeat(left), " ".repeat(gap - left))
        }
        ColumnAlign::Left | ColumnAlign::None => format!("{raw}{}", " ".repeat(gap)),
    }
}

/// Pad a table's source so its pipes line up. Unlike [`pad_row`] and
/// [`pad_row_splice`], it aligns columns and never adds cells.
///
/// `table` is only the table's lines: header, delimiter row and body rows,
/// with no container prefix (`> `, list indent), as for [`read_table`]. It
/// may end in a line break. `pad_table` does not find where a table ends. It
/// stops at a blank line or a line indented 4 or more columns, which GFM
/// reads as a code block, and keeps that line and the ones after it as they
/// are. A heading or fence right after the last row would be read as a row,
/// so the caller passes the table alone.
///
/// Each row is written `| a | b |`, its cells padded to the column width:
/// the display width ([`display_width`]) of the column's widest cell, and at
/// least 3 plus the column's alignment colons. Wide characters and emoji
/// count as 2 columns. A left-aligned or unaligned cell is padded on the
/// right, a right-aligned one on the left, and a centered one on both sides,
/// the odd space on the right. The delimiter row is dashes the width of the
/// column, alignment colons kept. Cell text is kept as written, escapes
/// included. A row keeps its number of cells, and every row takes the
/// header's 0-3 leading spaces.
///
/// The output matches rumdl's MD060 rule in its "aligned" style, except:
///
/// - A cell wider than `max_column_width` does not widen its column.
/// - A table already aligned with extra padding is narrowed. MD060 keeps it.
/// - The header's leading spaces are kept. MD060 drops them.
/// - An unescaped pipe in a code span ends the cell, by the GFM rule. MD060
///   leaves such a table as is.
///
/// Returned unchanged:
///
/// - text that is not a table;
/// - a table with a zero-width space, joiner, non-joiner or word joiner,
///   whose width depends on the terminal, as MD060 does;
/// - a table with a pipe after an even run of backslashes, such as `\\|`.
///   This crate reads the run as escaped backslashes and the pipe as a cell
///   end, but GitHub keeps the pipe in the cell, so padding could change what
///   GitHub shows.
///
/// Padding a padded table changes nothing.
///
/// [`pad_row`]: crate::pad_row
/// [`pad_row_splice`]: crate::pad_row_splice
pub fn pad_table(table: &str, options: &PadTableOptions) -> String {
    let max = options
        .max_column_width
        .map_or(usize::MAX, NonZeroUsize::get);
    let parts = js::split_lines(table);
    let end = parts
        .iter()
        .position(|(line, _)| js::trim(line).is_empty() || is_code_indent(line))
        .unwrap_or(parts.len());
    let lines: Vec<&str> = parts[..end].iter().map(|(line, _)| *line).collect();
    if lines.iter().any(|line| has_unmeasured(line)) {
        return table.to_owned();
    }
    let after_backslash = |line: &str| {
        row_pipes(line, 0)
            .iter()
            .any(|&pipe| pipe > 0 && line.as_bytes()[pipe - 1] == b'\\')
    };
    if lines.iter().any(|line| after_backslash(line)) {
        return table.to_owned();
    }
    let Some(data) = read_table(&lines) else {
        return table.to_owned();
    };

    // The rows in line order; `None` is the delimiter row.
    let mut rows = vec![Some(&data.header), None];
    rows.extend(data.rows.iter().map(Some));
    let cell_widths: Vec<Option<Vec<usize>>> = rows
        .iter()
        .map(|row| row.map(|cells| cells.iter().map(|c| display_width(&c.raw)).collect()))
        .collect();
    let mut widths: Vec<usize> = Vec::new();
    for row in cell_widths.iter().flatten() {
        for (i, &width) in row.iter().enumerate() {
            if i == widths.len() {
                widths.push(MIN_WIDTH);
            }
            widths[i] = widths[i].max(if width <= max { width } else { 0 });
        }
    }
    for (i, &align) in data.align.iter().enumerate() {
        widths[i] = widths[i].max(MIN_WIDTH + colons(align));
    }

    let align_of = |i: usize| data.align.get(i).copied().unwrap_or_default();
    let indent = indent(lines[0]);
    let mut out = String::with_capacity(table.len());
    for (r, (line, brk)) in parts.iter().enumerate() {
        let cells: Option<Vec<String>> = rows.get(r).map(|row| match row {
            Some(cells) => cells
                .iter()
                .enumerate()
                .map(|(i, cell)| {
                    let raw_width = cell_widths[r].as_ref().map_or(0, |w| w[i]);
                    padded_cell(&cell.raw, raw_width, align_of(i), widths[i])
                })
                .collect(),
            None => data
                .align
                .iter()
                .enumerate()
                .map(|(i, &align)| delimiter_cell(align, widths[i]))
                .collect(),
        });
        match cells {
            // A line with no cells, such as a lone pipe, stays as it is.
            Some(cells) if !cells.is_empty() => {
                out.push_str(indent);
                out.push_str(&row_line_text(&cells).text);
            }
            _ => out.push_str(line),
        }
        out.push_str(brk);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pads_the_readme_table() {
        assert_eq!(
            pad_table(
                "| a | b |\n|:-|--:|\n| long cell | 1 |",
                &PadTableOptions::default()
            ),
            "| a         |    b |\n| :-------- | ---: |\n| long cell |    1 |"
        );
    }

    #[test]
    fn caps_a_column() {
        let options = PadTableOptions {
            max_column_width: NonZeroUsize::new(4),
        };
        assert_eq!(
            pad_table("| a |\n|-|\n| long cell |", &options),
            "| a   |\n| --- |\n| long cell |"
        );
    }
}
