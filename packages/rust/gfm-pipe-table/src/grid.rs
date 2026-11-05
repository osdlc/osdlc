//! Grids of cell texts and their clipboard formats: TSV and CSV text, and an
//! HTML table. Strings only. Reading HTML back needs a DOM and is left to the
//! caller.
//!
//! Functions that read a grid take any slice of rows, each row anything that
//! is a slice of strings: `&[Vec<String>]`, `&[[&str; 2]]`, `&[&[&str]]`.

use crate::js;

/// Cell texts by row, every row the same length.
pub type CellGrid = Vec<Vec<String>>;

/// Inclusive cell bounds of a range.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct CellRect {
    /// First row.
    pub top: usize,
    /// First column.
    pub left: usize,
    /// Last row.
    pub bottom: usize,
    /// Last column.
    pub right: usize,
}

fn owned_row<S: AsRef<str>>(row: &[S]) -> Vec<String> {
    row.iter().map(|cell| cell.as_ref().to_owned()).collect()
}

/// Pad ragged rows to the widest; `None` for an empty grid (no rows, or no
/// cells in any row).
pub fn rectangular<R, S>(rows: &[R]) -> Option<CellGrid>
where
    R: AsRef<[S]>,
    S: AsRef<str>,
{
    let width = rows.iter().map(|row| row.as_ref().len()).max().unwrap_or(0);
    if width == 0 {
        return None;
    }
    Some(
        rows.iter()
            .map(|row| pad_row(row.as_ref(), width))
            .collect(),
    )
}

/// A copy of `cells` padded with empty cells to `width`; a longer row keeps
/// its cells.
pub fn pad_row<S: AsRef<str>>(cells: &[S], width: usize) -> Vec<String> {
    let mut row = owned_row(cells);
    if row.len() < width {
        row.resize(width, String::new());
    }
    row
}

/// Clipboard text split on any line break (CRLF, LF or CR). One trailing
/// break adds no line.
pub fn clipboard_lines(text: &str) -> Vec<&str> {
    let mut lines: Vec<&str> = js::split_lines(text)
        .into_iter()
        .map(|(line, _)| line)
        .collect();
    if lines.len() > 1 && lines.last() == Some(&"") {
        lines.pop();
    }
    lines
}

/// Tab-separated text: the same tab count on every line, and some line with
/// two non-empty cells. Tab-indented code (`\tfoo()`) has one non-empty cell
/// per line, so it stays text. Cells are trimmed.
pub fn grid_from_tsv(text: &str) -> Option<CellGrid> {
    let lines = clipboard_lines(text);
    if !lines.iter().any(|line| line.contains('\t')) {
        return None;
    }
    let width = lines[0].split('\t').count();
    let rows: CellGrid = lines
        .iter()
        .map(|line| {
            line.split('\t')
                .map(|cell| js::trim(cell).to_owned())
                .collect()
        })
        .collect::<Vec<Vec<String>>>();
    if !rows.iter().all(|row| row.len() == width) {
        return None;
    }
    rows.iter()
        .any(|row| row.iter().filter(|cell| !cell.is_empty()).count() >= 2)
        .then_some(rows)
}

/// TSV of cell texts. Tabs and line breaks inside a cell become spaces, one
/// per character (CRLF is two).
pub fn tsv_from_grid<R, S>(grid: &[R]) -> String
where
    R: AsRef<[S]>,
    S: AsRef<str>,
{
    grid.iter()
        .map(|row| {
            row.as_ref()
                .iter()
                .map(|cell| cell.as_ref().replace(['\t', '\r', '\n'], " "))
                .collect::<Vec<_>>()
                .join("\t")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// RFC 4180 CSV: `"` doubled inside a quoted field, CRLF between records.
/// CRLF because that is what the RFC says and what a spreadsheet expects on
/// paste. A field is quoted when it holds a comma, a quote or a line break.
pub fn to_csv<R, S>(rows: &[R]) -> String
where
    R: AsRef<[S]>,
    S: AsRef<str>,
{
    rows.iter()
        .map(|row| {
            row.as_ref()
                .iter()
                .map(|field| {
                    let field = field.as_ref();
                    if field.contains(['"', ',', '\r', '\n']) {
                        format!("\"{}\"", field.replace('"', "\"\""))
                    } else {
                        field.to_owned()
                    }
                })
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect::<Vec<_>>()
        .join("\r\n")
}

fn is_field_end(b: u8) -> bool {
    matches!(b, b',' | b'\r' | b'\n')
}

/// Parse RFC 4180 CSV into records, as written: rows keep their own field
/// count and fields are not trimmed. A quoted field may hold commas, `""`
/// quotes and line breaks. Records end at CRLF, LF or CR. One trailing break
/// adds no record. A quote inside an unquoted field is literal. `None` for
/// empty text, or when a quoted field is unterminated or followed by
/// anything other than a comma or a line break.
pub fn grid_from_csv(text: &str) -> Option<Vec<Vec<String>>> {
    if text.is_empty() {
        return None;
    }
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut i = 0;
    loop {
        let mut field = String::new();
        if bytes.get(i) == Some(&b'"') {
            i += 1;
            loop {
                if i >= len {
                    return None;
                }
                let quote = i + text[i..].find('"')?;
                field.push_str(&text[i..quote]);
                i = quote + 1;
                if bytes.get(i) != Some(&b'"') {
                    break;
                }
                field.push('"');
                i += 1;
            }
            if i < len && !is_field_end(bytes[i]) {
                return None;
            }
        } else {
            let start = i;
            while i < len && !is_field_end(bytes[i]) {
                i += 1;
            }
            field.push_str(&text[start..i]);
        }
        row.push(field);
        if bytes.get(i) == Some(&b',') {
            i += 1;
            continue;
        }
        rows.push(std::mem::take(&mut row));
        if i >= len {
            break;
        }
        i += if bytes[i] == b'\r' && bytes.get(i + 1) == Some(&b'\n') {
            2
        } else {
            1
        };
        if i >= len {
            break;
        }
    }
    Some(rows)
}

/// Whether `text` has a line break other than CRLF: an LF with no CR before
/// it, or a CR with no LF after it.
fn has_bare_break(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.iter().enumerate().any(|(i, &b)| match b {
        b'\n' => i == 0 || bytes[i - 1] != b'\r',
        b'\r' => bytes.get(i + 1) != Some(&b'\n'),
        _ => false,
    })
}

/// CSV text that reads as a table when pasted: CRLF between every record (as
/// [`to_csv`] writes). Any bare LF or CR anywhere, quoted fields included,
/// rejects the text as code or prose. It also needs two or more records of
/// one width, at least two fields wide, and no field with outer whitespace.
/// Prose writes `a, b`, so it stays text.
pub fn grid_from_csv_paste(text: &str) -> Option<CellGrid> {
    if !text.contains("\r\n") || has_bare_break(text) {
        return None;
    }
    let rows = grid_from_csv(text)?;
    if rows.len() < 2 {
        return None;
    }
    let width = rows[0].len();
    if width < 2 || !rows.iter().all(|row| row.len() == width) {
        return None;
    }
    rows.iter()
        .all(|row| row.iter().all(|cell| cell == js::trim(cell)))
        .then_some(rows)
}

/// Attribute on copied HTML cells: the cell's markdown text.
pub const CELL_SOURCE_ATTR: &str = "data-markdown-cell";

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// An HTML table of the shown cell texts, each cell also carrying its
/// markdown in [`CELL_SOURCE_ATTR`] so a paste back keeps it. A cell missing
/// from `source` carries its shown text. `header` makes the first row `th`.
pub fn html_from_grid<R, S, Q, T>(shown: &[R], source: &[Q], header: bool) -> String
where
    R: AsRef<[S]>,
    S: AsRef<str>,
    Q: AsRef<[T]>,
    T: AsRef<str>,
{
    let mut out = String::from("<table>");
    for (r, row) in shown.iter().enumerate() {
        let tag = if header && r == 0 { "th" } else { "td" };
        out.push_str("<tr>");
        for (c, text) in row.as_ref().iter().enumerate() {
            let text = text.as_ref();
            let markdown = source
                .get(r)
                .and_then(|row| row.as_ref().get(c))
                .map_or(text, AsRef::as_ref);
            out.push_str(&format!(
                "<{tag} {CELL_SOURCE_ATTR}=\"{}\">{}</{tag}>",
                escape_html(markdown),
                escape_html(text)
            ));
        }
        out.push_str("</tr>");
    }
    out.push_str("</table>");
    out
}

/// The cells a pasted grid covers, from [`paste_rect`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PasteRect<'a> {
    /// The cells the paste covers.
    pub rect: CellRect,
    grid: &'a [Vec<String>],
    fill: bool,
}

impl<'a> PasteRect<'a> {
    /// The text pasted into the cell at `row`, `col`: the grid's cell there,
    /// or the one cell when it fills a range. Empty outside the grid.
    pub fn value(&self, row: usize, col: usize) -> &'a str {
        let (r, c) = if self.fill {
            (0, 0)
        } else {
            match (
                row.checked_sub(self.rect.top),
                col.checked_sub(self.rect.left),
            ) {
                (Some(r), Some(c)) => (r, c),
                _ => return "",
            }
        };
        self.grid
            .get(r)
            .and_then(|cells| cells.get(c))
            .map_or("", String::as_str)
    }
}

/// The cells a pasted grid covers: the grid's size, starting at `row`,
/// `col`. A one-cell grid pasted with a `range` fills the whole range.
/// Otherwise `range` is ignored. The grid's size is its row count and the
/// length of its first row.
///
/// `None` when the grid covers no cell: no rows, or an empty first row. The
/// TypeScript twin returns a rectangle with `bottom` above `top` or `right`
/// left of `left` there.
pub fn paste_rect(
    grid: &[Vec<String>],
    row: usize,
    col: usize,
    range: Option<CellRect>,
) -> Option<PasteRect<'_>> {
    let height = grid.len();
    let width = grid.first()?.len();
    if let Some(range) = range.filter(|_| height == 1 && width == 1) {
        return Some(PasteRect {
            rect: range,
            grid,
            fill: true,
        });
    }
    if width == 0 {
        return None;
    }
    Some(PasteRect {
        rect: CellRect {
            top: row,
            left: col,
            bottom: row + height - 1,
            right: col + width - 1,
        },
        grid,
        fill: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_round_trip() {
        let grid = [["a,b", "c\"d"], ["e\r\nf", "g"]];
        let csv = to_csv(&grid);
        assert_eq!(csv, "\"a,b\",\"c\"\"d\"\r\n\"e\r\nf\",g");
        assert_eq!(grid_from_csv(&csv).unwrap(), grid);
    }

    #[test]
    fn paste_values() {
        let grid = vec![vec!["a".to_owned(), "b".to_owned()]];
        let paste = paste_rect(&grid, 2, 3, None).unwrap();
        assert_eq!(
            paste.rect,
            CellRect {
                top: 2,
                left: 3,
                bottom: 2,
                right: 4
            }
        );
        assert_eq!(paste.value(2, 4), "b");
        assert_eq!(paste.value(1, 4), "");
        assert!(paste_rect(&[], 0, 0, None).is_none());
    }
}
