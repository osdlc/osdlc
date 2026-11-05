//! Edits to a delimited file as byte changes. Each change touches only the
//! bytes it must, so a file keeps its delimiter, line endings, byte order
//! mark and the quoting of every field the edit does not reach. Pass the
//! [`DelimitedRead`] of the current text. After applying a change, read the
//! new text with [`reread_delimited`], which keeps the delimiter and header
//! decision: a fresh [`read_delimited`] sniffs again, and clearing a header
//! cell would turn the header into a row.
//!
//! No edit leaves a line that reads as blank. The reader skips blank lines,
//! so a record whose only field is empty is written `""`.
//!
//! Every item here is experimental: any release may change or remove it.

use std::fmt;

use crate::cell_text::TextChange;
use crate::delimited::{DelimitedRead, DelimitedRecord, ReadDelimitedOptions, read_delimited};

/// How a record of one empty field is written, so it does not read as a
/// blank line.
const EMPTY_RECORD: &str = "\"\"";

/// A field as the file must write it, with each `"` doubled inside quotes.
///
/// `always_quote` quotes even when the value does not need it, as for a
/// field that was quoted before. Otherwise the value is quoted only when it
/// holds the delimiter, a quote or a line break.
///
/// Experimental: any release may change or remove it.
pub fn quote_delimited_field(value: &str, delimiter: char, always_quote: bool) -> String {
    let needs = value.contains(delimiter) || value.contains(['"', '\r', '\n']);
    if !always_quote && !needs {
        return value.to_owned();
    }
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// A record as one line of text, without its line break. A record of no
/// fields, or one empty field, is `""`, so it reads back as a record.
///
/// Experimental: any release may change or remove it.
pub fn delimited_record_text<S: AsRef<str>>(fields: &[S], delimiter: char) -> String {
    match fields {
        [] => return EMPTY_RECORD.to_owned(),
        [only] if only.as_ref().is_empty() => return EMPTY_RECORD.to_owned(),
        _ => {}
    }
    let mut out = String::new();
    for (i, f) in fields.iter().enumerate() {
        if i > 0 {
            out.push(delimiter);
        }
        out.push_str(&quote_delimited_field(f.as_ref(), delimiter, false));
    }
    out
}

/// Read text produced by an edit the way `read` was read: same delimiter,
/// same header decision.
///
/// Experimental: any release may change or remove it.
pub fn reread_delimited(text: &str, read: &DelimitedRead) -> DelimitedRead {
    let options = ReadDelimitedOptions::new()
        .with_delimiter(read.delimiter)
        .with_header(read.header_record.is_some());
    read_delimited(text, &options)
}

/// The header, then the body rows, in file order.
fn all_records(read: &DelimitedRead) -> impl Iterator<Item = (bool, &DelimitedRecord)> {
    let header = read.header_record.iter().map(|r| (true, r));
    header.chain(read.rows.iter().map(|r| (false, r)))
}

/// Set field `column` of `record` to `value`. The field keeps its quotes if
/// it had them. A short record gets empty fields up to `column`, so editing
/// a padding cell of a ragged row fills the row out.
///
/// Experimental: any release may change or remove it.
pub fn set_delimited_field(
    read: &DelimitedRead,
    record: &DelimitedRecord,
    column: usize,
    value: &str,
) -> TextChange {
    let delimiter = read.delimiter.as_char();
    if let Some(span) = record.spans.get(column) {
        let lone = record.spans.len() == 1 && value.is_empty();
        return TextChange {
            from: span.from,
            to: span.to,
            insert: quote_delimited_field(value, delimiter, span.quoted || lone),
        };
    }
    let missing = column - record.spans.len() + 1;
    let mut insert: String = std::iter::repeat_n(delimiter, missing).collect();
    insert.push_str(&quote_delimited_field(value, delimiter, false));
    TextChange {
        from: record.to,
        to: record.to,
        insert,
    }
}

/// Insert a body row so it becomes row `at` (0 is the first row after the
/// header; `read.rows.len()` or more appends). The new line uses the file's
/// line ending. Appending keeps the file's trailing line break, or its lack
/// of one. An empty `fields` needs its type spelled out:
/// `&[] as &[&str]`.
///
/// Experimental: any release may change or remove it.
pub fn insert_delimited_row<S: AsRef<str>>(
    read: &DelimitedRead,
    at: usize,
    fields: &[S],
) -> TextChange {
    let line = delimited_record_text(fields, read.delimiter.as_char());
    let eol = read.line_ending.as_str();
    let insert_at = |from: usize, insert: String| TextChange {
        from,
        to: from,
        insert,
    };
    if let Some(before) = read.rows.get(at) {
        return insert_at(before.from, line + eol);
    }
    match all_records(read).last() {
        None => {
            let start = if read.bom { '\u{feff}'.len_utf8() } else { 0 };
            insert_at(start, line + eol)
        }
        Some((_, last)) if last.end > last.to => insert_at(last.end, line + eol),
        Some((_, last)) => insert_at(last.to, format!("{eol}{line}")),
    }
}

/// Delete body row `index` with its line break. The last line of a file with
/// no trailing break takes the break before it instead. `None` when there is
/// no such row.
///
/// Experimental: any release may change or remove it.
pub fn delete_delimited_row(read: &DelimitedRead, index: usize) -> Option<TextChange> {
    let row = read.rows.get(index)?;
    if row.end > row.to {
        return Some(TextChange {
            from: row.from,
            to: row.end,
            insert: String::new(),
        });
    }
    let prev = match index {
        0 => read.header_record.as_ref(),
        _ => read.rows.get(index - 1),
    };
    Some(TextChange {
        from: prev.map_or(row.from, |p| p.to),
        to: row.to,
        insert: String::new(),
    })
}

/// Insert a column so it becomes column `at` in every record that reaches
/// it. The header's new cell is `header`; body cells are empty. A record
/// shorter than `at` is left as it is. Changes are in file order.
///
/// Experimental: any release may change or remove it.
pub fn insert_delimited_column(read: &DelimitedRead, at: usize, header: &str) -> Vec<TextChange> {
    let delimiter = read.delimiter.as_char();
    let mut changes = Vec::new();
    for (is_header, record) in all_records(read) {
        let text = quote_delimited_field(if is_header { header } else { "" }, delimiter, false);
        if let Some(span) = record.spans.get(at) {
            changes.push(TextChange {
                from: span.from,
                to: span.from,
                insert: format!("{text}{delimiter}"),
            });
        } else if at == record.spans.len() {
            changes.push(TextChange {
                from: record.to,
                to: record.to,
                insert: format!("{delimiter}{text}"),
            });
        }
    }
    changes
}

/// Delete column `column` from every record that has it, with one of its
/// delimiters. A record left with one empty field, or none, is written `""`,
/// so it stays a record. Changes are in file order.
///
/// Experimental: any release may change or remove it.
pub fn delete_delimited_column(read: &DelimitedRead, column: usize) -> Vec<TextChange> {
    let mut changes = Vec::new();
    for (_, record) in all_records(read) {
        let spans = &record.spans;
        let Some(span) = spans.get(column) else {
            continue;
        };
        let (from, to, insert) = if spans.len() == 1 {
            (span.from, span.to, EMPTY_RECORD)
        } else {
            let kept = spans[if column == 0 { 1 } else { 0 }];
            if spans.len() == 2 && kept.from == kept.to {
                (record.from, record.to, EMPTY_RECORD)
            } else if column < spans.len() - 1 {
                (span.from, spans[column + 1].from, "")
            } else {
                (spans[column - 1].to, span.to, "")
            }
        };
        changes.push(TextChange {
            from,
            to,
            insert: insert.to_owned(),
        });
    }
    changes
}

/// [`apply_delimited_changes`] was given two changes that overlap.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct OverlappingChanges {
    /// Where the later change starts, inside the earlier one.
    pub at: usize,
}

impl fmt::Display for OverlappingChanges {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "overlapping changes at {}", self.at)
    }
}

impl std::error::Error for OverlappingChanges {}

/// Apply changes to the text they were made against. Changes must not
/// overlap. They are applied by offset, whatever order they come in, except
/// that inserts at the same offset are applied in the order given: insert the
/// one that should come first first. Filling the last row's padding cell and
/// appending a row both insert at that row's end, for example. Pass one
/// change as
/// `std::slice::from_ref(&change)`.
///
/// # Errors
///
/// [`OverlappingChanges`] when one change starts inside another.
///
/// # Panics
///
/// When a change's offsets are past the end of `text` or not on a character
/// boundary, as slicing a `str` does.
///
/// Experimental: any release may change or remove it.
pub fn apply_delimited_changes(
    text: &str,
    changes: &[TextChange],
) -> Result<String, OverlappingChanges> {
    let mut list: Vec<&TextChange> = changes.iter().collect();
    list.sort_by_key(|c| (c.from, c.to));
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    for c in list {
        if c.from < at {
            return Err(OverlappingChanges { at: c.from });
        }
        out.push_str(&text[at..c.from]);
        out.push_str(&c.insert);
        at = c.to;
    }
    out.push_str(&text[at..]);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_field(text: &str, row: usize, col: usize, value: &str) -> String {
        let read = read_delimited(text, &ReadDelimitedOptions::new());
        let change = set_delimited_field(&read, &read.rows[row], col, value);
        apply_delimited_changes(text, &[change]).unwrap()
    }

    #[test]
    fn set_keeps_crlf_bom_and_quoting() {
        let text = "\u{feff}\"a\",b\r\n\"1\",\"2\"\r\n";
        assert_eq!(
            set_field(text, 0, 1, "z"),
            "\u{feff}\"a\",b\r\n\"1\",\"z\"\r\n"
        );
    }

    #[test]
    fn set_reads_back_wide_text() {
        for v in ["", " padded ", "a,b", "\"", "x\r\ny", "ünï", "tab\there"] {
            let out = set_field("h1,h2\n1,2\n", 0, 1, v);
            let options = ReadDelimitedOptions::new()
                .with_header(true)
                .with_delimiter(crate::Delimiter::Comma);
            assert_eq!(read_delimited(&out, &options).rows[0].fields[1], v);
        }
    }

    #[test]
    fn overlaps_are_refused() {
        let change = |from, to| TextChange {
            from,
            to,
            insert: String::new(),
        };
        assert_eq!(
            apply_delimited_changes("abc", &[change(0, 2), change(1, 3)]),
            Err(OverlappingChanges { at: 1 })
        );
    }
}
