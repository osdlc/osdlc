//! Small helpers that read text as the TypeScript twin does, so both give the
//! same answer for the same input.

/// Whitespace as JavaScript's `String.prototype.trim` reads it. That is
/// Rust's `char::is_whitespace` without U+0085 NEXT LINE, plus U+FEFF ZERO
/// WIDTH NO-BREAK SPACE (the byte order mark).
pub(crate) fn is_space(c: char) -> bool {
    c == '\u{feff}' || (c != '\u{85}' && c.is_whitespace())
}

/// `s` trimmed as JavaScript's `String.prototype.trim` trims it.
pub(crate) fn trim(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// `s[from..to]` clamped to `s`, as JavaScript's `slice` clamps. A bound
/// that falls inside a character gives an empty string rather than a panic.
pub(crate) fn slice(s: &str, from: usize, to: usize) -> &str {
    let to = to.min(s.len());
    let from = from.min(to);
    s.get(from..to).unwrap_or("")
}

/// Every line of `text` and the break after it: CRLF, LF or CR. The last
/// line has an empty break.
pub(crate) fn split_lines(text: &str) -> Vec<(&str, &str)> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        let len = match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => 2,
            b'\r' | b'\n' => 1,
            _ => {
                i += 1;
                continue;
            }
        };
        out.push((&text[start..i], &text[i..i + len]));
        i += len;
        start = i;
    }
    out.push((&text[start..], ""));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_matches_javascript() {
        assert_eq!(trim("\u{feff} a \u{3000}"), "a");
        assert_eq!(trim("\u{85}a\u{85}"), "\u{85}a\u{85}");
        assert_eq!(trim("\t\r\n a \u{2028}"), "a");
    }

    #[test]
    fn split_lines_keeps_each_break() {
        assert_eq!(
            split_lines("a\r\nb\rc\n"),
            vec![("a", "\r\n"), ("b", "\r"), ("c", "\n"), ("", "")]
        );
        assert_eq!(split_lines(""), vec![("", "")]);
    }

    #[test]
    fn slice_clamps() {
        assert_eq!(slice("abc", 1, 9), "bc");
        assert_eq!(slice("abc", 5, 2), "");
        assert_eq!(slice("é", 1, 2), "");
    }
}
