//! Byte splices for table structure: new row lines, and per-line cell
//! inserts and deletes. Each splice touches only its own bytes. Nothing else
//! on the line moves. A row is passed as its own text (`line`, starting at
//! `span.from`) beside its [`TableRowSpan`].

use crate::js;
use crate::row::{TableCellSpan, TableRowSpan};

/// A fresh row line and the byte offset of each cell's content in it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RowLine {
    /// The line, `| a | b |`.
    pub text: String,
    /// Byte offset in `text` of each cell's content start.
    pub offsets: Vec<usize>,
}

/// A fresh row line `| a | b |` and each cell's content-start offset.
pub fn row_line_text<S: AsRef<str>>(cells: &[S]) -> RowLine {
    let mut text = String::from("|");
    let mut offsets = Vec::with_capacity(cells.len());
    for cell in cells {
        text.push(' ');
        offsets.push(text.len());
        text.push_str(cell.as_ref());
        text.push_str(" |");
    }
    RowLine { text, offsets }
}

/// One change to a line: replace the bytes `from..to` with `insert`.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Change {
    /// Absolute offset where the change starts.
    pub from: usize,
    /// Absolute offset where it ends; equal to `from` for a pure insert.
    pub to: usize,
    /// The bytes to put there; empty for a pure delete.
    pub insert: String,
}

/// One line's splice, plus where the cursor lands if this is the cursor's
/// line.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct LineSplice {
    /// The change, or `None` when the line stays as it is.
    pub change: Option<Change>,
    /// Old-text position the cursor is anchored to.
    pub anchor: usize,
    /// The cursor's byte offset past the anchor, once the change is applied.
    pub offset: usize,
}

/// One table line and the text a new cell takes there.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct TableLine<'a> {
    /// The line's span.
    pub span: &'a TableRowSpan,
    /// The text of a new cell on this line: `---` on the delimiter row,
    /// empty elsewhere.
    pub filler: &'static str,
}

/// Every table line in document order with the text a new cell takes there.
/// `rows` is the header row and then the body rows; `delimiter` is the
/// delimiter row, which goes second.
///
/// Experimental: any release may change or remove it.
pub fn table_lines<'a>(
    rows: &'a [TableRowSpan],
    delimiter: Option<&'a TableRowSpan>,
) -> Vec<TableLine<'a>> {
    let mut lines = Vec::with_capacity(rows.len() + 1);
    if let Some(head) = rows.first() {
        lines.push(TableLine {
            span: head,
            filler: "",
        });
    }
    if let Some(span) = delimiter {
        lines.push(TableLine {
            span,
            filler: "---",
        });
    }
    for span in rows.iter().skip(1) {
        lines.push(TableLine { span, filler: "" });
    }
    lines
}

/// Whether a pipe closes the row after its last cell (a lone `|` counts).
///
/// Experimental: any release may change or remove it.
pub fn has_trailing_pipe(span: &TableRowSpan) -> bool {
    match (span.pipes.last(), span.cells.last()) {
        (None, _) => false,
        (Some(_), None) => true,
        (Some(&pipe), Some(last)) => pipe == last.to,
    }
}

fn cell_source<'a>(line: &'a str, span: &TableRowSpan, cell: &TableCellSpan) -> &'a str {
    js::slice(
        line,
        cell.from.saturating_sub(span.from),
        cell.to.saturating_sub(span.from),
    )
}

/// Bytes of a new cell next to `neighbour`: `filler` with one space per side
/// when the neighbouring cell is padded, bare when the row is compact
/// (`|x|y|`).
fn new_cell_text(
    line: &str,
    span: &TableRowSpan,
    neighbour: Option<&TableCellSpan>,
    filler: &str,
) -> String {
    let text = neighbour.map_or(" ", |cell| cell_source(line, span, cell));
    if text.starts_with(' ') || text.ends_with(' ') {
        format!(" {filler} ")
    } else {
        filler.to_owned()
    }
}

/// The length of the first character of `text`: where the cursor goes, past
/// one pad space or one filler character.
fn first_char_len(text: &str) -> usize {
    text.chars().next().map_or(0, char::len_utf8)
}

/// Splice an empty cell in so it becomes column `at` of this line.
///
/// Experimental: any release may change or remove it.
pub fn insert_cell_splice(line: &str, span: &TableRowSpan, at: usize, filler: &str) -> LineSplice {
    let cells = &span.cells;
    if let Some(cell) = cells.get(at) {
        let text = new_cell_text(line, span, Some(cell), filler);
        // A pipe before the first cell opened the row, indented 0-3 spaces or not.
        let first_from = cells.first().map_or(0, |c| c.from);
        let opened = span.pipes.first().is_some_and(|&p| p < first_from);
        if at > 0 || opened {
            // The new cell goes right after the pipe that opened `cell`.
            return LineSplice {
                offset: first_char_len(&text),
                change: Some(Change {
                    from: cell.from,
                    to: cell.from,
                    insert: format!("{text}|"),
                }),
                anchor: cell.from,
            };
        }
        // No opening pipe: an empty first cell needs one, so the splice supplies it.
        return LineSplice {
            offset: 1 + first_char_len(&text),
            change: Some(Change {
                from: span.from,
                to: span.from,
                insert: format!("|{text}|"),
            }),
            anchor: span.from,
        };
    }
    // Past the last cell: append one cell after the closing pipe. A row
    // without one cannot carry an empty trailing cell, so it stays as it is.
    let Some(&last_pipe) = span.pipes.last().filter(|_| has_trailing_pipe(span)) else {
        return LineSplice {
            change: None,
            anchor: span.to,
            offset: 0,
        };
    };
    let end = last_pipe + 1;
    let text = new_cell_text(line, span, cells.last(), filler);
    LineSplice {
        offset: first_char_len(&text),
        change: Some(Change {
            from: end,
            to: end,
            insert: format!("{text}|"),
        }),
        anchor: end,
    }
}

/// An insert that pads a short row, and each new cell's content offset in
/// it.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RowPad {
    /// Absolute offset to insert at.
    pub from: usize,
    /// The bytes to insert.
    pub insert: String,
    /// Byte offset in `insert` of each new cell's content.
    pub contents: Vec<usize>,
}

/// Pad a short row to `width` cells, appended after its last cell in the
/// row's own padding style. A row without a closing pipe gets one first: an
/// empty last cell needs a pipe after it. `None` when the row is wide
/// enough, or when the line has no pipe and no cell (it is not a row). The
/// TypeScript twin's `filler` defaults to `''`; pass `""` for the same.
///
/// Experimental: any release may change or remove it.
pub fn pad_row_splice(
    line: &str,
    span: &TableRowSpan,
    width: usize,
    filler: &str,
) -> Option<RowPad> {
    let missing = width.checked_sub(span.cells.len()).filter(|&m| m > 0)?;
    let append = insert_cell_splice(line, span, span.cells.len(), filler);
    let (from, cell, mut insert) = match append.change {
        Some(change) => (change.from, change.insert, String::new()),
        None => {
            // No trailing pipe. A line with a pipe and no cells has one, so
            // a line here with no cells has no pipe either: it is not a row.
            // The TypeScript twin throws a TypeError for it.
            let last = span.cells.last()?;
            let text = new_cell_text(line, span, Some(last), filler);
            let close = if text == filler || cell_source(line, span, last).ends_with(' ') {
                "|"
            } else {
                " |"
            };
            (last.to, format!("{text}|"), close.to_owned())
        }
    };
    let mut contents = Vec::with_capacity(missing);
    let pad = usize::from(cell.starts_with(' '));
    for _ in 0..missing {
        contents.push(insert.len() + pad);
        insert.push_str(&cell);
    }
    Some(RowPad {
        from,
        insert,
        contents,
    })
}

/// Splice column `col` out of this line: its bytes plus one adjacent pipe.
///
/// Experimental: any release may change or remove it.
pub fn delete_cell_splice(span: &TableRowSpan, col: usize) -> LineSplice {
    let cells = &span.cells;
    let Some(cell) = cells.get(col) else {
        // Ragged row with no such cell: untouched, cursor to its last cell.
        return LineSplice {
            change: None,
            anchor: cells.last().map_or(span.from, |c| c.content.start),
            offset: 0,
        };
    };
    // Remove the pipe after the cell. On an unclosed last cell, remove the one
    // before it instead, unless that is the row's opening pipe, which stays.
    let pipe_after = col + 1 < cells.len() || has_trailing_pipe(span);
    let change = if pipe_after {
        Change {
            from: cell.from,
            to: cell.to + 1,
            insert: String::new(),
        }
    } else {
        Change {
            from: if col > 0 { cell.from - 1 } else { cell.from },
            to: cell.to,
            insert: String::new(),
        }
    };
    let focus = cells
        .get(col + 1)
        .or_else(|| col.checked_sub(1).and_then(|c| cells.get(c)));
    LineSplice {
        change: Some(change),
        anchor: focus.map_or(span.from, |c| c.content.start),
        offset: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::row::split_row;

    fn apply(line: &str, change: Option<Change>) -> String {
        match change {
            None => line.to_owned(),
            Some(c) => format!("{}{}{}", &line[..c.from], c.insert, &line[c.to..]),
        }
    }

    #[test]
    fn inserts_and_deletes() {
        let at = |line: &str, col| {
            apply(
                line,
                insert_cell_splice(line, &split_row(line, 0), col, "").change,
            )
        };
        assert_eq!(at("| a | b |", 1), "| a |  | b |");
        assert_eq!(at("a | b", 0), "|  |a | b");
        assert_eq!(at("  | a |", 0), "  |  | a |");
        let del =
            |line: &str, col| apply(line, delete_cell_splice(&split_row(line, 0), col).change);
        assert_eq!(del("| a | b | c |", 1), "| a | c |");
        assert_eq!(del("| a | b", 1), "| a ");
    }

    #[test]
    fn pads_a_short_row() {
        let pad = |line: &str, width| {
            pad_row_splice(line, &split_row(line, 0), width, "")
                .map(|p| format!("{}{}{}", &line[..p.from], p.insert, &line[p.from..]))
        };
        assert_eq!(pad("| a |", 3).as_deref(), Some("| a |  |  |"));
        assert_eq!(pad("| a", 2).as_deref(), Some("| a |  |"));
        assert_eq!(pad("| a | b |", 2), None);
    }
}
