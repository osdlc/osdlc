//! Delimited text files (CSV, TSV, semicolon and pipe separated) read
//! tolerantly. [`grid_from_csv`](crate::grid_from_csv) rejects a whole file
//! over one bad quote. This reader keeps reading and reports each problem by
//! line. Plain strings in and out. Typing the cells is the caller's job.
//!
//! Every item here is experimental: any release may change or remove it.

use std::collections::HashSet;

use crate::js;

/// One of the delimiters [`sniff_delimiter`] chooses between.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Delimiter {
    /// `,`
    Comma,
    /// A tab.
    Tab,
    /// `;`
    Semicolon,
    /// `|`
    Pipe,
}

/// The delimiters [`sniff_delimiter`] chooses between, in tie-break order.
///
/// Experimental: any release may change or remove it.
pub const DELIMITERS: [Delimiter; 4] = [
    Delimiter::Comma,
    Delimiter::Tab,
    Delimiter::Semicolon,
    Delimiter::Pipe,
];

impl Delimiter {
    /// The delimiter character.
    pub fn as_char(self) -> char {
        match self {
            Self::Comma => ',',
            Self::Tab => '\t',
            Self::Semicolon => ';',
            Self::Pipe => '|',
        }
    }

    /// A name for the delimiter, for messages and pickers: `comma`, `tab`,
    /// `semicolon` or `pipe`. The TypeScript twin's `DELIMITER_NAMES`.
    pub fn name(self) -> &'static str {
        match self {
            Self::Comma => "comma",
            Self::Tab => "tab",
            Self::Semicolon => "semicolon",
            Self::Pipe => "pipe",
        }
    }

    /// The delimiter for `c`, if it is one of [`DELIMITERS`].
    pub fn from_char(c: char) -> Option<Self> {
        DELIMITERS.into_iter().find(|d| d.as_char() == c)
    }
}

/// A problem reading the file, at a 1-based line.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DelimitedIssue {
    /// 1-based line of the problem.
    pub line: usize,
    /// What went wrong and what the reader did about it.
    pub message: String,
}

/// Where one field sits in the source, as byte offsets. A quoted field's
/// span includes its quotes, so replacing the span replaces the whole field.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct DelimitedFieldSpan {
    /// Offset of the field's first byte (its opening quote, if quoted).
    pub from: usize,
    /// Offset just past the field's last byte.
    pub to: usize,
    /// Whether the field is exactly one quoted string: its quotes closed and
    /// no text follows the closing quote (`"a"b` is not quoted).
    pub quoted: bool,
}

/// One record as written: fields untrimmed, not padded to the header.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DelimitedRecord {
    /// The record's fields, untrimmed.
    pub fields: Vec<String>,
    /// Each field's place in the source, one per field.
    pub spans: Vec<DelimitedFieldSpan>,
    /// 1-based line the record starts on.
    pub line: usize,
    /// Offset of the record's first byte.
    pub from: usize,
    /// Offset just past the record's last field, before its line break.
    pub to: usize,
    /// Offset just past the record's line break; `to` when it has none.
    pub end: usize,
    /// The first problem reading this record, if any.
    pub issue: Option<String>,
}

/// A line break as a file writes it.
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum DelimitedLineEnding {
    /// `\r\n`
    CrLf,
    /// `\n`, the default for a file with no line break.
    #[default]
    Lf,
    /// `\r`
    Cr,
}

impl DelimitedLineEnding {
    /// The line break's text.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CrLf => "\r\n",
            Self::Lf => "\n",
            Self::Cr => "\r",
        }
    }
}

/// Records and problems from [`parse_delimited`].
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DelimitedParse {
    /// The records, blank lines skipped.
    pub records: Vec<DelimitedRecord>,
    /// Every problem, in the order found.
    pub issues: Vec<DelimitedIssue>,
    /// The first record's line break; [`DelimitedLineEnding::Lf`] when no
    /// record has one.
    pub line_ending: DelimitedLineEnding,
    /// Whether the text starts with a byte order mark.
    pub bom: bool,
}

/// A file read by [`read_delimited`].
///
/// Experimental: any release may change or remove it.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub struct DelimitedRead {
    /// The delimiter used, given or sniffed.
    pub delimiter: Delimiter,
    /// The header cells, or `None` when the first record is data.
    pub header: Option<Vec<String>>,
    /// The header as a record, with its spans; `None` when there is no
    /// header.
    pub header_record: Option<DelimitedRecord>,
    /// Body records, after the header.
    pub rows: Vec<DelimitedRecord>,
    /// The widest of the header and every row.
    pub width: usize,
    /// Every problem, by line.
    pub issues: Vec<DelimitedIssue>,
    /// The first record's line break; [`DelimitedLineEnding::Lf`] when no
    /// record has one.
    pub line_ending: DelimitedLineEnding,
    /// Whether the text starts with a byte order mark.
    pub bom: bool,
}

/// Count a delimiter per line outside quotes, over the first `max_lines`
/// lines.
fn delimiter_counts(text: &str, delim: u8, max_lines: usize) -> Vec<usize> {
    let mut counts = Vec::new();
    let mut n = 0;
    let mut quoted = false;
    for b in text.bytes() {
        if counts.len() >= max_lines {
            break;
        }
        if b == b'"' {
            quoted = !quoted;
        } else if !quoted && b == delim {
            n += 1;
        } else if !quoted && b == b'\n' {
            counts.push(n);
            n = 0;
        }
    }
    if n > 0 {
        counts.push(n);
    }
    counts
}

/// The delimiter whose per-line count over the first 20 lines is most
/// consistent and non-zero. Ties go to the order of [`DELIMITERS`], so comma
/// wins. Text with none of them reads as comma.
///
/// Experimental: any release may change or remove it.
pub fn sniff_delimiter(text: &str) -> Delimiter {
    let mut best = Delimiter::Comma;
    let mut best_score = None;
    for d in DELIMITERS {
        let counts: Vec<usize> = delimiter_counts(text, d.as_char() as u8, 20)
            .into_iter()
            .filter(|&c| c > 0)
            .collect();
        if counts.is_empty() {
            continue;
        }
        // Each count and how often it is seen, in first-seen order, so the
        // first of two equally common counts is the mode.
        let mut freq: Vec<(usize, usize)> = Vec::new();
        for c in counts {
            match freq.iter_mut().find(|(count, _)| *count == c) {
                Some((_, seen)) => *seen += 1,
                None => freq.push((c, 1)),
            }
        }
        let (mut mode, mut hits) = (0, 0);
        for (count, seen) in freq {
            if seen > hits {
                mode = count;
                hits = seen;
            }
        }
        let score = hits * 10 + mode.min(9);
        if best_score.is_none_or(|b| score > b) {
            best = d;
            best_score = Some(score);
        }
    }
    best
}

/// The closing quote of a quoted field, skipping `""`; `None` past 50 line
/// breaks or the end.
fn find_closing_quote(bytes: &[u8], from: usize) -> Option<usize> {
    let mut breaks = 0;
    let mut i = from;
    while i < bytes.len() {
        match bytes[i] {
            b'\n' => {
                breaks += 1;
                if breaks > 50 {
                    return None;
                }
            }
            b'"' if bytes.get(i + 1) == Some(&b'"') => i += 1,
            b'"' => return Some(i),
            _ => {}
        }
        i += 1;
    }
    None
}

fn count_breaks(bytes: &[u8], from: usize, to: usize) -> usize {
    bytes[from.min(to)..to]
        .iter()
        .filter(|&&b| b == b'\n')
        .count()
}

/// Parse RFC 4180 records, tolerant of bad input. A leading BOM is dropped.
/// A quoted field may hold delimiters, `""` and line breaks. An unclosed
/// quote is read as literal text up to the next delimiter or line end. Text
/// after a closing quote is kept. Blank lines add no record; a line holding
/// only `""` is a record of one empty field. Records end at CRLF, LF or CR.
/// Each record carries the byte offsets of its fields, so a caller can
/// rewrite one field without touching the rest of the text.
///
/// The TypeScript twin takes the delimiter as a string and compares it with
/// one UTF-16 unit of the text at a time, so a delimiter outside the Basic
/// Multilingual Plane never matches there; here any `char` does.
///
/// Experimental: any release may change or remove it.
pub fn parse_delimited(text: &str, delimiter: char) -> DelimitedParse {
    let mut buf = [0; 4];
    let delim: &[u8] = delimiter.encode_utf8(&mut buf).as_bytes();
    let bytes = text.as_bytes();
    let len = bytes.len();
    let at_delim = |i: usize| bytes[i.min(len)..].starts_with(delim);
    let is_end = |i: usize| i >= len || at_delim(i) || bytes[i] == b'\n' || bytes[i] == b'\r';
    let next_break_or_delim = |from: usize| {
        let mut i = from;
        while !is_end(i) {
            i += 1;
        }
        i
    };

    let mut records = Vec::new();
    let mut issues = Vec::new();
    let mut line_ending = None;
    let bom = text.starts_with('\u{feff}');
    let mut i = if bom { '\u{feff}'.len_utf8() } else { 0 };
    let mut line = 1;
    while i < len {
        let mut fields = Vec::new();
        let mut spans = Vec::new();
        let start = line;
        let from = i;
        let mut issue: Option<String> = None;
        let mut report = |line: usize, message: &str, issues: &mut Vec<DelimitedIssue>| {
            issues.push(DelimitedIssue {
                line,
                message: message.to_owned(),
            });
            issue.get_or_insert_with(|| message.to_owned());
        };
        loop {
            let field: String;
            let field_from = i;
            let mut quoted = false;
            if bytes.get(i) == Some(&b'"') {
                let mut close = find_closing_quote(bytes, i + 1);
                // A quote that closes on a later line and is not followed by
                // a delimiter or a line end was never closed where it opened.
                if let Some(c) = close
                    && count_breaks(bytes, i, c) > 0
                    && !is_end(c + 1)
                {
                    close = None;
                }
                match close {
                    None => {
                        report(line, "Unclosed quote; read as text", &mut issues);
                        let end = next_break_or_delim(i);
                        field = text[i..end].to_owned();
                        i = end;
                    }
                    Some(close) => {
                        line += count_breaks(bytes, i + 1, close);
                        let mut f = text[i + 1..close].replace("\"\"", "\"");
                        i = close + 1;
                        quoted = true;
                        if !is_end(i) {
                            quoted = false;
                            let end = next_break_or_delim(i);
                            report(
                                line,
                                "Text after a closing quote; kept as written",
                                &mut issues,
                            );
                            f.push_str(&text[i..end]);
                            i = end;
                        }
                        field = f;
                    }
                }
            } else {
                let end = next_break_or_delim(i);
                field = text[i..end].to_owned();
                i = end;
            }
            fields.push(field);
            spans.push(DelimitedFieldSpan {
                from: field_from,
                to: i,
                quoted,
            });
            if i < len && at_delim(i) {
                i += delim.len();
                continue;
            }
            break;
        }
        let to = i;
        if bytes.get(i) == Some(&b'\r') {
            i += 1;
        }
        if bytes.get(i) == Some(&b'\n') {
            i += 1;
        }
        line += 1;
        if to == from {
            continue;
        }
        if line_ending.is_none() {
            line_ending = match &bytes[to..i] {
                b"\r\n" => Some(DelimitedLineEnding::CrLf),
                b"\n" => Some(DelimitedLineEnding::Lf),
                b"\r" => Some(DelimitedLineEnding::Cr),
                _ => None,
            };
        }
        records.push(DelimitedRecord {
            fields,
            spans,
            line: start,
            from,
            to,
            end: i,
            issue,
        });
    }
    DelimitedParse {
        records,
        issues,
        line_ending: line_ending.unwrap_or_default(),
        bom,
    }
}

/// Whether `s` is a number as the TypeScript twin's pattern reads one:
/// `^[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$`,
/// with ASCII digits.
fn is_number(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = usize::from(matches!(b.first(), Some(b'-' | b'+')));
    let digits = |from: usize| b[from..].iter().take_while(|c| c.is_ascii_digit()).count();
    // The integer part is the run of digits and commas: the pattern's next
    // character is a `.`, an `e` or the end, so no shorter part matches.
    let int_len = b[i..]
        .iter()
        .take_while(|&&c| c.is_ascii_digit() || c == b',')
        .count();
    let int = &b[i..i + int_len];
    if int_len > 0 {
        let mut groups = int.split(|&c| c == b',');
        let first = groups.next().unwrap_or_default();
        let plain = !int.contains(&b',');
        let grouped = (1..=3).contains(&first.len()) && groups.all(|g| g.len() == 3);
        if !plain && !grouped {
            return false;
        }
        i += int_len;
        if b.get(i) == Some(&b'.') {
            let n = digits(i + 1);
            if n == 0 {
                return false;
            }
            i += 1 + n;
        }
    } else {
        if b.get(i) != Some(&b'.') {
            return false;
        }
        let n = digits(i + 1);
        if n == 0 {
            return false;
        }
        i += 1 + n;
    }
    if matches!(b.get(i), Some(b'e' | b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'-' | b'+')) {
            i += 1;
        }
        let n = digits(i);
        if n == 0 {
            return false;
        }
        i += n;
    }
    i == b.len()
}

/// The first record is a header when its cells are non-empty, unique and
/// not numbers. A file of one such record is a header with no rows. An
/// empty record is not a header; pass `&[]` where the TypeScript twin takes
/// `undefined`.
///
/// Experimental: any release may change or remove it.
pub fn looks_like_header<S: AsRef<str>>(first: &[S]) -> bool {
    if first.is_empty() {
        return false;
    }
    let cells: Vec<&str> = first.iter().map(|s| js::trim(s.as_ref())).collect();
    if cells.iter().any(|s| s.is_empty()) {
        return false;
    }
    if cells.iter().collect::<HashSet<_>>().len() != cells.len() {
        return false;
    }
    !cells.iter().any(|s| is_number(s))
}

/// Options for [`read_delimited`].
///
/// Experimental: any release may change or remove it. `#[non_exhaustive]`:
/// build it with [`ReadDelimitedOptions::new`] and its `with_*` methods.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub struct ReadDelimitedOptions {
    /// The delimiter to use; skips sniffing.
    pub delimiter: Option<Delimiter>,
    /// Whether the first record is a header; skips header detection.
    pub header: Option<bool>,
}

impl ReadDelimitedOptions {
    /// The defaults: sniff the delimiter and detect a header.
    pub const fn new() -> Self {
        Self {
            delimiter: None,
            header: None,
        }
    }

    /// These options with `delimiter`, skipping sniffing.
    #[must_use]
    pub const fn with_delimiter(mut self, delimiter: Delimiter) -> Self {
        self.delimiter = Some(delimiter);
        self
    }

    /// These options with the first record a header or not, skipping header
    /// detection.
    #[must_use]
    pub const fn with_header(mut self, header: bool) -> Self {
        self.header = Some(header);
        self
    }
}

/// Read a delimited file: sniff the delimiter, detect a header, parse
/// tolerantly. A row whose field count differs from the header's (or, with
/// no header, the widest row's) is reported as an issue on its line and kept
/// as written: short rows are not padded, long rows keep their extra fields.
///
/// Experimental: any release may change or remove it.
pub fn read_delimited(text: &str, options: &ReadDelimitedOptions) -> DelimitedRead {
    let delimiter = options.delimiter.unwrap_or_else(|| sniff_delimiter(text));
    let DelimitedParse {
        mut records,
        mut issues,
        line_ending,
        bom,
    } = parse_delimited(text, delimiter.as_char());
    let wants_header = options
        .header
        .unwrap_or_else(|| looks_like_header(records.first().map_or(&[][..], |r| &r.fields[..])));
    let header_record = if wants_header && !records.is_empty() {
        Some(records.remove(0))
    } else {
        None
    };
    let header = header_record.as_ref().map(|r| r.fields.clone());
    let mut rows = records;
    let width = rows
        .iter()
        .map(|r| r.fields.len())
        .chain(header.as_ref().map(Vec::len))
        .max()
        .unwrap_or(0);
    let expected = header.as_ref().map_or(width, Vec::len);
    let mut added = false;
    for r in &mut rows {
        if r.issue.is_some() || r.fields.len() == expected {
            continue;
        }
        let which = if header.is_some() {
            "header has"
        } else {
            "widest row has"
        };
        let message = format!("{} fields, {which} {expected}", r.fields.len());
        issues.push(DelimitedIssue {
            line: r.line,
            message: message.clone(),
        });
        r.issue = Some(message);
        added = true;
    }
    if added {
        issues.sort_by_key(|issue| issue.line);
    }
    DelimitedRead {
        delimiter,
        header,
        header_record,
        rows,
        width,
        issues,
        line_ending,
        bom,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers() {
        for s in ["1", "-1.5", "+.5", "1,234", "12,345,678.9", "1e5", "2.5E-3"] {
            assert!(is_number(s), "{s}");
        }
        for s in [
            "", "-", "1.", "1,23", "1234,567", ",123", "1e", "a", ".", "1,,234",
        ] {
            assert!(!is_number(s), "{s}");
        }
    }

    #[test]
    fn the_readme_file() {
        let file = read_delimited(
            "name;qty\napple;3\npear\n",
            &ReadDelimitedOptions::default(),
        );
        assert_eq!(file.delimiter, Delimiter::Semicolon);
        assert_eq!(file.header, Some(vec!["name".to_owned(), "qty".to_owned()]));
        assert_eq!(
            file.issues,
            [DelimitedIssue {
                line: 3,
                message: "1 fields, header has 2".to_owned()
            }]
        );
    }
}
