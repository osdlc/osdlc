//! One table line read into pipes and cells. Positions are absolute byte
//! offsets: a line read at `base` reports offsets from `base`, so a caller
//! can pass one line of a larger document and use the result against the
//! document.

use std::ops::Range;

use crate::js;

/// A column's alignment, from its delimiter-row cell.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum ColumnAlign {
    /// No colon: `---`.
    #[default]
    None,
    /// A colon on the left: `:--`.
    Left,
    /// Colons on both sides: `:-:`.
    Center,
    /// A colon on the right: `--:`.
    Right,
}

impl ColumnAlign {
    /// The alignment's name: `none`, `left`, `center` or `right`, as the
    /// TypeScript twin spells it.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Left => "left",
            Self::Center => "center",
            Self::Right => "right",
        }
    }
}

/// One cell: the region between pipes, and its trimmed content span.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TableCellSpan {
    /// Offset of the cell's first byte, just after its opening pipe.
    pub from: usize,
    /// Offset just past the cell, at its closing pipe or the line end.
    pub to: usize,
    /// Content without its space padding. An empty cell's content is an
    /// empty range.
    pub content: Range<usize>,
}

/// One table line (header, body row, or the delimiter row) and its cells.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct TableRowSpan {
    /// Offset of the line start (`base`).
    pub from: usize,
    /// Offset of the line end.
    pub to: usize,
    /// Positions of the row's pipes, each one byte wide.
    pub pipes: Vec<usize>,
    /// The row's cells, in order.
    pub cells: Vec<TableCellSpan>,
}

/// A row with no pipes and no cells, for a caller that needs a placeholder.
///
/// Experimental: any release may change or remove it.
pub const EMPTY_ROW: TableRowSpan = TableRowSpan {
    from: 0,
    to: 0,
    pipes: Vec::new(),
    cells: Vec::new(),
};

fn cell_from_region(text: &str, from: usize, to: usize) -> TableCellSpan {
    let start = text.len() - text.trim_start_matches(' ').len();
    let end = text.trim_end_matches(' ').len().max(start);
    if start == end {
        // Empty cell: the content point sits just past the first pad space, if any.
        let at = from + text.len().min(1);
        return TableCellSpan {
            from,
            to,
            content: at..at,
        };
    }
    TableCellSpan {
        from,
        to,
        content: from + start..from + end,
    }
}

/// Whether `prefix` is 0 to 3 spaces, the indent before a row's opening pipe.
pub(crate) fn is_row_indent(prefix: &str) -> bool {
    prefix.len() <= 3 && prefix.bytes().all(|b| b == b' ')
}

/// Cell regions of a row line given its pipe positions (each one byte wide,
/// absolute, so `pipes[i] - base` indexes `line`). Use it when the pipes come
/// from elsewhere, such as a parser's syntax tree. [`split_row`] finds them
/// itself.
pub fn row_from_pipes(line: &str, base: usize, pipes: &[usize]) -> TableRowSpan {
    let from = base;
    let to = base + line.len();
    let region = |start: usize, end: usize| {
        cell_from_region(
            js::slice(line, start.saturating_sub(base), end.saturating_sub(base)),
            start,
            end,
        )
    };
    let mut cells = Vec::new();
    let mut cursor = from;
    let mut saw_pipe = false;
    for &pipe in pipes {
        // A first pipe at the row start, or after 0-3 spaces, opens the row
        // rather than closing a cell.
        let opens = !saw_pipe && is_row_indent(js::slice(line, 0, pipe.saturating_sub(base)));
        if !opens && (pipe > cursor || (saw_pipe && pipe == cursor)) {
            cells.push(region(cursor, pipe));
        }
        cursor = pipe + 1;
        saw_pipe = true;
    }
    // Whitespace after the closing pipe is no cell.
    if cursor < to && !js::trim(js::slice(line, cursor.saturating_sub(base), line.len())).is_empty()
    {
        cells.push(region(cursor, to));
    }
    TableRowSpan {
        from,
        to,
        pipes: pipes.to_vec(),
        cells,
    }
}

/// Pipe positions in `line`, offset by `base`. A backslash escapes the next
/// character.
pub fn row_pipes(line: &str, base: usize) -> Vec<usize> {
    let mut pipes = Vec::new();
    let mut escaped = false;
    for (i, b) in line.bytes().enumerate() {
        if b == b'|' && !escaped {
            pipes.push(base + i);
        }
        // A backslash escapes the next character, which may be several
        // bytes long; its continuation bytes clear the flag, as the
        // character itself would.
        escaped = !escaped && b == b'\\';
    }
    pipes
}

/// Read one table line into pipes and cells, by the GFM splitting rule.
pub fn split_row(line: &str, base: usize) -> TableRowSpan {
    row_from_pipes(line, base, &row_pipes(line, base))
}

/// A delimiter-row cell's alignment: `:--` left, `--:` right, `:-:` center.
pub fn parse_align(spec: &str) -> ColumnAlign {
    let colon_left = spec.starts_with(':');
    let colon_right = spec.ends_with(':') && spec.len() > 1;
    match (colon_left, colon_right) {
        (true, true) => ColumnAlign::Center,
        (false, true) => ColumnAlign::Right,
        (true, false) => ColumnAlign::Left,
        (false, false) => ColumnAlign::None,
    }
}

/// Whether `spec` is `:?-+:?`.
fn is_delimiter_cell(spec: &str) -> bool {
    let inner = spec.strip_prefix(':').unwrap_or(spec);
    let inner = inner.strip_suffix(':').unwrap_or(inner);
    !inner.is_empty() && inner.bytes().all(|b| b == b'-')
}

/// Whether `line` is a delimiter row: a pipe, and cells that are each
/// `:?-+:?`.
pub fn is_delimiter_row(line: &str) -> bool {
    let row = split_row(line, 0);
    if row.pipes.is_empty() || row.cells.is_empty() {
        return false;
    }
    row.cells
        .iter()
        .all(|cell| is_delimiter_cell(js::trim(&line[cell.content.clone()])))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contents<'a>(line: &'a str, row: &TableRowSpan, base: usize) -> Vec<&'a str> {
        row.cells
            .iter()
            .map(|c| &line[c.content.start - base..c.content.end - base])
            .collect()
    }

    #[test]
    fn a_padded_row() {
        let row = split_row("| a | b |", 0);
        assert_eq!(row.pipes, [0, 4, 8]);
        assert_eq!(
            row.cells,
            [
                TableCellSpan {
                    from: 1,
                    to: 4,
                    content: 2..3
                },
                TableCellSpan {
                    from: 5,
                    to: 8,
                    content: 6..7
                },
            ]
        );
    }

    #[test]
    fn offsets_are_bytes() {
        let line = "| é | b |";
        let row = split_row(line, 0);
        assert_eq!(row.pipes, [0, 5, 9]);
        assert_eq!(contents(line, &row, 0), ["é", "b"]);
    }

    #[test]
    fn an_escape_before_a_multibyte_character_ends_there() {
        let line = "| \\é| b |";
        assert_eq!(contents(line, &split_row(line, 0), 0), ["\\é", "b"]);
    }

    #[test]
    fn from_pipes_at_base() {
        let line = "| a | b |";
        let row = row_from_pipes(line, 3, &[3, 11]);
        assert_eq!(contents(line, &row, 3), ["a | b"]);
    }

    #[test]
    fn delimiter_rows() {
        assert!(is_delimiter_row("| --- | :-: |"));
        assert!(!is_delimiter_row("| : |"));
        assert!(!is_delimiter_row("| - - |"));
        assert_eq!(EMPTY_ROW, TableRowSpan::default());
    }
}
