//! Inline `#tag` lexing for Markdown note bodies, in three dialects.
//!
//! Note-taking tools disagree on what an inline tag is. This crate implements
//! three readings and keeps them apart, because none is a superset of another:
//!
//! | | [`TagDialect::Obsidian`] | [`TagDialect::Unicode`] | [`TagDialect::Ascii`] |
//! |---|---|---|---|
//! | pattern | `(^\|[\s(])#([\p{Alphabetic}\p{N}_/-]*[\p{Alphabetic}_/-][\p{Alphabetic}\p{N}_/-]*)` | `(?:^\|\s)#([\p{Alphabetic}\p{N}_/-]+)` | `(^\|[\s(])#([A-Za-z_][A-Za-z0-9_/-]*)` |
//! | alphabet | any Unicode alphabetic char or number | any Unicode alphabetic char or number | ASCII only |
//! | must hold | one char that is not a number | anything | a letter or `_` first |
//! | preceded by | start, whitespace or `(` | start or whitespace | start, whitespace or `(` |
//! | code spans and fences | blanked first | **scanned** | blanked first |
//! | link destinations, reference definitions | blanked first | scanned | scanned |
//!
//! [`TagDialect::Obsidian`] is the default. It is the rule of a renderer
//! that reads the syntax tree (`@osdlc/markdown-render`), applied to the source text. Its pattern is
//! a JavaScript regex, so its `\s` is JavaScript's: it counts U+FEFF and not
//! U+0085. The other two dialects use [`char::is_whitespace`], which is the
//! other way round.
//!
//! The renderer reads the syntax tree, so a source scan differs from it in
//! these ways, which the conformance suite keeps in its `renderer_only`
//! section. A `#` right after
//! inline markup (`**bold**#tag`) or a decoded entity (`a&nbsp;#tag`) is a tag
//! there and not here. Link text is never a tag there.
//!
//! Link and image destinations and reference definitions are not text to the
//! renderer either, so `Obsidian` blanks them after code: `[see](#section)` and
//! `[x]: #def` give no tag. `Unicode` and `Ascii` scan them as before.
//!
//! Each row changes the output on real notes:
//!
//! | note text | Obsidian | Unicode | Ascii |
//! |---|---|---|---|
//! | `#2024-review` | `2024-review` | `2024-review` | — (digit start) |
//! | `#2024` | — (all digits) | `2024` | — (digit start) |
//! | `#santé` | `santé` | `santé` | `sant` (ASCII cut) |
//! | `(#draft)` | `draft` | — (not preceded by space) | `draft` |
//! | ```` ```\n#nottag\n``` ```` | — (fence blanked) | `nottag` | — (fence blanked) |
//!
//! Pick per use: a reading surface that must show what Obsidian shows wants
//! `Obsidian`; a search index that must not lose non-ASCII or all-digit tags
//! wants `Unicode`; a link graph that must not grow nodes out of code samples
//! wants `Ascii`. [`extract_both`] runs `Unicode` and `Ascii` over one body.
//!
//! Code blanking is [`markdown_link::strip_code`], so links and tags agree on what
//! counts as code.
//!
//! The TypeScript twin is `@osdlc/markdown-tags`. Both run the shared
//! `markdown-tags` conformance suite, which gives every case's answer in all
//! three dialects.
//!
//! ```
//! use markdown_tags::{TagDialect, inline_tags};
//!
//! let body = "#santé and (#draft) #2024\n\n```\n#nottag\n```\n";
//! assert_eq!(inline_tags(body, TagDialect::Obsidian), vec!["santé", "draft"]);
//! assert_eq!(inline_tags(body, TagDialect::Unicode), vec!["santé", "2024", "nottag"]);
//! assert_eq!(inline_tags(body, TagDialect::Ascii), vec!["sant", "draft"]);
//! assert_eq!(TagDialect::default(), TagDialect::Obsidian);
//! assert_eq!("ascii".parse::<TagDialect>(), Ok(TagDialect::Ascii));
//! ```

use std::fmt;
use std::str::FromStr;

/// Which inline-tag dialect to scan with. Prints as and parses from
/// `obsidian`, `unicode` and `ascii`, so a setting value can name one.
///
/// Not exhaustive: a later release may add a dialect, so a `match` on it needs
/// a wildcard arm.
///
/// ```
/// use markdown_tags::TagDialect;
///
/// assert_eq!(TagDialect::default(), TagDialect::Obsidian);
/// assert_eq!(TagDialect::Ascii.to_string(), "ascii");
/// assert_eq!("unicode".parse::<TagDialect>(), Ok(TagDialect::Unicode));
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
#[non_exhaustive]
pub enum TagDialect {
    /// Obsidian's rule: Unicode alphabet, at least one char that is not a
    /// number, code and link destinations blanked first, `(` also opens a tag.
    #[default]
    Obsidian,
    /// Unicode alphabet, any first character in the class, code scanned,
    /// preceded by start-or-whitespace.
    Unicode,
    /// ASCII, letter/underscore-initial, code spans and fences blanked first,
    /// `(` also opens a tag.
    Ascii,
}

impl TagDialect {
    /// Every dialect, default first.
    ///
    /// ```
    /// use markdown_tags::TagDialect;
    ///
    /// assert_eq!(TagDialect::ALL[0], TagDialect::default());
    /// ```
    pub const ALL: [TagDialect; 3] = [TagDialect::Obsidian, TagDialect::Unicode, TagDialect::Ascii];

    /// The dialect's name: `obsidian`, `unicode` or `ascii`.
    ///
    /// ```
    /// use markdown_tags::TagDialect;
    ///
    /// assert_eq!(TagDialect::Obsidian.as_str(), "obsidian");
    /// ```
    pub fn as_str(self) -> &'static str {
        match self {
            TagDialect::Obsidian => "obsidian",
            TagDialect::Unicode => "unicode",
            TagDialect::Ascii => "ascii",
        }
    }

    fn rule(self) -> &'static Rule {
        match self {
            TagDialect::Obsidian => &OBSIDIAN,
            TagDialect::Unicode => &UNICODE,
            TagDialect::Ascii => &ASCII,
        }
    }
}

impl fmt::Display for TagDialect {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A string that names no [`TagDialect`]. [`TagDialect::from_str`] returns it
/// for any name that is not exactly `obsidian`, `unicode` or `ascii`; its
/// `Display` text names the accepted ones.
///
/// ```
/// use markdown_tags::TagDialect;
///
/// let err = "Unicode".parse::<TagDialect>().unwrap_err();
/// assert!(err.to_string().contains("expected obsidian, unicode or ascii"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseTagDialectError(String);

impl fmt::Display for ParseTagDialectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "unknown tag dialect {:?}: expected obsidian, unicode or ascii",
            self.0
        )
    }
}

impl std::error::Error for ParseTagDialectError {}

impl FromStr for TagDialect {
    type Err = ParseTagDialectError;

    /// Exact names only, so a setting written as `Unicode` fails loudly
    /// rather than meaning something.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        TagDialect::ALL
            .into_iter()
            .find(|d| d.as_str() == s)
            .ok_or_else(|| ParseTagDialectError(s.to_owned()))
    }
}

/// Inline `#tag`s in a body, in encounter order, per dialect.
///
/// Not deduplicated: callers dedupe at different points (some union with
/// frontmatter tags, some keep the first occurrence), and deduping here would
/// decide which duplicate wins for them.
///
/// ```
/// use markdown_tags::{TagDialect, inline_tags};
///
/// assert_eq!(inline_tags("#a #b `#c`", TagDialect::Obsidian), vec!["a", "b"]);
/// ```
pub fn inline_tags(body: &str, dialect: TagDialect) -> Vec<String> {
    match dialect {
        TagDialect::Obsidian => scan(
            &blank_link_syntax(&markdown_link::strip_code(body)),
            &OBSIDIAN,
        ),
        TagDialect::Unicode => scan(body, &UNICODE),
        TagDialect::Ascii => scan(&markdown_link::strip_code(body), &ASCII),
    }
}

/// The `Unicode` and `Ascii` dialects from one body: `(unicode, ascii)`.
/// A search index that keeps non-ASCII tags and a link graph that skips code
/// can read both in one call.
///
/// ```
/// use markdown_tags::extract_both;
///
/// let (unicode, ascii) = extract_both("#santé");
/// assert_eq!(unicode, vec!["santé"]);
/// assert_eq!(ascii, vec!["sant"]);
/// ```
pub fn extract_both(body: &str) -> (Vec<String>, Vec<String>) {
    (
        inline_tags(body, TagDialect::Unicode),
        inline_tags(body, TagDialect::Ascii),
    )
}

/// The tag whose `#` is at byte `index` of `text` under `dialect`, or `None`.
///
/// Applies the dialect's character rule only, with no code or link blanking,
/// for a caller that already holds plain text and reads code and links
/// itself. `None` when `index` is out of range or not on a character
/// boundary, when the byte there is not `#`, when the `#` follows a character
/// the dialect does not allow, or when the run fails the dialect's rule. The
/// TypeScript twin's `tagAt` takes a UTF-16 offset instead.
///
/// ```
/// use markdown_tags::{TagDialect, tag_at};
///
/// let text = "(#draft) #2024";
/// assert_eq!(tag_at(text, 1, TagDialect::Obsidian), Some("draft".to_owned()));
/// assert_eq!(tag_at(text, 9, TagDialect::Obsidian), None);
/// assert_eq!(tag_at(text, 9, TagDialect::Unicode), Some("2024".to_owned()));
/// ```
pub fn tag_at(text: &str, index: usize, dialect: TagDialect) -> Option<String> {
    let rule = dialect.rule();
    let after = text.get(index..)?.strip_prefix('#')?;
    if let Some(before) = text[..index].chars().next_back()
        && !(rule.opens_after)(before)
    {
        return None;
    }
    if !after.chars().next().is_some_and(rule.starts) {
        return None;
    }
    let end = after
        .char_indices()
        .skip(1)
        .find(|&(_, c)| !(rule.continues)(c))
        .map_or(after.len(), |(i, _)| i);
    let run = &after[..end];
    run.chars().any(rule.needs_one).then(|| run.to_owned())
}

/// One dialect's character tests.
struct Rule {
    /// A `#` after this character may open a tag.
    opens_after: fn(char) -> bool,
    /// The first character of a tag.
    starts: fn(char) -> bool,
    /// Every later character of a tag.
    continues: fn(char) -> bool,
    /// At least one character of the tag must pass this.
    needs_one: fn(char) -> bool,
}

const OBSIDIAN: Rule = Rule {
    opens_after: |c| is_js_space(c) || c == '(',
    starts: is_unicode_tag_char,
    continues: is_unicode_tag_char,
    needs_one: |c| c.is_alphabetic() || matches!(c, '_' | '/' | '-'),
};

const UNICODE: Rule = Rule {
    opens_after: char::is_whitespace,
    starts: is_unicode_tag_char,
    continues: is_unicode_tag_char,
    needs_one: |_| true,
};

const ASCII: Rule = Rule {
    opens_after: |c| c.is_whitespace() || c == '(',
    starts: |c| c.is_ascii_alphabetic() || c == '_',
    continues: |c| c.is_ascii_alphanumeric() || matches!(c, '_' | '/' | '-'),
    needs_one: |_| true,
};

/// Hand-rolled rather than `regex`, because the "preceded by" condition is a
/// lookbehind the crate does not support, and the JS workaround (capturing
/// the preceding char) silently drops adjacent matches like `#a #b` — the
/// consumed space stops the next match from seeing its own delimiter.
///
/// A tag is the longest run of tag characters after the `#`. A run that fails
/// `needs_one` is no tag; the run holds no `#`, so skipping past it misses
/// nothing.
fn scan(text: &str, rule: &Rule) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        let opens = chars[i] == '#'
            && i.checked_sub(1)
                .is_none_or(|p| (rule.opens_after)(chars[p]))
            && chars.get(i + 1).is_some_and(|&c| (rule.starts)(c));
        if !opens {
            i += 1;
            continue;
        }
        let mut j = i + 2;
        while j < chars.len() && (rule.continues)(chars[j]) {
            j += 1;
        }
        let run = &chars[i + 1..j];
        if run.iter().any(|&c| (rule.needs_one)(c)) {
            out.push(run.iter().collect());
        }
        i = j;
    }
    out
}

/// Blank, to spaces, what the renderer never reads as text: the inside of an
/// inline link's or image's `(destination "title")`, and the rest of a link
/// reference definition's line after its `]:`. Newlines and the char count are
/// kept. The TypeScript twin's `blankLinkSyntax` follows the same steps.
///
/// A source approximation of CommonMark, not a parser. A destination is the
/// balanced `(...)` right after a `]` that closes an open `[` in the same
/// paragraph. A definition is a line of up to three spaces, `[label]:`, where
/// the label does not start with `^` (a footnote, whose text is rendered),
/// and the line starts the text, follows a blank line or follows another
/// definition.
fn blank_link_syntax(text: &str) -> String {
    if !text.contains(']') {
        return text.to_owned();
    }
    let mut chars: Vec<char> = text.chars().collect();
    blank_destinations(&mut chars);
    blank_definitions(&mut chars);
    chars.into_iter().collect()
}

fn blank_destinations(chars: &mut [char]) {
    // Most bodies have no inline link; skip the per-char pair table for them.
    if !chars.windows(2).any(|w| w == [']', '(']) {
        return;
    }
    let closes = paren_closes(chars);
    let mut open = 0usize;
    let mut i = 0usize;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 1,
            '\n' if ends_paragraph(chars, i) => open = 0,
            '[' => open += 1,
            ']' if open > 0 => {
                open -= 1;
                if chars.get(i + 1) == Some(&'(')
                    && let Some(close) = closes[i + 1]
                {
                    blank(&mut chars[i + 2..close]);
                    i = close;
                }
            }
            _ => {}
        }
        i += 1;
    }
}

/// For each `(`, the `)` that balances it within its paragraph. One stack
/// pass, so a paragraph of unclosed `(` costs linear time, not quadratic.
fn paren_closes(chars: &[char]) -> Vec<Option<usize>> {
    let mut closes = vec![None; chars.len()];
    let mut stack = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 1,
            '\n' if ends_paragraph(chars, i) => stack.clear(),
            '(' => stack.push(i),
            ')' => {
                if let Some(open) = stack.pop() {
                    closes[open] = Some(i);
                }
            }
            _ => {}
        }
        i += 1;
    }
    closes
}

/// Whether the newline at `i` is followed by a blank line or the end.
fn ends_paragraph(chars: &[char], i: usize) -> bool {
    chars[i + 1..]
        .iter()
        .find(|&&c| c != ' ' && c != '\t')
        .is_none_or(|&c| c == '\n' || c == '\r')
}

fn blank_definitions(chars: &mut [char]) {
    let mut may_start = true;
    let mut start = 0usize;
    while start < chars.len() {
        let end = chars[start..]
            .iter()
            .position(|&c| c == '\n')
            .map_or(chars.len(), |p| start + p);
        let line = &chars[start..end];
        if line.iter().all(|c| c.is_whitespace()) {
            may_start = true;
        } else if let Some(colon) = definition_colon(line).filter(|_| may_start) {
            blank(&mut chars[start + colon + 1..end]);
        } else {
            may_start = false;
        }
        start = end + 1;
    }
}

/// The index of the `:` in a `[label]:` line, or `None` when the line is not
/// one.
fn definition_colon(line: &[char]) -> Option<usize> {
    let indent = line.iter().take_while(|&&c| c == ' ').count();
    if indent > 3 || line.get(indent) != Some(&'[') || line.get(indent + 1) == Some(&'^') {
        return None;
    }
    let mut j = indent + 1;
    let mut label = false;
    while j < line.len() {
        match line[j] {
            '\\' => j += 1,
            '[' => return None,
            ']' => break,
            c if !c.is_whitespace() => label = true,
            _ => {}
        }
        j += 1;
    }
    (label && line.get(j) == Some(&']') && line.get(j + 1) == Some(&':')).then_some(j + 1)
}

fn blank(chars: &mut [char]) {
    for c in chars.iter_mut().filter(|c| !matches!(c, '\n' | '\r')) {
        *c = ' ';
    }
}

/// `[\p{Alphabetic}\p{N}_/-]`. `is_alphanumeric` is exactly the two
/// properties.
fn is_unicode_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '/' | '-')
}

/// JavaScript's `\s`: Unicode `White_Space` without U+0085, plus U+FEFF.
fn is_js_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{FEFF}'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_is_obsidian() {
        assert_eq!(TagDialect::default(), TagDialect::Obsidian);
        assert_eq!(TagDialect::ALL[0], TagDialect::default());
    }

    #[test]
    fn a_dialect_round_trips_through_its_name() {
        for d in TagDialect::ALL {
            assert_eq!(d.to_string().parse::<TagDialect>(), Ok(d));
        }
        assert_eq!(
            ["obsidian", "unicode", "ascii"].map(|s| s.parse::<TagDialect>()),
            [
                Ok(TagDialect::Obsidian),
                Ok(TagDialect::Unicode),
                Ok(TagDialect::Ascii)
            ]
        );
    }

    #[test]
    fn a_wrong_name_does_not_parse() {
        for s in ["", "Obsidian", "UNICODE", " ascii", "gfm"] {
            assert!(s.parse::<TagDialect>().is_err(), "{s:?}");
        }
    }

    #[test]
    fn tag_at_reads_one_tag_by_the_dialect_rule() {
        let text = "(#draft) #2024 x#no";
        let at = |i, d| tag_at(text, i, d);
        assert_eq!(at(1, TagDialect::Obsidian).as_deref(), Some("draft"));
        assert_eq!(at(9, TagDialect::Obsidian), None);
        assert_eq!(at(9, TagDialect::Unicode).as_deref(), Some("2024"));
        assert_eq!(at(1, TagDialect::Unicode), None);
        assert_eq!(at(17, TagDialect::Obsidian), None);
        assert_eq!(at(0, TagDialect::Obsidian), None);
    }

    #[test]
    fn tag_at_refuses_a_bad_index() {
        // `é` is two bytes: index 2 is inside it.
        assert_eq!(tag_at("é#a", 2, TagDialect::Unicode), None);
        assert_eq!(tag_at("#a", 2, TagDialect::Unicode), None);
        assert_eq!(tag_at("#a", 99, TagDialect::Unicode), None);
        assert_eq!(tag_at("", 0, TagDialect::Unicode), None);
    }

    #[test]
    fn tag_at_does_not_blank_code_or_links() {
        assert_eq!(
            tag_at("` #code`", 2, TagDialect::Obsidian).as_deref(),
            Some("code")
        );
        assert_eq!(
            tag_at("[see](#section)", 6, TagDialect::Obsidian).as_deref(),
            Some("section")
        );
        assert!(inline_tags("[see](#section)", TagDialect::Obsidian).is_empty());
    }

    #[test]
    fn js_space_differs_from_char_whitespace_in_two_places() {
        assert!(is_js_space('\u{FEFF}') && !'\u{FEFF}'.is_whitespace());
        assert!(!is_js_space('\u{85}') && '\u{85}'.is_whitespace());
        for c in [' ', '\t', '\n', '\r', '\u{A0}', '\u{3000}'] {
            assert!(is_js_space(c), "{c:?}");
        }
    }

    #[test]
    fn parens_pair_within_a_paragraph() {
        let chars: Vec<char> = "(a(b)\\)c) (d\n\n)".chars().collect();
        let closes = paren_closes(&chars);
        assert_eq!((closes[0], closes[2], closes[10]), (Some(8), Some(4), None));
    }

    /// One paragraph of unclosed destinations. Matching each `(` by scanning
    /// forward made this quadratic: tens of seconds at the largest size. The
    /// bound is wide on purpose: it catches the shape of the cost, not a
    /// slowdown.
    #[test]
    fn blanking_is_linear_in_unclosed_destinations() {
        for n in [25_000, 50_000, 100_000] {
            let body = "[a](".repeat(n);
            let started = std::time::Instant::now();
            assert_eq!(blank_link_syntax(&body), body);
            let elapsed = started.elapsed();
            assert!(
                elapsed < std::time::Duration::from_secs(10),
                "{} KB took {elapsed:?}",
                body.len() / 1000
            );
        }
    }
}
