//! The text mapping between a table cell's source and its plain text. The
//! text shows an escaped pipe `\|` as `|`; every other byte maps one to one.
//! A pipe in the cell text therefore always follows an even run of
//! backslashes, or its source escape would itself be escaped and split the
//! cell.

use std::ops::Range;

use crate::js;

/// A cell's source as plain text.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct CellText {
    /// The cell's text, with `\|` read as `|`.
    pub text: String,
    /// Source byte offset of each text byte offset, plus one entry for the
    /// end: `offsets[text.len()]` is the source length.
    pub offsets: Vec<usize>,
}

/// Read a cell's source slice. A backslash escapes the next character, as in
/// the GFM row splitter, so `\|` reads as `|` and `\\` stays two characters.
/// Only the pipe escape is table-level. Other escapes are inline markdown and
/// stay in the text.
pub fn cell_text_from_source(source: &str) -> CellText {
    let bytes = source.as_bytes();
    let mut text = Vec::with_capacity(bytes.len());
    let mut offsets = Vec::with_capacity(bytes.len() + 1);
    let mut escaped = false;
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        offsets.push(i);
        if b == b'\\' && !escaped && bytes.get(i + 1) == Some(&b'|') {
            text.push(b'|');
            i += 2;
            continue;
        }
        text.push(b);
        escaped = !escaped && b == b'\\';
        i += 1;
    }
    offsets.push(bytes.len());
    // Only an ASCII `\|` pair was replaced, by an ASCII `|`, so the bytes are
    // still UTF-8.
    let text = String::from_utf8(text).expect("cell text stays UTF-8");
    CellText { text, offsets }
}

/// `text` with every line break (CRLF, LF or CR) as `with`.
fn replace_breaks(text: &str, with: &str) -> String {
    js::split_lines(text)
        .into_iter()
        .map(|(line, brk)| {
            if brk.is_empty() {
                line.to_owned()
            } else {
                format!("{line}{with}")
            }
        })
        .collect()
}

/// Source bytes for text typed into a cell: pipes escaped, line breaks as
/// spaces.
pub fn escape_cell_insert(text: &str) -> String {
    replace_breaks(text, " ").replace('|', "\\|")
}

/// One change from [`literal_pipe_fixes`]: replace `from..to` with `insert`.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PipeFix {
    /// Byte offset where the change starts, in the text.
    pub from: usize,
    /// Byte offset where the change ends; equal to `from` for an insert.
    pub to: usize,
    /// The bytes to put there: one backslash, or nothing.
    pub insert: String,
}

/// Changes, in `text` byte offsets and sorted, that keep every pipe in
/// `text` a literal pipe: each pipe must follow an even run of backslashes.
/// A pipe after an odd run gets one more backslash when an edit inserted
/// into that run or the pipe (`inserted`, byte ranges in `text`), and loses
/// one otherwise (a deleted backslash takes its pair with it).
pub fn literal_pipe_fixes(text: &str, inserted: &[Range<usize>]) -> Vec<PipeFix> {
    let mut fixes = Vec::new();
    let mut run = 0;
    for (i, b) in text.bytes().enumerate() {
        if b == b'|' && run % 2 == 1 {
            let start = i - run;
            let typed = inserted.iter().any(|r| r.start <= i && r.end > start);
            fixes.push(if typed {
                PipeFix {
                    from: i,
                    to: i,
                    insert: "\\".to_owned(),
                }
            } else {
                PipeFix {
                    from: i - 1,
                    to: i,
                    insert: String::new(),
                }
            });
        }
        run = if b == b'\\' { run + 1 } else { 0 };
    }
    fixes
}

/// Tabs and line breaks as spaces, trimmed. CRLF is one space.
fn flat_cell(text: &str) -> String {
    js::trim(&replace_breaks(text, " ").replace('\t', " ")).to_owned()
}

/// Source bytes for a whole cell written at once: trimmed, tabs and line
/// breaks as spaces, every pipe literal. A pipe after an odd run of
/// backslashes gets one more first, as when typed.
pub fn escape_cell(text: &str) -> String {
    let flat = flat_cell(text);
    let mut fixed = String::with_capacity(flat.len());
    let mut at = 0;
    for fix in literal_pipe_fixes(&flat, std::slice::from_ref(&(0..flat.len()))) {
        fixed.push_str(&flat[at..fix.from]);
        fixed.push_str(&fix.insert);
        at = fix.to;
    }
    fixed.push_str(&flat[at..]);
    escape_cell_insert(&fixed)
}

/// Source bytes for a cell shown inside a backtick code span. A code span has
/// no backslash escapes, and the table only turns `\|` into `|`, so only
/// pipes are escaped and backslashes stay as they are. A pipe after an odd run
/// of backslashes is already escaped by that run. It shows without its last
/// backslash, since no source shows `\|` in a code span.
pub fn escape_code_cell(text: &str) -> String {
    let flat = flat_cell(text);
    let mut out = String::with_capacity(flat.len());
    let mut run = 0;
    for ch in flat.chars() {
        if ch == '|' && run % 2 == 0 {
            out.push_str("\\|");
        } else {
            out.push(ch);
        }
        run = if ch == '\\' { run + 1 } else { 0 };
    }
    out
}

/// True when `source` ends in an odd run of backslashes. Written directly
/// before a cell's closing pipe, that run would escape the pipe and merge the
/// cell with the next one, so writers put a pad space between them.
pub fn ends_with_escape(source: &str) -> bool {
    let run = source.bytes().rev().take_while(|&b| b == b'\\').count();
    run % 2 == 1
}

/// Source offset (relative to the cell text start) of a text position, both
/// in bytes. A position past the end gives the source length.
pub fn source_offset(cell: &CellText, pos: usize) -> usize {
    let last = cell.offsets.len().saturating_sub(1);
    cell.offsets.get(pos.min(last)).copied().unwrap_or(0)
}

/// Text position of a source offset, both in bytes; inside an escape it
/// rounds down.
pub fn text_offset(cell: &CellText, offset: usize) -> usize {
    cell.offsets.iter().rposition(|&o| o <= offset).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_are_bytes() {
        let cell = cell_text_from_source("é\\|x");
        assert_eq!(cell.text, "é|x");
        assert_eq!(cell.offsets, [0, 1, 2, 4, 5]);
        assert_eq!(source_offset(&cell, 3), 4);
        assert_eq!(text_offset(&cell, 3), 2);
    }

    #[test]
    fn escapes() {
        assert_eq!(escape_cell(" a|b\r\nc "), "a\\|b c");
        assert_eq!(escape_code_cell("a\\|b"), "a\\|b");
        assert!(ends_with_escape("a\\"));
        assert!(!ends_with_escape("a\\\\"));
    }
}
